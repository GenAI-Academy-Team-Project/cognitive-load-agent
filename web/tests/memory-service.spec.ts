import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { ensureDatabase } from '../db/bootstrap';
import { clearRemoteMemory, integrationFor, memoryCandidate, memoryLease, recallMemory, setMemoryEnabled } from '../lib/care-memory';

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

const config = { MEM0_API_KEY: 'synthetic-test-key' };
let sqlite: DatabaseSync;
let db: D1Database;
let originalFetch: typeof fetch;
let writes: { path: string; method: string; body: Record<string, unknown> }[];
let remote: { metadata: { record_id: string; revision: string }; user_id: string; score: number; memory?: string }[];
let deletionStatus: string;
let offline: boolean;

test.beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:'); db = database(sqlite); await ensureDatabase(db);
  writes = []; remote = []; deletionStatus = 'SUCCEEDED'; offline = false;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (offline) throw new Error('offline');
    const url = new URL(input instanceof Request ? input.url : input);
    expect(url.origin).toBe('https://api.mem0.ai');
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
    writes.push({ path: url.pathname, method: init?.method || 'GET', body });
    if (url.pathname === '/v3/memories/add/') {
      expect(body.infer).toBe(false);
      remote.push({ metadata: body.metadata, user_id: body.user_id, score: 0.9, memory: 'Untrusted provider wording' });
      return Response.json({ results: [{ id: crypto.randomUUID() }] });
    }
    if (url.pathname === '/v3/memories/search/') return Response.json({ results: remote.filter((item) => item.user_id === body.filters.user_id) });
    if (init?.method === 'DELETE') {
      remote = remote.filter((item) => item.user_id !== url.searchParams.get('user_id'));
      return Response.json({ event_id: 'delete-event' });
    }
    if (url.pathname === '/v1/event/delete-event/') return Response.json({ status: deletionStatus });
    throw new Error('Unexpected provider request');
  };
});
test.afterEach(() => { globalThis.fetch = originalFetch; sqlite.close(); });

