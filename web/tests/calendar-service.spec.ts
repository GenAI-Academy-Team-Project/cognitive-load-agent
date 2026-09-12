import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { ensureDatabase } from '../db/bootstrap';
import { approveCalendarAction, calendarContext, proposeCalendarAction, type CalendarContext } from '../lib/calendar-service';
import { localToInstant } from '../lib/calendar-time';
import { exchangeCode, openToken, sealToken, type GoogleEvent } from '../lib/google-calendar';

// Execute the production SQL against SQLite, with D1's transactional batch semantics.
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

const config = { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_REDIRECT_URI: 'http://localhost/api/calendar/callback', GOOGLE_TOKEN_KEY: 'a'.repeat(64) };
const draft = { kind: 'create', title: 'Care appointment', timeZone: 'America/Toronto', startLocal: '2030-01-15T15:30', endLocal: '2030-01-15T16:30', attendees: 'maya@example.test', location: 'Clinic', reminderMinutes: 30, taskId: 'task-physio' };
let sqlite: DatabaseSync;
let context: CalendarContext;
let originalFetch: typeof fetch;
let googleEvents: Map<string, GoogleEvent>;
let writes: { method: string; url: URL; body: Record<string, unknown> }[];
let loseNextResponse: boolean;

test.beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:');
  const db = database(sqlite); await ensureDatabase(db);
  context = { db, member: { id: 'user-test', email: 'owner@example.test', displayName: 'Owner', memberId: 'member-test', role: 'owner', status: 'active' }, recipientId: 'recipient-alex', recipientName: 'Alex', timeZone: 'America/Toronto', role: 'owner', consent: true };
  await db.prepare('INSERT INTO google_connections VALUES (?,?,?,?,?,?,?)').bind('member-test', 'connection-test', 'google-user', 'google@example.test', await sealToken('refresh-secret', config.GOOGLE_TOKEN_KEY, 'member-test'), 'connected', new Date().toISOString()).run();
  await db.prepare('INSERT INTO calendar_bindings VALUES (?,?,?,?,?)').bind('member-test', 'recipient-alex', 'connection-test', 'primary@example.test', 'Care calendar').run();
  googleEvents = new Map(); writes = []; loseNextResponse = false; originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input); const method = init?.method || 'GET';
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'access-secret' });
    if (url.hostname !== 'www.googleapis.com') throw new Error('Unexpected network request');
    const eventId = decodeURIComponent(url.pathname.split('/').at(-1)!);
    if (method === 'GET') return googleEvents.has(eventId) ? Response.json(googleEvents.get(eventId)) : new Response(null, { status: 404 });
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
    writes.push({ method, url, body });
    if (method === 'POST') {
      if (googleEvents.has(body.id)) return new Response(null, { status: 409 });
      googleEvents.set(body.id, { ...body, etag: 'v1', htmlLink: `https://calendar.google.com/calendar/event?eid=${body.id}`, status: 'confirmed' });
    } else {
      const current = googleEvents.get(eventId)!;
      if (new Headers(init?.headers).get('If-Match') !== current.etag) return new Response(null, { status: 412 });
      googleEvents.set(eventId, { ...current, ...body, etag: 'v2', status: method === 'DELETE' ? 'cancelled' : 'confirmed' });
    }
    if (loseNextResponse) { loseNextResponse = false; throw new TypeError('Simulated lost response after Google commits'); }
    return method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json(googleEvents.get(method === 'POST' ? body.id : eventId));
  };
});
test.afterEach(() => { globalThis.fetch = originalFetch; sqlite.close(); });

