import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { ensureDatabase } from '../db/bootstrap';
import { accountPreferences } from '../lib/account-preferences';
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

test('upgrades existing preferences without changing choices and defaults other accounts safely', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec("CREATE TABLE account_preferences (account_id TEXT PRIMARY KEY, input_preference TEXT NOT NULL DEFAULT 'voice', spoken_replies INTEGER NOT NULL DEFAULT 1); INSERT INTO account_preferences VALUES ('existing', 'typing', 0)");
    const db = database(sqlite);
    await ensureDatabase(db);
    await ensureDatabase(db);
    expect(await accountPreferences(db, 'existing')).toEqual({ inputPreference: 'typing', spokenReplies: false, autoListenOnOpen: false });
    expect(await accountPreferences(db, 'new')).toEqual({ inputPreference: 'voice', spokenReplies: true, autoListenOnOpen: false });
  } finally { sqlite.close(); }
});
