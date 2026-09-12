import { ntfyServerUrl } from './notification-types';
import { AppError } from './guardrails';

export const integrationKeys = {
  ntfy: ['NTFY_SERVER_URL'],
  calendar: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_TOKEN_KEY'],
  sms: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
  email: ['RESEND_API_KEY', 'NOTIFICATION_EMAIL_FROM'],
  push: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'],
} as const;
export type IntegrationId = keyof typeof integrationKeys;
export type IntegrationStatus = { id: IntegrationId; configured: boolean; enabled: boolean };
type Bindings = Partial<Record<typeof integrationKeys[IntegrationId][number], string>>;

export async function integrationSettings(db: D1Database, config: Bindings): Promise<IntegrationStatus[]> {
  const rows = (await db.prepare("SELECT key,value FROM settings WHERE key LIKE 'integration:%'").all<{ key: string; value: string }>()).results;
  return (Object.keys(integrationKeys) as IntegrationId[]).map((id) => {
    const configured = integrationKeys[id].every((key) => Boolean(config[key]?.trim())) && (id !== 'ntfy' || Boolean(ntfyServerUrl(config.NTFY_SERVER_URL))) && (id !== 'calendar' || /^[a-f0-9]{64}$/i.test(config.GOOGLE_TOKEN_KEY || ''));
    return { id, configured, enabled: configured && rows.some((row) => row.key === `integration:${id}` && row.value === 'true') };
  });
}

export async function effectiveIntegrations<T extends Bindings>(db: D1Database, config: T): Promise<T> {
  const result = { ...config };
  for (const status of await integrationSettings(db, config)) {
    if (!status.enabled) for (const key of integrationKeys[status.id]) delete result[key];
  }
  return result;
}

export async function setIntegration(db: D1Database, config: Bindings, id: unknown, enabled: unknown, actor: { id: string; email: string; role: string }) {
  if (actor.role !== 'owner') throw new AppError('forbidden', 403, 'Only a care-circle owner can change integrations.');
  if (typeof id !== 'string' || !Object.hasOwn(integrationKeys, id) || typeof enabled !== 'boolean') throw new AppError('invalid_integration', 400, 'Choose a supported integration and an on/off state.');
  const status = (await integrationSettings(db, config)).find((item) => item.id === id)!;
  if (enabled && !status.configured) throw new AppError('integration_unconfigured', 409, 'Add the required credentials before enabling this integration.');
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(`integration:${id}`, String(enabled), now),
    db.prepare('INSERT INTO audit_entries VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), actor.id, actor.email, 'set_integration', 'integration', id, enabled ? 'Enabled integration' : 'Paused integration', now),
  ]);
}
