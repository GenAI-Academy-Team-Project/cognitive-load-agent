import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { ensureDatabase } from '../db/bootstrap';
import { memoryCandidate, recallMemory } from '../lib/care-memory';
import { recipientLease } from '../lib/recipient-lease';

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

let sqlite: DatabaseSync;
let db: D1Database;
let originalFetch: typeof fetch;
let requests: number;
test.beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:'); db = database(sqlite); await ensureDatabase(db);
  originalFetch = globalThis.fetch; requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Unexpected external request'); };
});
test.afterEach(() => { globalThis.fetch = originalFetch; sqlite.close(); });

async function fact(id: string, value: string, status = 'verified', recipient = 'recipient-alex') {
  await db.batch([
    db.prepare('INSERT INTO memories VALUES (?,?,?,?,?,?,?)').bind(id, 'preference', value, 'Synthetic caregiver', 'high', status, '2030-01-01T00:00:00Z'),
    db.prepare('INSERT INTO record_scopes VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(), 'memory', id, recipient, null, '2030-01-01T00:00:00Z'),
  ]);
}
test('candidate capture preserves negation and ignores questions or opt-out', () => {
  expect(memoryCandidate('Remember that Dad does not like morning appointments.')).toBe('Dad does not like morning appointments.');
  expect(memoryCandidate('Dad prefers afternoon appointments.')).toBe('Dad prefers afternoon appointments.');
  expect(memoryCandidate('Does Dad prefer afternoons?')).toBeNull();
  expect(memoryCandidate("Do not remember that Dad prefers afternoons.")).toBeNull();
  expect(memoryCandidate('Run care check')).toBeNull();
});

test('recall uses only current verified facts for the selected recipient without network access', async () => {
  await fact('local', 'Dad prefers afternoon appointments');
  await fact('pending', 'Dad prefers morning appointments', 'review_due');
  await fact('other', 'Dad prefers evening appointments', 'verified', 'another-recipient');
  const result = await recallMemory(db, 'recipient-alex', 'What appointments does Dad prefer?');
  expect(result.memories.map((m) => m.id)).toContain('local');
  expect(result.memories.map((m) => m.id)).not.toContain('pending');
  expect(result.memories.map((m) => m.id)).not.toContain('other');
  await db.prepare("UPDATE memories SET value='Dad prefers morning appointments' WHERE id='local'").run();
  expect((await recallMemory(db, 'recipient-alex', 'appointments')).memories.find((m) => m.id === 'local')?.value).toBe('Dad prefers morning appointments');
  await db.prepare("UPDATE memories SET status='archived' WHERE id='local'").run();
  expect((await recallMemory(db, 'recipient-alex', 'appointments')).memories.some((m) => m.id === 'local')).toBe(false);
  expect(requests).toBe(0);
});

test('recipient leases serialize updates and allow recovery after expiration', async () => {
  const release = await recipientLease(db, 'recipient-alex');
  await expect(recipientLease(db, 'recipient-alex')).rejects.toThrow('in progress');
  const otherRelease = await recipientLease(db, 'another-recipient');
  await otherRelease();
  await db.prepare("UPDATE recipient_locks SET lock_until='2000-01-01' WHERE recipient_id='recipient-alex'").run();
  const renewedRelease = await recipientLease(db, 'recipient-alex');
  await release();
  await expect(recipientLease(db, 'recipient-alex')).rejects.toThrow('in progress');
  await renewedRelease();
  await (await recipientLease(db, 'recipient-alex'))();
});