test('proposal has no external or task write; approval sends once and saves trace', async () => {
  const before = sqlite.prepare("SELECT due_at FROM tasks WHERE id='task-physio'").get();
  const id = await proposeCalendarAction(context, config, draft);
  expect(writes).toHaveLength(0);
  expect(sqlite.prepare("SELECT due_at FROM tasks WHERE id='task-physio'").get()).toEqual(before);
  await Promise.allSettled([approveCalendarAction(context, config, id), approveCalendarAction(context, config, id)]);
  await approveCalendarAction(context, config, id);
  expect(writes).toHaveLength(1);
  expect(writes[0].url.searchParams.get('sendUpdates')).toBe('all');
  expect(writes[0].body).toMatchObject({ visibility: 'private', guestsCanSeeOtherGuests: false, attendees: [{ email: 'maya@example.test' }] });
  expect(sqlite.prepare('SELECT status FROM calendar_actions WHERE id=?').get(id)).toMatchObject({ status: 'executed' });
  expect(sqlite.prepare('SELECT COUNT(*) count FROM calendar_appointments').get()).toMatchObject({ count: 1 });
  expect(sqlite.prepare("SELECT due_at FROM tasks WHERE id='task-physio'").get()).toMatchObject({ due_at: '2030-01-15T20:30:00.000Z' });
  expect(sqlite.prepare('SELECT tool FROM traces WHERE id=?').get(`calendar-${id}`)).toMatchObject({ tool: 'Google Calendar' });
});

test('lost response is reconciled without a duplicate invitation', async () => {
  const id = await proposeCalendarAction(context, config, draft);
  loseNextResponse = true;
  await expect(approveCalendarAction(context, config, id)).rejects.toThrow(/did not confirm/);
  expect(sqlite.prepare('SELECT status FROM calendar_actions WHERE id=?').get(id)).toMatchObject({ status: 'uncertain' });
  expect(sqlite.prepare('SELECT COUNT(*) count FROM calendar_appointments').get()).toMatchObject({ count: 0 });
  await approveCalendarAction(context, config, id);
  expect(writes).toHaveLength(1);
  expect(sqlite.prepare('SELECT status FROM calendar_actions WHERE id=?').get(id)).toMatchObject({ status: 'executed' });
});

test('reschedule and cancel use Google guests and notify only after approval', async () => {
  const create = await proposeCalendarAction(context, config, draft); await approveCalendarAction(context, config, create);
  const reschedule = await proposeCalendarAction(context, config, { ...draft, kind: 'reschedule', appointmentId: create, startLocal: '2030-01-16T10:00', endLocal: '2030-01-16T11:00' });
  expect(writes).toHaveLength(1);
  await approveCalendarAction(context, config, reschedule);
  expect(writes[1].method).toBe('PATCH');
  expect(writes[1].body.start).toMatchObject({ dateTime: '2030-01-16T15:00:00.000Z' });
  const cancel = await proposeCalendarAction(context, config, { kind: 'cancel', appointmentId: create });
  loseNextResponse = true;
  await expect(approveCalendarAction(context, config, cancel)).rejects.toThrow();
  await approveCalendarAction(context, config, cancel);
  expect(writes).toHaveLength(3);
  expect(writes[2].method).toBe('DELETE');
  expect(writes.every((write) => write.url.searchParams.get('sendUpdates') === 'all')).toBe(true);
  expect(sqlite.prepare('SELECT status FROM calendar_appointments WHERE id=?').get(create)).toMatchObject({ status: 'cancelled' });
  expect(sqlite.prepare("SELECT status FROM tasks WHERE id='task-physio'").get()).toMatchObject({ status: 'open' });
});

test('external edits invalidate approval instead of overwriting the event', async () => {
  const create = await proposeCalendarAction(context, config, draft); await approveCalendarAction(context, config, create);
  const update = await proposeCalendarAction(context, config, { ...draft, kind: 'reschedule', appointmentId: create });
  googleEvents.get(create.replaceAll('-', ''))!.etag = 'externally-edited';
  await expect(approveCalendarAction(context, config, update)).rejects.toThrow(/changed in Google/);
  expect(writes).toHaveLength(1);
});

