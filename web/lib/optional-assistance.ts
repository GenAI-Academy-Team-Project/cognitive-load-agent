import { AppError } from './guardrails';
import { effectiveIntegrations } from './integration-settings';
import { summaryProvider, draftSummary, type AssistanceConfig, type CareAnswer } from './assistance-providers';

export type AssistanceKind = 'llm';
const keyFor = (recipientId: string, kind: AssistanceKind) => `assistance:${kind}:${recipientId}`;
export async function assistanceState(db: D1Database, config: AssistanceConfig, recipientId: string, canManage: boolean) {
  const effective = await effectiveIntegrations(db, config);
  const allowed = async (kind: AssistanceKind) => (await db.prepare('SELECT value FROM settings WHERE key=?').bind(keyFor(recipientId, kind)).first<{ value: string }>())?.value === 'true';
  const planningAllowed = (await db.prepare('SELECT value FROM settings WHERE key=?').bind(`assistance:planning:${recipientId}`).first<{ value: string }>())?.value === 'true';
  return { canManage, planningAllowed, llm: { available: Boolean(summaryProvider(effective)), allowed: await allowed('llm') } };
}

// Caller resolves recipient membership and holds the shared consent/deletion lease.
export async function setAssistance(db: D1Database, config: AssistanceConfig, recipientId: string, kind: unknown, enabled: unknown, actor: { id: string; email: string }, accessRole: string) {
  if (accessRole !== 'owner') throw new AppError('forbidden', 403, 'Only the recipient owner can allow external assistance.');
  if (kind !== 'llm' || typeof enabled !== 'boolean') throw new AppError('invalid_assistance', 400, 'Choose an assistance option and an on/off state.');
  const state = await assistanceState(db, config, recipientId, true);
  if (enabled && !state[kind].available) throw new AppError('assistance_unavailable', 409, 'Enable this connection in Integrations first.');
  const consent = await db.prepare('SELECT status FROM consent_records WHERE recipient_id=?').bind(recipientId).first<{ status: string }>();
  if (enabled && consent?.status !== 'active') throw new AppError('consent_inactive', 409, 'Consent is withdrawn.');
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(keyFor(recipientId, kind), String(enabled), now),
    ...(kind === 'llm' ? [db.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(`assistance:planning:${recipientId}`, String(enabled), now)] : []),
    db.prepare('INSERT INTO audit_entries VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), actor.id, actor.email, 'set_assistance', 'recipient', recipientId, `${kind}: ${enabled ? 'allowed external processing' : 'disabled external processing'}${kind === 'llm' ? ' (OpenRouter summaries and planning v1)' : ''}`, now),
  ]);
}

export function assistanceIntent(message: string): { kind: AssistanceKind; query?: string } | null {
  // Keep all action interpretation in the existing deterministic path.
  return /\b(summary|summarize|handover|daily review|review today)\b/i.test(message) || /^what should i review today\??$/i.test(message) ? { kind: 'llm' } : null;
}

// Called only for answers, never action proposals. Caller holds the consent/deletion lease.
export async function assistAnswer(db: D1Database, config: AssistanceConfig, recipientId: string, message: string, local: CareAnswer, fetcher: typeof fetch = fetch): Promise<CareAnswer> {
  const intent = assistanceIntent(message);
  if (!intent) return local;
  const state = await assistanceState(db, config, recipientId, false);
  if (!state[intent.kind].available || !state[intent.kind].allowed) {
    return local;
  }
  let outcome = 'fallback';
  try {
    const effective = await effectiveIntegrations(db, config);
    const authorize = async () => {
      const latest = await assistanceState(db, config, recipientId, false);
      const consent = await db.prepare('SELECT status FROM consent_records WHERE recipient_id=?').bind(recipientId).first<{ status: string }>();
      if (consent?.status !== 'active' || !latest[intent.kind].available || !latest[intent.kind].allowed) throw new Error('External assistance paused');
    };
    await authorize();
    const result = await draftSummary(effective, local, fetcher);
    await authorize();
    outcome = 'completed';
    return result;
  } catch {
    return { content: `${local.content} AI summaries are temporarily unavailable; this answer uses local records.`, evidence: local.evidence };
  } finally {
    await db.prepare('INSERT INTO audit_entries VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), 'system', 'Carestead', 'external_assistance', 'recipient', recipientId, `${intent.kind}: ${outcome}`, new Date().toISOString()).run();
  }
}
