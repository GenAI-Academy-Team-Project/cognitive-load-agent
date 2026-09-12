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
    const config = { PUSHOVER_API_TOKEN: 'a'.repeat(30), MEM0_API_KEY: 'synthetic-memory', TWILIO_ACCOUNT_SID: 'synthetic-sid', TWILIO_AUTH_TOKEN: 'synthetic-token', TWILIO_FROM_NUMBER: '+14165550123' };
    const initial = await integrationSettings(db, config);
    expect(initial.every((item) => !item.enabled)).toBe(true);
    expect(initial.find((item) => item.id === 'sms')?.configured).toBe(true);
    expect(JSON.stringify(initial)).not.toContain('synthetic');
    expect(configuredChannels(await effectiveIntegrations(db, config))).toEqual(['in_app']);
    await expect(setIntegration(db, config, 'sms', true, { ...owner, role: 'caregiver' })).rejects.toThrow('Only a care-circle owner');
    await expect(setIntegration(db, {}, 'sms', true, owner)).rejects.toThrow('credentials');
    await expect(setIntegration(db, config, '__proto__', true, owner)).rejects.toThrow('supported integration');
    await expect(setIntegration(db, config, 'sms', 'true', owner)).rejects.toThrow('on/off');
    await setIntegration(db, config, 'sms', true, owner);
    expect(configuredChannels(await effectiveIntegrations(db, config))).toEqual(['in_app', 'sms']);
    await setIntegration(db, config, 'memory', true, owner);
    expect((await effectiveIntegrations(db, config)).MEM0_API_KEY).toBe('synthetic-memory');
    await setIntegration(db, config, 'memory', false, owner);
    expect((await effectiveIntegrations(db, config)).MEM0_API_KEY).toBeUndefined();
    await setIntegration(db, config, 'pushover', true, owner);
    expect((await effectiveIntegrations(db, config)).PUSHOVER_API_TOKEN).toBe('a'.repeat(30));
    await setIntegration(db, config, 'pushover', false, owner);
    expect((await effectiveIntegrations(db, config)).PUSHOVER_API_TOKEN).toBeUndefined();
    expect(config.MEM0_API_KEY).toBe('synthetic-memory'); // Still available for explicit privacy cleanup.
    await setIntegration(db, config, 'sms', false, owner);
    expect(configuredChannels(await effectiveIntegrations(db, config))).toEqual(['in_app']);
    await setIntegration(db, config, 'sms', true, owner);
    expect((await integrationSettings(db, {})).every((item) => !item.enabled)).toBe(true);
    expect(sqlite.prepare("SELECT value FROM settings WHERE key='integration:sms'").get()?.value).toBe('true');
  } finally { sqlite.close(); }
});