test('rejects viewer, withdrawn consent, cross-recipient task, other member and replaced account', async () => {
  await expect(proposeCalendarAction({ ...context, role: 'viewer' }, config, draft)).rejects.toThrow(/Only owners/);
  await expect(proposeCalendarAction({ ...context, consent: false }, config, draft)).rejects.toThrow(/withdrawn/);
  await expect(calendarContext(context.db, context.member, 'unknown-recipient')).rejects.toThrow(/access/);
  await expect(proposeCalendarAction(context, config, { ...draft, taskId: 'other-recipient-task' })).rejects.toThrow(/active responsibility/);
  const id = await proposeCalendarAction(context, config, draft);
  await expect(approveCalendarAction({ ...context, member: { ...context.member, memberId: 'someone-else' } }, config, id)).rejects.toThrow(/not found/);
  sqlite.prepare("UPDATE google_connections SET id='replacement'").run();
  await expect(approveCalendarAction(context, config, id)).rejects.toThrow(/Reconnect the Google account/);
  expect(writes).toHaveLength(0);
});

test('validates dates and attendees, prevents multiple proposals for one responsibility', async () => {
  await expect(proposeCalendarAction(context, config, { ...draft, attendees: 'invalid' })).rejects.toThrow(/valid guest/);
  await expect(proposeCalendarAction(context, config, { ...draft, endLocal: draft.startLocal })).rejects.toThrow(/end must be after/);
  await proposeCalendarAction(context, config, draft);
  await expect(proposeCalendarAction(context, config, draft)).rejects.toThrow(/unresolved calendar action/);
});

test('timezone conversion handles winter, summer, invalid dates, DST gaps and repeats', () => {
  expect(localToInstant('2030-01-15T15:30', 'America/Toronto')).toBe('2030-01-15T20:30:00.000Z');
  expect(localToInstant('2030-07-15T15:30', 'America/Toronto')).toBe('2030-07-15T19:30:00.000Z');
  expect(() => localToInstant('2026-03-08T02:30', 'America/Toronto')).toThrow(/clock change/);
  expect(() => localToInstant('2026-11-01T01:30', 'America/Toronto')).toThrow(/clock change/);
  expect(() => localToInstant('2030-02-30T15:30', 'UTC')).toThrow(/valid date/);
});

test('refresh tokens are encrypted and bound to their member; missing OAuth permissions fail', async () => {
  const token = await sealToken('secret-value', config.GOOGLE_TOKEN_KEY, 'member-one');
  expect(token).not.toContain('secret-value');
  expect(await openToken(token, config.GOOGLE_TOKEN_KEY, 'member-one')).toBe('secret-value');
  await expect(openToken(token, config.GOOGLE_TOKEN_KEY, 'member-two')).rejects.toThrow();
  await expect(exchangeCode(config, 'code', 'verifier')).rejects.toThrow(/Grant Calendar permissions/);
});

test('new appointments create a scoped responsibility; completed linked tasks cannot be scheduled', async () => {
  const id = await proposeCalendarAction(context, config, { ...draft, taskId: '' });
  await approveCalendarAction(context, config, id);
  expect(sqlite.prepare("SELECT s.recipient_id,t.status FROM tasks t JOIN record_scopes s ON s.entity_id=t.id AND s.entity_type='task' WHERE t.id=?").get(`calendar-${id}`)).toMatchObject({ recipient_id: 'recipient-alex', status: 'scheduled' });
  const linked = await proposeCalendarAction(context, config, draft);
  sqlite.prepare("UPDATE tasks SET status='complete' WHERE id='task-physio'").run();
  await expect(approveCalendarAction(context, config, linked)).rejects.toThrow(/no longer active/);
  expect(writes).toHaveLength(1);
});

test('revoked credentials require reconnection and never write an event', async () => {
  const id = await proposeCalendarAction(context, config, draft);
  globalThis.fetch = async () => Response.json({ error: 'invalid_grant' }, { status: 400 });
  await expect(approveCalendarAction(context, config, id)).rejects.toThrow(/revoked/);
  expect(sqlite.prepare('SELECT status FROM google_connections').get()).toMatchObject({ status: 'reconnect_required' });
  expect(writes).toHaveLength(0);
});
