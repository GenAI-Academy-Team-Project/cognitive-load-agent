import { ntfyServerUrl } from './notification-types';
import { openToken, sealToken } from './google-calendar';
import { AppError } from './guardrails';

import { integrationKeys, type IntegrationId, type IntegrationStatus } from './integration-types';
export { integrationKeys, type IntegrationId, type IntegrationStatus } from './integration-types';
type Bindings = Partial<Record<typeof integrationKeys[IntegrationId][number], string>> & { INTEGRATION_CONFIG_KEY?: string };

type SettingRow = { key: string; value: string };
const configPrefix = 'integration-config:';
async function settingsRows(db: D1Database) {
  return (await db.prepare("SELECT key,value FROM settings WHERE key LIKE 'integration:%' OR key LIKE 'integration-config:%'").all<SettingRow>()).results;
}
function encryptionKey(config: Bindings) {
  if (!/^[a-f0-9]{64}$/i.test(config.INTEGRATION_CONFIG_KEY || '')) throw new AppError('integration_key_missing', 503, 'An administrator must configure INTEGRATION_CONFIG_KEY before saving or using encrypted overrides.');
  return config.INTEGRATION_CONFIG_KEY!;
}
async function resolveConfig<T extends Bindings>(config: T, rows: SettingRow[]): Promise<T> {
  const result = { ...config };
  for (const key of new Set(Object.values(integrationKeys).flat())) {
    const override = rows.find(row => row.key === `${configPrefix}${key}`);
    if (override) {
      try { result[key] = await openToken(override.value, encryptionKey(config), `${configPrefix}${key}`); }
      catch { throw new AppError('integration_config_unavailable', 503, 'Saved integration configuration could not be decrypted. Check the deployment encryption key.'); }
    }
  }
  return result;
}
// Unfiltered credentials remain available for explicit privacy cleanup while paused.
export async function integrationConfig<T extends Bindings>(db: D1Database, config: T): Promise<T> {
  return resolveConfig(config, await settingsRows(db));
}
function statuses(config: Bindings, rows: SettingRow[]): IntegrationStatus[] {
  return (Object.keys(integrationKeys) as IntegrationId[]).map((id) => {
    const configured = integrationKeys[id].every((key) => key === 'NTFY_ACCESS_TOKEN' || key === 'OPENAI_MODEL' || key === 'OPENAI_REASONING_EFFORT' || Boolean(config[key]?.trim())) && (id !== 'ntfy' || Boolean(ntfyServerUrl(config.NTFY_SERVER_URL))) && (id !== 'calendar' || /^[a-f0-9]{64}$/i.test(config.GOOGLE_TOKEN_KEY || ''));
    return { id, configured, enabled: configured && rows.some((row) => row.key === `integration:${id}` && row.value === 'true'), fields: integrationKeys[id].map(key => ({ key, source: rows.some(row => row.key === `${configPrefix}${key}`) ? 'override' as const : config[key]?.trim() ? 'environment' as const : 'missing' as const })) };
  });
}
export async function integrationSettings(db: D1Database, config: Bindings): Promise<IntegrationStatus[]> {
  const rows = await settingsRows(db);
  return statuses(await resolveConfig(config, rows), rows);
}

export async function effectiveIntegrations<T extends Bindings>(db: D1Database, config: T): Promise<T> {
  const rows = await settingsRows(db);
  const result = await resolveConfig(config, rows);
  const integrations = statuses(result, rows);
  const enabledKeys = new Set<string>(integrations.filter((status) => status.enabled).flatMap((status) => [...integrationKeys[status.id]]));
  for (const status of integrations) {
    if (!status.enabled) for (const key of integrationKeys[status.id]) if (!enabledKeys.has(key)) delete result[key];
  }
  return result;
}

export async function setIntegration(db: D1Database, config: Bindings, id: unknown, enabled: unknown, actor: { id: string; email: string; role: string }, overrides?: unknown) {
  if (actor.role !== 'owner') throw new AppError('forbidden', 403, 'Only a care-circle owner can change integrations.');
  if (typeof id !== 'string' || !Object.hasOwn(integrationKeys, id) || typeof enabled !== 'boolean') throw new AppError('invalid_integration', 400, 'Choose a supported integration and an on/off state.');
  const changes: [string, string | null][] = [];
  if (overrides !== undefined) {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new AppError('invalid_config', 400, 'Provide environment configuration as an object.');
    for (const [key, value] of Object.entries(overrides)) {
      if (!(integrationKeys[id as IntegrationId] as readonly string[]).includes(key) || (value !== null && (typeof value !== 'string' || !value.trim() || value.length > 8192))) throw new AppError('invalid_config', 400, 'Use supported configuration fields with non-empty values, or reset them to the environment.');
      if (key === 'GOOGLE_TOKEN_KEY' && value !== null && !/^[a-f0-9]{64}$/i.test((value as string).trim())) throw new AppError('invalid_config', 400, 'GOOGLE_TOKEN_KEY must contain 64 hexadecimal characters.');
      if (key === 'NTFY_SERVER_URL' && value !== null && !ntfyServerUrl(value as string)) throw new AppError('invalid_config', 400, 'NTFY_SERVER_URL must be a public HTTPS server origin.');
      changes.push([key, value === null ? null : await sealToken((value as string).trim(), encryptionKey(config), `${configPrefix}${key}`)]);
    }
  }
  let rows = await settingsRows(db);
  for (const [key, value] of changes) {
    rows = rows.filter(row => row.key !== `${configPrefix}${key}`);
    if (value !== null) rows.push({ key: `${configPrefix}${key}`, value });
  }
  const status = statuses(await resolveConfig(config, rows), rows).find((item) => item.id === id)!;
  if (enabled && !status.configured) throw new AppError('integration_unconfigured', 409, 'Add the required credentials before enabling this integration.');
  const now = new Date().toISOString();
  await db.batch([
    ...changes.map(([key, value]) => value === null
      ? db.prepare('DELETE FROM settings WHERE key=?').bind(`${configPrefix}${key}`)
      : db.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(`${configPrefix}${key}`, value, now)),
    db.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(`integration:${id}`, String(enabled), now),
    db.prepare('INSERT INTO audit_entries VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), actor.id, actor.email, 'set_integration', 'integration', id, enabled ? 'Enabled integration' : 'Paused integration', now),
  ]);
}