async function fact(id: string, value: string, status = 'verified', recipient = 'recipient-alex') {
  await db.batch([
    db.prepare('INSERT INTO memories VALUES (?,?,?,?,?,?,?)').bind(id, 'preference', value, 'Synthetic caregiver', 'high', status, '2030-01-01T00:00:00Z'),
    db.prepare('INSERT INTO record_scopes VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(), 'memory', id, recipient, null, '2030-01-01T00:00:00Z'),
  ]);
}
async function enable() {
  const release = await memoryLease(db, 'recipient-alex');
  try { await setMemoryEnabled(db, config, 'recipient-alex', true); } finally { await release(); }
}

test('candidate capture preserves negation and ignores questions or opt-out', () => {
  expect(memoryCandidate('Remember that Dad does not like morning appointments.')).toBe('Dad does not like morning appointments.');
  expect(memoryCandidate('Dad prefers afternoon appointments.')).toBe('Dad prefers afternoon appointments.');
  expect(memoryCandidate('Does Dad prefer afternoons?')).toBeNull();
  expect(memoryCandidate("Do not remember that Dad prefers afternoons.")).toBeNull();
  expect(memoryCandidate('Run care check')).toBeNull();
});

test('local recall works without consent to external processing and excludes unverified facts', async () => {
  await fact('local', 'Dad prefers afternoon appointments');
  await fact('pending', 'Dad prefers morning appointments', 'review_due');
  const result = await recallMemory(db, config, 'recipient-alex', 'What appointments does Dad prefer?');
  expect(result.mode).toBe('local');
  expect(result.memories.map((m) => m.id)).toContain('local');
  expect(result.memories.map((m) => m.id)).not.toContain('pending');
  expect(writes).toHaveLength(0);
});

test('semantic recall finds paraphrases, uses D1 wording, and never uploads another recipient', async () => {
  await fact('mobility', 'Avoid stairs; use the side entrance');
  await fact('other', 'Private fact for a different person', 'verified', 'another-recipient');
  await enable();
  const result = await recallMemory(db, config, 'recipient-alex', 'What makes getting around difficult?');
  expect(result.mode).toBe('semantic');
  expect(result.memories.find((m) => m.id === 'mobility')?.value).toBe('Avoid stairs; use the side entrance');
  expect(JSON.stringify(writes)).not.toContain('Private fact');
  expect(result.memories.some((m) => m.id === 'other')).toBe(false);
  const count = writes.filter((w) => w.path.endsWith('/add/')).length;
  await recallMemory(db, config, 'recipient-alex', 'Help with getting around');
  expect(writes.filter((w) => w.path.endsWith('/add/'))).toHaveLength(count);
});

test('provider hits with wrong IDs or old revisions cannot become evidence', async () => {
  await fact('fact', 'Afternoons are preferred'); await enable();
  await recallMemory(db, config, 'recipient-alex', 'timing');
  const scope = (await integrationFor(db, 'recipient-alex'))!.scope_id;
  remote = [
    { user_id: scope, metadata: { record_id: 'another-recipient-fact', revision: '2030-01-01T00:00:00Z' }, score: 1 },
    { user_id: scope, metadata: { record_id: 'fact', revision: 'old' }, score: 1 },
  ];
  expect((await recallMemory(db, config, 'recipient-alex', 'timing')).memories).toEqual([]);
});

test('provider outage falls back to current local facts', async () => {
  await fact('fact', 'Afternoon appointments are preferred'); await enable(); offline = true;
  const result = await recallMemory(db, config, 'recipient-alex', 'afternoon');
  expect(result.mode).toBe('fallback'); expect(result.memories.some((m) => m.id === 'fact')).toBe(true);
});

test('pending deletion stays tracked and disables recall until cleanup is confirmed', async () => {
  await fact('fact', 'Afternoons are preferred'); await enable();
  await recallMemory(db, config, 'recipient-alex', 'timing'); deletionStatus = 'PENDING';
  const release = await memoryLease(db, 'recipient-alex');
  try { await expect(setMemoryEnabled(db, config, 'recipient-alex', false)).rejects.toThrow('cleanup is pending'); } finally { await release(); }
  expect(await integrationFor(db, 'recipient-alex')).toMatchObject({ enabled: 'false', remote_dirty: 'true', deletion_event: 'delete-event' });
  const calls = writes.length;
  await recallMemory(db, config, 'recipient-alex', 'afternoons'); expect(writes).toHaveLength(calls);
  deletionStatus = 'SUCCEEDED';
  await clearRemoteMemory(db, config, 'recipient-alex');
  expect(await integrationFor(db, 'recipient-alex')).toMatchObject({ remote_dirty: 'false', deletion_event: null });
});

test('corrections invalidate the old index and archives disappear from recall', async () => {
  await fact('fact', 'Afternoons are preferred'); await enable();
  await recallMemory(db, config, 'recipient-alex', 'timing');
  await db.prepare("UPDATE memories SET value='Mornings are preferred',updated_at='2031-01-01' WHERE id='fact'").run();
  const result = await recallMemory(db, config, 'recipient-alex', 'timing');
  expect(result.memories.find((m) => m.id === 'fact')?.value).toBe('Mornings are preferred');
  expect(writes.some((w) => w.method === 'DELETE')).toBe(true);
  await db.prepare("UPDATE memories SET status='archived' WHERE id='fact'").run();
  expect((await recallMemory(db, config, 'recipient-alex', 'timing')).memories.some((m) => m.id === 'fact')).toBe(false);
});

test('consent withdrawal blocks external reads and enabling', async () => {
  await enable();
  await db.prepare("UPDATE consent_records SET status='withdrawn' WHERE recipient_id='recipient-alex'").run();
  await expect(setMemoryEnabled(db, config, 'recipient-alex', true)).rejects.toThrow('Consent is withdrawn');
  await recallMemory(db, config, 'recipient-alex', 'timing');
  expect(writes).toHaveLength(0);
});

test('a concurrent operation uses local recall and does not write remotely', async () => {
  await enable(); const release = await memoryLease(db, 'recipient-alex');
  try { expect((await recallMemory(db, config, 'recipient-alex', 'timing')).mode).toBe('fallback'); } finally { await release(); }
  expect(writes).toHaveLength(0);
});
