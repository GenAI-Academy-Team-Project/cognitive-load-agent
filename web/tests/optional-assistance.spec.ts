import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { ensureDatabase } from '../db/bootstrap';
import { integrationSettings, setIntegration } from '../lib/integration-settings';
import { assistanceState, setAssistance, assistAnswer } from '../lib/optional-assistance';
import { draftSummary } from '../lib/assistance-providers';

const local = { content: 'One open responsibility.', evidence: [{ label: 'Responsibility', detail: 'Review transport · tomorrow' }] };
const config = { OPENROUTER_API_KEY: 'synthetic-key', OPENROUTER_MODEL: 'configured-model' };
const owner = { id: 'owner', email: 'owner@example.test', role: 'owner' };

function database(sqlite: DatabaseSync): D1Database {
  function statement(sql: string, values: unknown[] = []) {
    return { bind: (...params: unknown[]) => statement(sql, params), first: async () => sqlite.prepare(sql).get(...values as never[]) || null,
      all: async () => ({ results: sqlite.prepare(sql).all(...values as never[]) }),
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values as never[]).changes) }, success: true }) };
  }
  return { prepare: statement, batch: async (queries: { run: () => Promise<unknown> }[]) => { const results = []; for (const query of queries) results.push(await query.run()); return results; } } as unknown as D1Database;
}
const modelResponse = (indexes = [0], status = 'completed') => Response.json({ choices: [{ finish_reason: status === 'completed' ? 'stop' : 'length', message: { role: 'assistant', content: JSON.stringify({ summary: 'Review transport tomorrow.', evidenceIndexes: indexes }) } }] });

test('LLM and recipient permissions default off; disabled summaries make no network call', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = database(sqlite); await ensureDatabase(db);
    const neverFetch = (async () => { throw new Error('Unexpected network'); }) as typeof fetch;
    expect((await integrationSettings(db, config)).every((item) => !item.enabled)).toBe(true);
    expect(await assistAnswer(db, config, 'recipient-alex', 'summary', local, neverFetch)).toEqual(local);
    await setIntegration(db, config, 'llm', true, owner);
    expect((await assistanceState(db, config, 'recipient-alex', true)).llm).toEqual({ available: true, allowed: false });
    expect(await assistAnswer(db, config, 'recipient-alex', 'summary', local, neverFetch)).toEqual(local);
    await expect(setAssistance(db, config, 'recipient-alex', 'llm', true, owner, 'viewer')).rejects.toThrow('Only the recipient owner');
    await setAssistance(db, config, 'recipient-alex', 'llm', true, owner, 'owner');
    expect((await assistanceState(db, config, 'another-recipient', true)).llm.allowed).toBe(false);
    expect((await assistAnswer(db, config, 'recipient-alex', 'summary', local, async () => modelResponse())).content).toContain('AI-assisted');
    await setIntegration(db, config, 'llm', false, owner);
    expect(await assistAnswer(db, config, 'recipient-alex', 'summary', local, neverFetch)).toEqual(local);
    await setAssistance(db, config, 'recipient-alex', 'llm', false, owner, 'owner');
    expect((await assistanceState(db, config, 'recipient-alex', true)).llm.allowed).toBe(false);
  } finally { sqlite.close(); }
});

test('withdrawn consent prevents dispatch and provider errors preserve local evidence', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = database(sqlite); await ensureDatabase(db);
    await setIntegration(db, config, 'llm', true, owner);
    await setAssistance(db, config, 'recipient-alex', 'llm', true, owner, 'owner');
    const failed = await assistAnswer(db, config, 'recipient-alex', 'handover', local, async () => new Response('', { status: 429 }));
    expect(failed.content).toContain(local.content); expect(failed.content).toContain('temporarily unavailable'); expect(failed.evidence).toEqual(local.evidence);
    sqlite.prepare("UPDATE consent_records SET status='withdrawn' WHERE recipient_id='recipient-alex'").run();
    let calls = 0;
    await assistAnswer(db, config, 'recipient-alex', 'summary', local, async () => { calls++; return modelResponse(); });
    expect(calls).toBe(0);
    await expect(setAssistance(db, config, 'recipient-alex', 'llm', true, owner, 'owner')).rejects.toThrow('withdrawn');
    expect(sqlite.prepare("SELECT COUNT(*) n FROM audit_entries WHERE action='external_assistance'").get()?.n).toBe(2);
  } finally { sqlite.close(); }
});

