import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { ensureDatabase } from '../db/bootstrap';
import { assistPlanning, planningFallback } from '../lib/planning-assistance';
import { assistanceState, setAssistance } from '../lib/optional-assistance';
import { setIntegration } from '../lib/integration-settings';
import { localInput } from '../lib/calendar-time';
import { planningLimits, planningRequest, runPlanningAssistant } from '../agent/planning-assistant';
import { planningAction } from '../lib/planning-service';

const config = { OPENROUTER_API_KEY: 'synthetic', OPENROUTER_MODEL: 'test/cheap-model' };
const owner = { id: 'user-planner', memberId: 'member-planner', email: 'planner@example.test', displayName: 'Planner', role: 'owner' as const, status: 'active', householdId: 'household-demo' };
let sqlite: DatabaseSync, db: D1Database;
const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const final = (simulationId: string | null = null) => Response.json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ summary: 'Review this option with your care circle.', simulationId }) } }] });
const call = (name: string, args: unknown, id = crypto.randomUUID()) => Response.json({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] });
const ask = (fetcher: typeof fetch, message = 'Help me plan: Could the appointment move tomorrow?') => assistPlanning(db, config, 'recipient-alex', owner.memberId, message, fetcher);
async function enable() {
  await setIntegration(db, config, 'llm', true, owner);
  await setAssistance(db, config, 'recipient-alex', 'llm', true, owner, 'owner');
}
test.beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:');
  function statement(sql: string, values: unknown[] = []) {
    return { bind: (...args: unknown[]) => statement(sql, args), first: async () => sqlite.prepare(sql).get(...values as never[]) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...values as never[]) }),
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values as never[]).changes) }, success: true }) };
  }
  db = { prepare: statement, batch: async (queries: { run: () => Promise<unknown> }[]) => {
    sqlite.exec('BEGIN');
    try { const results = []; for (const query of queries) results.push(await query.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
  await ensureDatabase(db);
  sqlite.prepare('INSERT INTO care_circle_members VALUES (?,?,?,?,?,?,?,?,?)').run(owner.memberId, owner.householdId, owner.id, owner.email, owner.displayName, owner.role, 'active', future(0), future(0));
  sqlite.prepare('INSERT INTO recipient_members VALUES (?,?,?,?,?)').run('membership-planner', 'recipient-alex', owner.memberId, 'owner', future(0));
  sqlite.exec("UPDATE tasks SET status='complete'; UPDATE care_recipients SET timezone='America/Toronto' WHERE id='recipient-alex'");
  sqlite.prepare("UPDATE tasks SET status='open',due_at=? WHERE id='task-physio'").run(future(1));
  await planningAction(db, owner, 'recipient-alex', { action: 'save_task_details', taskId: 'task-physio', ownerMemberId: owner.memberId, durationMinutes: 20, dependsOn: '', requirements: [], backupMemberId: '' });
  await planningAction(db, owner, 'recipient-alex', { action: 'save_availability', start: future(0), end: future(10), categories: ['appointment', 'transport'], capabilities: [] });
});
test.afterEach(() => sqlite.close());

test('explicit planning prefix leaves normal actions and summaries alone', () => {
  expect(planningRequest('Move the appointment tomorrow at 3 PM')).toBeNull();
  expect(planningRequest('What should I review today?')).toBeNull();
  expect(planningRequest('Help me plan: find coverage')).toEqual({ question: 'find coverage' });
  expect(planningRequest('help me plan')).toEqual({ question: '' });
  expect(planningRequest(' Help me plan: ')).toEqual({ question: '' });
  expect(planningRequest('Help me plan move the appointment tomorrow')).toEqual({ question: 'move the appointment tomorrow' });
  expect(planningRequest('Help me plan:\nmove the appointment\ntomorrow')).toEqual({ question: 'move the appointment\ntomorrow' });
  expect(planningRequest('Help me plant flowers')).toBeNull();
});

test('bare planning requests explain setup or ask for details without external calls', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return final(); };
  expect(await ask(fetcher, 'help me plan')).toEqual(planningFallback);
  await enable();
  for (const message of ['help me plan', 'Help me plan: ']) {
    expect((await ask(fetcher, message)).content).toContain('What scheduling problem would you like help with?');
  }
  expect(calls).toBe(0);
  expect(sqlite.prepare('SELECT COUNT(*) n FROM planning_proposals').get()?.n).toBe(0);
});

