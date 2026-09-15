import { env } from 'cloudflare:workers';

import { ensureDatabase } from '@/db/bootstrap';
import { requireMembership } from '@/lib/auth';
import { careAgentRecords, loadCareSnapshot } from '@/lib/care-context';
import {
  AppError,
  enforceRateLimit,
  errorResponse,
  recordError,
} from '@/lib/guardrails';
import { deterministicHandover, generateHandoverBrief } from '@/lib/llm-agent';

export const runtime = 'edge';

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let recipientId = '';
  try {
    await ensureDatabase(env.DB);
    const auth = await requireMembership(env.DB, request, env.AUTH_PUBLIC_URL);
    if ('error' in auth) return auth.error;
    const body = (await request.json()) as { recipientId?: unknown };
    recipientId = typeof body.recipientId === 'string' ? body.recipientId : '';
    if (!recipientId)
      throw new AppError('recipient_required', 400, 'Choose a care recipient.');

    const access = await env.DB.prepare(
      "SELECT r.display_name name,c.status consent FROM recipient_members rm JOIN care_recipients r ON r.id=rm.recipient_id LEFT JOIN consent_records c ON c.recipient_id=r.id WHERE rm.member_id=? AND rm.recipient_id=? AND r.status='active'",
    )
      .bind(auth.member.memberId, recipientId)
      .first<{ name: string; consent: string }>();
    if (!access)
      throw new AppError(
        'forbidden',
        403,
        'You do not have access to this care recipient.',
      );
    if (access.consent !== 'active')
      throw new AppError(
        'consent_inactive',
        409,
        'Restore consent before generating a handover.',
      );

    await enforceRateLimit(env.DB, auth.member.id, 'handover_generate');
    const snapshot = await loadCareSnapshot(env.DB, recipientId);
    const recipientName = snapshot.profile.preferred_name || access.name;
    const generated = await generateHandoverBrief(
      env,
      recipientName,
      careAgentRecords(snapshot),
    );
    const brief =
      generated?.value ?? deterministicHandover(snapshot, recipientName);
    const source = generated?.model ?? 'deterministic fallback';
    await env.DB.prepare('INSERT INTO audit_entries VALUES (?,?,?,?,?,?,?,?)')
      .bind(
        crypto.randomUUID(),
        auth.member.id,
        auth.member.email,
        'generate',
        'handover',
        recipientId,
        `Generated with ${source}; ${brief.evidence.length} scoped evidence records`,
        new Date().toISOString(),
      )
      .run();
    return Response.json(
      { brief },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    await ensureDatabase(env.DB);
    await recordError(env.DB, {
      requestId,
      route: '/api/handover',
      action: 'generate',
      errorCode: error instanceof AppError ? error.code : 'unhandled',
      recipientId,
    });
    return errorResponse(error, requestId);
  }
}