test('summary sends bounded local context with a short output budget and no tools', async () => {
  const result = await draftSummary(config, local, async (url, init) => {
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(init!.body as string);
    expect(body.tools).toBeUndefined(); expect(body.model).toBe(config.OPENROUTER_MODEL);
    expect(JSON.parse(body.messages[1].content)).toEqual({ summary: local.content, evidence: local.evidence });
    return modelResponse();
  });
  expect(result.evidence).toEqual(local.evidence);
});
for (const [label, response] of [
  ['unknown evidence', () => modelResponse([9])], ['no evidence', () => modelResponse([])],
  ['incomplete', () => modelResponse([0], 'incomplete')], ['malformed', () => Response.json({ output: [] })],
  ['oversized', () => new Response('x'.repeat(128001))],
] as const) test(`rejects ${label} model response`, async () => {
  await expect(draftSummary(config, local, async () => response())).rejects.toThrow();
});

const routerConfig = { OPENROUTER_API_KEY: 'synthetic-router-key', OPENROUTER_MODEL: 'vendor/summary-model' };
const routerResponse = (finish = 'stop', indexes = [0]) => Response.json({ choices: [{ finish_reason: finish, message: { role: 'assistant', content: JSON.stringify({ summary: 'Review transport tomorrow.', evidenceIndexes: indexes }) } }] });
test('OpenRouter uses its own credentials, model and structured chat completion API', async () => {
  const result = await draftSummary({ ...config, ...routerConfig }, local, async (url, init) => {
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(new Headers(init!.headers).get('Authorization')).toBe('Bearer synthetic-router-key');
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe(routerConfig.OPENROUTER_MODEL);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.provider).toEqual({ require_parameters: true, data_collection: 'deny', sort: 'price', allow_fallbacks: false });
    expect(body.tools).toBeUndefined();
    expect(JSON.parse(body.messages[1].content)).toEqual({ summary: local.content, evidence: local.evidence });
    return routerResponse();
  });
  expect(result.evidence).toEqual(local.evidence);
});
test('OpenRouter config works without OpenAI keys and remains off until both toggles are on', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const db = database(sqlite); await ensureDatabase(db);
    expect((await integrationSettings(db, routerConfig)).find((item) => item.id === 'llm')).toEqual({ id: 'llm', configured: true, enabled: false, fields: [{ key: 'OPENROUTER_API_KEY', source: 'environment' }, { key: 'OPENROUTER_MODEL', source: 'environment' }] });
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; return routerResponse(); };
    expect(await assistAnswer(db, routerConfig, 'recipient-alex', 'summary', local, fetcher)).toEqual(local);
    expect(calls).toBe(0);
    await setIntegration(db, routerConfig, 'llm', true, owner);
    await setAssistance(db, routerConfig, 'recipient-alex', 'llm', true, owner, 'owner');
    expect((await assistAnswer(db, routerConfig, 'recipient-alex', 'summary', local, fetcher)).content).toContain('AI-assisted');
    expect(calls).toBe(1);
    const fallback = await assistAnswer(db, routerConfig, 'recipient-alex', 'summary', local, async () => routerResponse('length'));
    expect(fallback.content).toContain(local.content); expect(fallback.content).toContain('temporarily unavailable');
    await setIntegration(db, routerConfig, 'llm', false, owner);
    expect(await assistAnswer(db, routerConfig, 'recipient-alex', 'summary', local, fetcher)).toEqual(local);
    expect(calls).toBe(1);
  } finally { sqlite.close(); }
});
test('missing OpenRouter credentials never dispatch', async () => {
  let calls = 0;
  await expect(draftSummary({ OPENROUTER_MODEL: 'configured-model' }, local, async () => { calls++; return modelResponse(); })).rejects.toThrow('unavailable');
  expect(calls).toBe(0);
});
for (const [reason, indexes] of [['length', [0]], ['tool_calls', [0]], ['stop', [5]]] as const) test(`OpenRouter rejects ${reason} / ${indexes.join(",")}`, async () => {
  await expect(draftSummary(routerConfig, local, async () => routerResponse(reason, [...indexes]))).rejects.toThrow();
});