test('LLM global, recipient and renewed planning permission are all required', async () => {
  let calls = 0; const fetcher: typeof fetch = async () => { calls++; return final(); };
  expect(await ask(fetcher)).toEqual(planningFallback);
  await setIntegration(db, config, 'llm', true, owner);
  expect(await ask(fetcher)).toEqual(planningFallback);
  sqlite.prepare('INSERT INTO settings VALUES (?,?,?)').run('assistance:llm:recipient-alex', 'true', future(0));
  expect(await ask(fetcher)).toEqual(planningFallback);
  expect(calls).toBe(0);
  await setAssistance(db, config, 'recipient-alex', 'llm', true, owner, 'owner');
  expect((await ask(fetcher)).content).toContain('AI planning draft');
  expect(calls).toBe(1);
  await setIntegration(db, config, 'llm', false, owner);
  expect(await ask(fetcher)).toEqual(planningFallback);
  await setAssistance(db, config, 'recipient-alex', 'llm', false, owner, 'owner');
  expect((await assistanceState(db, config, 'recipient-alex', true)).planningAllowed).toBe(false);
  expect(calls).toBe(1);
});

for (const change of ['consent', 'membership', 'inactive member', 'recipient']) test(`${change} prevents external planning dispatch`, async () => {
  await enable();
  if (change === 'consent') sqlite.exec("UPDATE consent_records SET status='withdrawn'");
  if (change === 'membership') sqlite.exec('DELETE FROM recipient_members');
  if (change === 'inactive member') sqlite.exec("UPDATE care_circle_members SET status='invited'");
  let calls = 0;
  const result = await assistPlanning(db, config, change === 'recipient' ? 'unrelated' : 'recipient-alex', owner.memberId, 'Help me plan: tomorrow', async () => { calls++; return final(); });
  expect(calls).toBe(0); expect(result.evidence).toEqual([]);
});

test('simulation uses existing checks and returns a review target without creating proposals or changing tasks', async () => {
  await enable(); const before = sqlite.prepare('SELECT * FROM tasks').all();
  let calls = 0;
  const result = await ask(async (url, init) => {
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(init!.body as string);
    expect(body.max_tokens).toBe(600); expect(body.provider).toMatchObject({ sort: 'price', allow_fallbacks: false });
    expect(body.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(['simulate_move']);
    expect(body.messages[1].content).not.toContain(owner.email);
    expect(body.messages[1].content).not.toContain('recipient-alex');
    expect(body.messages[1].content).not.toContain('task-physio');
    if (calls++ === 0) return call('simulate_move', { taskRef: 't1', localTime: localInput(future(2), 'America/Toronto') });
    expect(JSON.parse(body.messages.at(-1).content).conflicts).toEqual([]);
    return final('s1');
  });
  expect(calls).toBe(2);
  expect(result.evidence.find((item) => item.planningReview)?.planningReview?.taskId).toBe('task-physio');
  expect(sqlite.prepare('SELECT * FROM tasks').all()).toEqual(before);
  expect(sqlite.prepare('SELECT COUNT(*) n FROM planning_proposals').get()?.n).toBe(0);
  expect(sqlite.prepare('SELECT COUNT(*) n FROM chat_action_requests').get()?.n).toBe(0);
});

test('agent can observe a conflict, retry once, and finish within three model calls', async () => {
  await enable(); let calls = 0;
  const result = await ask(async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    if (calls++ === 0) return call('simulate_move', { taskRef: 't1', localTime: localInput(future(12), 'America/Toronto') });
    if (calls === 2) {
      expect(JSON.parse(body.messages.at(-1).content).conflicts.length).toBeGreaterThan(0);
      return call('simulate_move', { taskRef: 't1', localTime: localInput(future(2), 'America/Toronto') });
    }
    expect(body.tool_choice).toBe('none'); return final('s2');
  });
  expect(calls).toBe(3); expect(result.content).toContain('AI planning draft');
  expect(result.evidence.some((item) => item.planningReview)).toBe(true);
});

