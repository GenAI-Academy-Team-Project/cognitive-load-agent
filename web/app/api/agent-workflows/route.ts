import { env } from 'cloudflare:workers';

import { ensureDatabase } from '@/db/bootstrap';
import { requireMembership } from '@/lib/auth';
import { careAgentRecords, loadCareSnapshot } from '@/lib/care-context';
import {
  analyzeCareDocument,
  composeCareMessage,
  generateConflictSuggestions,
  generatePlanAdaptation,
  modelEnabled,
} from '@/lib/llm-agent';
import { loadPlanning } from '@/lib/planning-service';
import { isOpen, simulateMove } from '@/lib/planning-engine';
import {
  AppError,
  enforceRateLimit,
  errorResponse,
  recordError,
} from '@/lib/guardrails';

export const runtime = 'edge';

const text = (value: unknown, name: string, max: number) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new AppError('invalid_field', 400, `Enter a valid ${name}.`);
  return value.trim();
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let recipientId = '',
    action = 'agent_workflow',
    actorUserId = '';
  try {
    await ensureDatabase(env.DB);
    const auth = await requireMembership(env.DB, request, env.AUTH_PUBLIC_URL);
    if ('error' in auth) return auth.error;
    actorUserId = auth.member.id;

    const multipart = request.headers
      .get('content-type')
      ?.includes('multipart/form-data');
    let body: Record<string, unknown> = {};
    let upload: File | null = null;
    if (multipart) {
      const form = await request.formData();
      const actionValue = form.get('action');
      const recipientValue = form.get('recipientId');
      action = typeof actionValue === 'string' ? actionValue : '';
      recipientId = typeof recipientValue === 'string' ? recipientValue : '';
      body.processingConsent = form.get('processingConsent');
      const candidate = form.get('file');
      upload = candidate instanceof File ? candidate : null;
    } else {
      const raw = await request.text();
      if (raw.length > 25_000)
        throw new AppError('too_large', 413, 'This request is too large.');
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new AppError('invalid_json', 400, 'Send a valid request.');
      }
      action = text(body.action, 'workflow', 60);
      recipientId = text(body.recipientId, 'care recipient', 120);
    }

    const access = await env.DB.prepare(
      "SELECT rm.access_role role,c.status consent,r.display_name name,r.timezone FROM recipient_members rm JOIN care_recipients r ON r.id=rm.recipient_id LEFT JOIN consent_records c ON c.recipient_id=r.id WHERE rm.member_id=? AND rm.recipient_id=? AND r.status='active'",
    )
      .bind(auth.member.memberId, recipientId)
      .first<{
        role: string;
        consent: string;
        name: string;
        timezone: string;
      }>();
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
        'Restore consent before using AI workflows.',
      );
    if (access.role === 'viewer')
      throw new AppError(
        'read_only',
        403,
        'A caregiver role is required to prepare changes.',
      );
    if (!modelEnabled(env))
      throw new AppError(
        'model_unavailable',
        503,
        'AI workflows are not configured. Add OPENAI_API_KEY to .dev.vars.',
      );

    await enforceRateLimit(env.DB, auth.member.id, `agent_${action}`);
    const [snapshot, planning] = await Promise.all([
      loadCareSnapshot(env.DB, recipientId),
      loadPlanning(env.DB, recipientId, auth.member.memberId),
    ]);
    const records = careAgentRecords(snapshot);
    let result: Record<string, unknown>;

    if (action === 'conflict_options') {
      const taskId = text(body.taskId, 'responsibility', 120);
      const task = planning.tasks.find(
        (item) => item.id === taskId && isOpen(item),
      );
      if (!task)
        throw new AppError(
          'missing_task',
          404,
          'Open responsibility not found.',
        );
      if (task.calendarLinked)
        throw new AppError(
          'calendar_managed',
          409,
          'Use Calendar to manage this connected appointment.',
        );
      const generated = await generateConflictSuggestions(
        env,
        task,
        access.timezone,
        records,
        planning.availability,
      );
      if (!generated)
        throw new AppError(
          'model_failed',
          502,
          'No safe scheduling options were generated.',
        );
      const options = generated.value.flatMap((option) => {
        const check = simulateMove(
          planning.tasks,
          planning.availability,
          task.id,
          option.dueAt,
          access.timezone,
        );
        return check.conflicts.length
          ? []
          : [
              {
                ...option,
                affected: check.changes.map((change) => change.title),
              },
            ];
      });
      if (!options.length)
        throw new AppError(
          'no_feasible_options',
          409,
          'The suggested times conflicted with the live care plan. Adjust availability and try again.',
        );
      result = { options, model: generated.model };
    } else if (action === 'adapt_plan') {
      const description = text(
        body.description,
        'person and care-plan needs',
        2000,
      );
      const generated = await generatePlanAdaptation(
        env,
        description,
        access.timezone,
        records,
        planning.tasks,
      );
      if (!generated)
        throw new AppError(
          'model_failed',
          502,
          'A safe plan adaptation could not be generated.',
        );
      result = { adaptation: generated.value, model: generated.model };
    } else if (action === 'compose_message') {
      const memberId = text(body.memberId, 'care-circle member', 120);
      const target = planning.members.find(
        (member) => member.id === memberId && member.status === 'active',
      );
      if (!target)
        throw new AppError(
          'missing_member',
          400,
          'Choose an active care-circle member.',
        );
      const tone = text(body.tone, 'message style', 30);
      if (!['sms', 'family', 'formal', 'calendar', 'response'].includes(tone))
        throw new AppError(
          'invalid_tone',
          400,
          'Choose a supported message style.',
        );
      const generated = await composeCareMessage(
        env,
        text(body.context, 'message purpose', 1200),
        tone,
        target.display_name,
        records,
      );
      if (!generated)
        throw new AppError(
          'model_failed',
          502,
          'A grounded message could not be drafted.',
        );
      result = { draft: generated.value, model: generated.model };
    } else if (action === 'intake') {
      if (body.processingConsent !== 'true')
        throw new AppError(
          'processing_consent',
          400,
          'Confirm permission to process this file.',
        );
      if (!upload)
        throw new AppError('file_required', 400, 'Choose a file to review.');
      if (upload.size > 5 * 1024 * 1024)
        throw new AppError(
          'file_too_large',
          413,
          'Choose a file no larger than 5 MB.',
        );
      const allowed = new Set([
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/webp',
        'text/plain',
      ]);
      if (!allowed.has(upload.type))
        throw new AppError(
          'file_type',
          415,
          'Use PDF, TXT, PNG, JPG, or WebP.',
        );
      const safeName =
        upload.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 160) ||
        'care-document';
      const bytes = new Uint8Array(await upload.arrayBuffer());
      const content =
        upload.type === 'text/plain'
          ? [
              {
                type: 'input_text',
                text: new TextDecoder().decode(bytes).slice(0, 100_000),
              },
            ]
          : upload.type.startsWith('image/')
            ? [
                {
                  type: 'input_image',
                  image_url: `data:${upload.type};base64,${bytesToBase64(bytes)}`,
                  detail: 'high',
                },
              ]
            : [
                {
                  type: 'input_file',
                  filename: safeName,
                  file_data: `data:${upload.type};base64,${bytesToBase64(bytes)}`,
                },
              ];
      const generated = await analyzeCareDocument(
        env,
        [{ role: 'user', content }],
        safeName,
      );
      if (!generated)
        throw new AppError(
          'model_failed',
          502,
          'The file could not be safely extracted.',
        );
      result = {
        intake: generated.value,
        model: generated.model,
        file: {
          name: safeName,
          type: upload.type,
          size: upload.size,
          retained: false,
        },
      };
    } else {
      throw new AppError(
        'unknown_action',
        400,
        'Choose a supported AI workflow.',
      );
    }

    await env.DB.prepare('INSERT INTO audit_entries VALUES (?,?,?,?,?,?,?,?)')
      .bind(
        crypto.randomUUID(),
        auth.member.id,
        auth.member.email,
        action,
        'recipient',
        recipientId,
        action === 'intake'
          ? `Transient document analysis completed; file retained: false; ${upload?.type ?? ''}; ${upload?.size ?? 0} bytes`
          : `Draft generated with ${typeof result.model === 'string' ? result.model : 'configured model'}; no action executed`,
        new Date().toISOString(),
      )
      .run();
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    await recordError(env.DB, {
      requestId,
      route: '/api/agent-workflows',
      action,
      errorCode: error instanceof AppError ? error.code : 'unhandled',
      actorUserId,
      recipientId,
    });
    return errorResponse(error, requestId);
  }
}
