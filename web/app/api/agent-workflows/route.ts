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
import { feasibleMoveTimes, isOpen, simulateMove } from '@/lib/planning-engine';
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

const MAX_STANDARD_JSON_BYTES = 25_000;
const MAX_INTAKE_JSON_BYTES = 7_200_000;

const base64ToBytes = (value: string) => {
  if (!value || value.length > 7_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new AppError('invalid_file_data', 400, 'Choose the file again and retry.');
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new AppError('invalid_file_data', 400, 'Choose the file again and retry.');
  }
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
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (Number.isFinite(contentLength) && contentLength > MAX_INTAKE_JSON_BYTES)
        throw new AppError('too_large', 413, 'Choose a file no larger than 5 MB.');
      const raw = await request.text();
      if (raw.length > MAX_INTAKE_JSON_BYTES)
        throw new AppError('too_large', 413, 'This request is too large.');
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new AppError('invalid_json', 400, 'Send a valid request.');
      }
      action = text(body.action, 'workflow', 60);
      recipientId = text(body.recipientId, 'care recipient', 120);
      if (action !== 'intake' && raw.length > MAX_STANDARD_JSON_BYTES)
        throw new AppError('too_large', 413, 'This request is too large.');
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
      const candidateTimes = feasibleMoveTimes(
        planning.tasks,
        planning.availability,
        task.id,
        access.timezone,
      );
      if (!candidateTimes.length)
        throw new AppError(
          'no_feasible_options',
          409,
          task.planning.owner_member_id
            ? 'No conflict-free times fit the assigned caregiver’s shared availability. Add or extend availability and try again.'
            : 'Assign a caregiver and add their availability before requesting schedule options.',
        );
      const generated = await generateConflictSuggestions(
        env,
        task,
        access.timezone,
        records,
        planning.availability,
        candidateTimes,
      );
      const explained = (generated?.value ?? []).flatMap((option) => {
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
      const options = [...explained];
      for (const dueAt of candidateTimes) {
        if (options.some((option) => option.dueAt === dueAt)) continue;
        const check = simulateMove(
          planning.tasks,
          planning.availability,
          task.id,
          dueAt,
          access.timezone,
          false,
        );
        if (check.conflicts.length) continue;
        options.push({
          label: new Intl.DateTimeFormat('en-CA', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: access.timezone,
          }).format(new Date(dueAt)),
          dueAt,
          rationale:
            'Fits the assigned caregiver’s shared availability and the current responsibility schedule.',
          affected: check.changes.map((change) => change.title),
          uncertainty:
            'Caregiver confirmation and final approval are still required.',
          evidenceIds: [`task:${task.id}`],
        });
        if (options.length === 3) break;
      }
      result = {
        options: options.slice(0, 3),
        model: generated?.model ?? 'deterministic scheduler',
        agentMode: generated ? 'model' : 'deterministic',
      };
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
      const encoded =
        body.file && typeof body.file === 'object'
          ? (body.file as Record<string, unknown>)
          : null;
      const sourceName =
        upload?.name ??
        (typeof encoded?.name === 'string' ? encoded.name : '');
      const sourceType =
        upload?.type ??
        (typeof encoded?.type === 'string' ? encoded.type : '');
      const declaredSize =
        upload?.size ??
        (typeof encoded?.size === 'number' ? encoded.size : 0);
      if (!upload && !encoded)
        throw new AppError('file_required', 400, 'Choose a file to review.');
      if (declaredSize > 5 * 1024 * 1024)
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
      if (!allowed.has(sourceType))
        throw new AppError(
          'file_type',
          415,
          'Use PDF, TXT, PNG, JPG, or WebP.',
        );
      const safeName =
        sourceName.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 160) ||
        'care-document';
      const bytes = upload
        ? new Uint8Array(await upload.arrayBuffer())
        : base64ToBytes(
            typeof encoded?.dataBase64 === 'string'
              ? encoded.dataBase64
              : '',
          );
      if (bytes.length > 5 * 1024 * 1024 || bytes.length !== declaredSize)
        throw new AppError(
          'file_size_mismatch',
          400,
          'Choose the file again and retry.',
        );
      const content =
        sourceType === 'text/plain'
          ? [
              {
                type: 'input_text',
                text: new TextDecoder().decode(bytes).slice(0, 100_000),
              },
            ]
          : sourceType.startsWith('image/')
            ? [
                {
                  type: 'input_image',
                  image_url: `data:${sourceType};base64,${bytesToBase64(bytes)}`,
                  detail: 'high',
                },
              ]
            : [
                {
                  type: 'input_file',
                  filename: safeName,
                  file_data: `data:${sourceType};base64,${bytesToBase64(bytes)}`,
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
          type: sourceType,
          size: bytes.length,
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

    const resultFile =
      result.file && typeof result.file === 'object'
        ? (result.file as Record<string, unknown>)
        : null;
    const resultFileType =
      typeof resultFile?.type === 'string' ? resultFile.type : '';
    const resultFileSize =
      typeof resultFile?.size === 'number' ? resultFile.size : 0;
    await env.DB.prepare('INSERT INTO audit_entries VALUES (?,?,?,?,?,?,?,?)')
      .bind(
        crypto.randomUUID(),
        auth.member.id,
        auth.member.email,
        action,
        'recipient',
        recipientId,
        action === 'intake'
          ? `Transient document analysis completed; file retained: false; ${resultFileType}; ${resultFileSize} bytes`
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