for (const invalid of ['unknown tool', 'unknown task', 'extra argument', 'invalid time', 'invented simulation', 'conflicting simulation', 'third tool', 'truncated', 'oversized']) test(`fails locally for ${invalid}`, async () => {
  await enable(); let calls = 0;
  const result = await ask(async () => {
    calls++;
    if (invalid === 'unknown tool') return call('send_email', {});
    if (invalid === 'unknown task') return call('simulate_move', { taskRef: 'other-recipient-task', localTime: localInput(future(2), 'America/Toronto') });
    if (invalid === 'extra argument') return call('simulate_move', { taskRef: 't1', localTime: localInput(future(2), 'America/Toronto'), recipientId: 'other' });
    if (invalid === 'invalid time') return call('simulate_move', { taskRef: 't1', localTime: 'tomorrow' });
    if (invalid === 'invented simulation') return final('invented');
    if (invalid === 'truncated') return Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] });
    if (invalid === 'oversized') return new Response('x'.repeat(128001));
    if (invalid === 'conflicting simulation' && calls === 2) return final('s1');
    return call('simulate_move', { taskRef: 't1', localTime: localInput(future(12), 'America/Toronto') });
  });
  expect(calls).toBeLessThanOrEqual(planningLimits.modelCalls);
  expect(result.content).toContain('temporarily unavailable'); expect(result.evidence).toEqual([]);
});

test('turning LLM off after a provider response blocks tools and further dispatches', async () => {
  await enable(); let calls = 0;
  const result = await ask(async () => {
    calls++; await setIntegration(db, config, 'llm', false, owner);
    return call('simulate_move', { taskRef: 't1', localTime: localInput(future(2), 'America/Toronto') });
  });
  expect(calls).toBe(1); expect(result.content).toContain('temporarily unavailable');
});

test('aborted requests and oversized input never dispatch', async () => {
  let calls = 0; const fetcher: typeof fetch = async () => { calls++; return final(); };
  await expect(runPlanningAssistant(config, {}, [], async () => {}, AbortSignal.abort(), fetcher)).rejects.toThrow();
  await expect(runPlanningAssistant(config, { text: 'x'.repeat(24000) }, [], async () => {}, new AbortController().signal, fetcher)).rejects.toThrow('too large');
  expect(calls).toBe(0);
});

test('planning attempts are limited per membership even when the model fails', async () => {
  await enable(); let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return new Response(null, { status: 429 }); };
  for (let i = 0; i < 12; i++) await ask(fetcher);
  expect(calls).toBe(10);
});

test('missing required care facts prevent a suggested move', async () => {
  await enable();
  sqlite.prepare('UPDATE task_planning SET requirements_json=? WHERE task_id=?').run(JSON.stringify({ capabilities: [], factIds: ['missing-fact'] }), 'task-physio');
  let calls = 0;
  const result = await ask(async (_url, init) => {
    if (calls++ === 0) return call('simulate_move', { taskRef: 't1', localTime: localInput(future(2), 'America/Toronto') });
    expect(JSON.parse(JSON.parse(init!.body as string).messages.at(-1).content).conflicts.join(' ')).toContain('verify the required care fact');
    return final('s1');
  });
  expect(result.evidence).toEqual([]); expect(result.content).toContain('temporarily unavailable');
});
