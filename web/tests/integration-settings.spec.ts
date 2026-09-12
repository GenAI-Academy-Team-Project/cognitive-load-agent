import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { ensureDatabase } from '../db/bootstrap';
import { effectiveIntegrations, integrationSettings, setIntegration } from '../lib/integration-settings';
import { configuredChannels } from '../lib/notification-types';

function database(sqlite: DatabaseSync): D1Database {
  function statement(sql: string, values: unknown[] = []) {
    return {
      bind: (...params: unknown[]) => statement(sql, params),
      first: async () => sqlite.prepare(sql).get(...values as never[]) || null,
      all: async () => ({ results: sqlite.prepare(sql).all(...values as never[]) }),
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values as never[]).changes) }, success: true }),
    };
  }
  return { prepare: statement, batch: async (statements: { run: () => Promise<unknown> }[]) => {
    sqlite.exec('BEGIN');
    try { const results = []; for (const query of statements) results.push(await query.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
}

test('integrations default off, require credentials and ownership, and persist without exposing keys', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = database(sqlite); await ensureDatabase(db);
    const owner = { id: 'owner', email: 'owner@example.test', role: 'owner' };
    const config = { NTFY_SERVER_URL: 'https://ntfy.sh', TWILIO_ACCOUNT_SID: 'synthetic-sid', TWILIO_AUTH_TOKEN: 'synthetic-token', TWILIO_FROM_NUMBER: '+14165550123' };
    const initial = await integrationSettings(db, config);
    expect(initial.every((item) => !item.enabled)).toBe(true);
    expect(initial.find((item) => item.id === 'sms')?.configured).toBe(true);
    expect(JSON.stringify(initial)).not.toContain('synthetic');
    expect(configuredChannels(await effectiveIntegrations(db, config))).toEqual(['in_app']);
    await expect(setIntegration(db, config, 'sms', true, { ...owner, role: 'caregiver' })).rejects.toThrow('Only a care-circle owner');
    await expect(setIntegration(db, {}, 'sms', true, owner)).rejects.toThrow('credentials');
    await expect(setIntegration(db, config, '__proto__', true, owner)).rejects.toThrow('supported integration');
    await expect(setIntegration(db, config, 'sms', 'true', owner)).rejects.toThrow('on/off');
    await setIntegration(db, config, 'ntfy', true, owner);
    expect(configuredChannels(await effectiveIntegrations(db, config))).toContain('ntfy');
    await setIntegration(db, config, 'ntfy', false, owner);
    expect(configuredChannels(await effectiveIntegrations(db, config))).not.toContain('ntfy');
    await setIntegration(db, config, 'sms', true, owner);
    expect(configuredChannels(await effectiveIntegrations(db, config))).toEqual(['in_app', 'sms']);
    await setIntegration(db, config, 'sms', false, owner);
    expect(configuredChannels(await effectiveIntegrations(db, config))).toEqual(['in_app']);
    await setIntegration(db, config, 'sms', true, owner);
    expect((await integrationSettings(db, {})).every((item) => !item.enabled)).toBe(true);
    expect(sqlite.prepare("SELECT value FROM settings WHERE key='integration:sms'").get()?.value).toBe('true');
  } finally { sqlite.close(); }
});

test('encrypted ntfy overrides include the optional token, redact values, and reset to environment', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = database(sqlite); await ensureDatabase(db);
    const owner = { id: 'owner', email: 'owner@example.test', role: 'owner' };
    const config = { INTEGRATION_CONFIG_KEY: 'ab'.repeat(32), NTFY_SERVER_URL: 'https://ntfy.sh', NTFY_ACCESS_TOKEN: 'environment-secret' };
    await setIntegration(db, config, 'ntfy', true, owner, { NTFY_ACCESS_TOKEN: 'override-secret' });
    expect((await effectiveIntegrations(db, config)).NTFY_ACCESS_TOKEN).toBe('override-secret');
    const status = (await integrationSettings(db, config)).find(item => item.id === 'ntfy');
    expect(status?.fields).toContainEqual({ key: 'NTFY_ACCESS_TOKEN', source: 'override' });
    expect(JSON.stringify(status)).not.toContain('secret');
    expect(JSON.stringify(sqlite.prepare('SELECT * FROM settings').all())).not.toContain('override-secret');
    expect(JSON.stringify(sqlite.prepare('SELECT * FROM audit_entries').all())).not.toContain('override-secret');
    await expect(effectiveIntegrations(db, { ...config, INTEGRATION_CONFIG_KEY: 'cd'.repeat(32) })).rejects.toThrow('decrypted');
    await setIntegration(db, config, 'ntfy', false, owner);
    expect((await effectiveIntegrations(db, config)).NTFY_ACCESS_TOKEN).toBeUndefined();
    await setIntegration(db, config, 'ntfy', true, owner, { NTFY_ACCESS_TOKEN: null });
    expect((await effectiveIntegrations(db, config)).NTFY_ACCESS_TOKEN).toBe('environment-secret');
    expect(config.NTFY_ACCESS_TOKEN).toBe('environment-secret');
    await setIntegration(db, { NTFY_SERVER_URL: 'https://ntfy.sh' }, 'ntfy', true, owner);
  } finally { sqlite.close(); }
});

test('configuration writes enforce ownership, key setup, field validation and atomicity', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = database(sqlite); await ensureDatabase(db);
    const owner = { id: 'owner', email: 'owner@example.test', role: 'owner' };
    const config = { INTEGRATION_CONFIG_KEY: 'ab'.repeat(32) };
    await expect(setIntegration(db, config, 'email', false, { ...owner, role: 'caregiver' }, { RESEND_API_KEY: 'secret' })).rejects.toThrow('owner');
    await expect(setIntegration(db, {}, 'email', false, owner, { RESEND_API_KEY: 'secret' })).rejects.toThrow('INTEGRATION_CONFIG_KEY');
    for (const invalid of [{ AUTH_PUBLIC_URL: 'secret' }, { RESEND_API_KEY: '' }, { RESEND_API_KEY: 123 }, []]) {
      await expect(setIntegration(db, config, 'email', false, owner, invalid)).rejects.toThrow('configuration');
    }
    await expect(setIntegration(db, config, 'calendar', true, owner, { GOOGLE_CLIENT_SECRET: 'secret' })).rejects.toThrow('credentials');
    await expect(setIntegration(db, config, 'ntfy', false, owner, { NTFY_SERVER_URL: 'http://localhost' })).rejects.toThrow('HTTPS');
    expect(sqlite.prepare("SELECT * FROM settings WHERE key LIKE 'integration-config:%'").all()).toEqual([]);
  } finally { sqlite.close(); }
});
