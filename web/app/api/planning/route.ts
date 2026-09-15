import { recipientLease } from '@/lib/recipient-lease';
import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/bootstrap';
import { requireMembership } from '@/lib/auth';
import {
  AppError,
  enforceRateLimit,
  errorResponse,
  recordError,
} from '@/lib/guardrails';
import { loadPlanning, planningAction } from '@/lib/planning-service';

export const runtime = 'edge';
async function handle(request: Request) {
  const requestId = crypto.randomUUID();
  let recipientId = '',
    action = 'read',
    actorUserId = '';
  try {
    await ensureDatabase(env.DB);
    const auth = await requireMembership(env.DB, request, env.AUTH_PUBLIC_URL);
    if ('error' in auth) return auth.error;
    actorUserId = auth.member.id;
    let body: Record<string, unknown> = {};
    if (request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > 150000)
        throw new AppError('too_large', 413, 'This update is too large.');
      try {
        body = JSON.parse(raw);
      } catch {
        throw new AppError('invalid_json', 400, 'Send a valid update.');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new AppError('invalid_payload', 400, 'Send a valid update.');
      if (typeof body.action !== 'string' || body.action.length > 80)
        throw new AppError('invalid_action', 400, 'Choose a planning action.');
      action = body.action;
    }
    recipientId =
      request.method === 'POST'
        ? typeof body.recipientId === 'string'
          ? body.recipientId
          : ''
        : (new URL(request.url).searchParams.get('recipientId') ?? '');
    const access = await env.DB.prepare(
      "SELECT rm.access_role role,c.status consent FROM recipient_members rm JOIN care_recipients r ON r.id=rm.recipient_id LEFT JOIN consent_records c ON c.recipient_id=r.id WHERE rm.member_id=? AND rm.recipient_id=? AND r.status='active'",
    )
      .bind(auth.member.memberId, recipientId)
      .first<{ role: string; consent: string }>();
    if (!access)
      throw new AppError(
        'forbidden',
        403,
        'You do not have access to this care recipient.',
      );
    let result = {};
    if (request.method === 'POST') {
      if (access.consent !== 'active')
        throw new AppError(
          'consent_inactive',
          409,
          'Restore consent before using care planning.',
        );
      if (access.role === 'viewer' && action !== 'acknowledge')
        throw new AppError(
          'read_only',
          403,
          'A caregiver role is required for planning changes.',
        );
      await enforceRateLimit(env.DB, auth.member.id, `planning_${action}`);
      const release = await recipientLease(env.DB, recipientId);
      try {
        result = await planningAction(env.DB, auth.member, recipientId, body, env);
      } finally {
        await release();
      }
    }
    return Response.json(
      {
        ...result,
        state: await loadPlanning(env.DB, recipientId, auth.member.memberId),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    await recordError(env.DB, {
      requestId,
      route: '/api/planning',
      action,
      errorCode: error instanceof AppError ? error.code : 'unhandled',
      actorUserId,
      recipientId,
    });
    return errorResponse(error, requestId);
  }
}
export const GET = handle;
export const POST = handle;
