import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { ensureDatabase } from '../db/bootstrap';
import { approveCalendarAction, editCalendarAction, reviewCalendarRecovery, calendarContext, proposeCalendarAction, type CalendarContext } from '../lib/calendar-service';
import { calendarUpdateDraft } from '../lib/calendar-update';
import { publicAction } from '../lib/calendar-service';
import { loadPlanning } from '../lib/planning-service';
import { localToInstant } from '../lib/calendar-time';
import { calendarRequest, exchangeCode, openToken, sealToken, type GoogleEvent } from '../lib/google-calendar';

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

test('reviewed reschedule guest changes are sent only after approval', async () => {
  const create = await proposeCalendarAction(context, config, { ...draft, attendees: '' });
  await approveCalendarAction(context, config, create);
  const reschedule = await proposeCalendarAction(context, config, { ...draft, attendees: '', kind: 'reschedule', appointmentId: create, startLocal: '2030-01-16T10:00', endLocal: '2030-01-16T11:00' });
  await editCalendarAction(context, config, reschedule, { ...draft, attendees: 'guest@example.test', startLocal: '2030-01-16T10:00', endLocal: '2030-01-16T11:00' });
  expect(writes).toHaveLength(1);
  expect(googleEvents.get(create.replaceAll('-', ''))!.attendees).toEqual([]);
  await approveCalendarAction(context, config, reschedule);
  expect(writes).toHaveLength(2);
  expect(writes[1].body.attendees).toEqual([{ email: 'guest@example.test' }]);
  expect(writes[1].url.searchParams.get('sendUpdates')).toBe('all');
  expect(sqlite.prepare('SELECT attendees_json FROM calendar_appointments WHERE id=?').get(create)).toMatchObject({ attendees_json: '["guest@example.test"]' });
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

test('calendar reads reject redirects without forwarding credentials', async () => {
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests++;
    expect(init?.redirect).toBe('manual');
    return new Response(null, { status: 302, headers: { Location: 'https://other.example' } });
  };
  await expect(calendarRequest('access-secret', 'users/me/calendarList')).rejects.toThrow(/could not be loaded/);
  expect(requests).toBe(1);
});

test('calendar read outages do not report an unconfirmed event action', async () => {
  globalThis.fetch = async () => new Response(null, { status: 503 });
  await expect(calendarRequest('access-secret', 'users/me/calendarList')).rejects.toThrow(/Refresh to try again/);
  await expect(calendarRequest('access-secret', 'calendars/primary/events', { method: 'POST' })).rejects.toThrow(/did not confirm/);
  globalThis.fetch = async () => { throw new TypeError('Network failure'); };
  await expect(calendarRequest('access-secret', 'users/me/calendarList')).rejects.toThrow(/Refresh to try again/);
});


test('editing a proposal saves locally and approval sends the revised invitation once', async () => {
  const id = await proposeCalendarAction(context, config, draft);
  await editCalendarAction(context, config, id, { ...draft, title: 'Updated visit', attendees: 'new@example.test', location: 'New clinic' });
  expect(writes).toHaveLength(0);
  await approveCalendarAction(context, config, id);
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({ summary: 'Updated visit', location: 'New clinic', attendees: [{ email: 'new@example.test' }] });
});

test('editing enforces permissions, validation and unresolved Google results', async () => {
  const id = await proposeCalendarAction(context, config, draft);
  await expect(editCalendarAction({ ...context, role: 'viewer' }, config, id, draft)).rejects.toThrow(/Only owners/);
  await expect(editCalendarAction({ ...context, consent: false }, config, id, draft)).rejects.toThrow(/withdrawn/);
  await expect(editCalendarAction({ ...context, recipientId: 'other' }, config, id, draft)).rejects.toThrow(/not found/);
  await expect(editCalendarAction(context, config, id, { ...draft, attendees: 'invalid' })).rejects.toThrow(/valid guest/);
  for (const status of ['executing', 'uncertain', 'executed', 'rejected']) {
    sqlite.prepare('UPDATE calendar_actions SET status=? WHERE id=?').run(status, id);
    await expect(editCalendarAction(context, config, id, draft)).rejects.toThrow(/cannot be edited/);
  }
  expect(writes).toHaveLength(0);
});

test('editing a reschedule preserves event details and rechecks external changes', async () => {
  const create = await proposeCalendarAction(context, config, draft);
  await approveCalendarAction(context, config, create);
  const id = await proposeCalendarAction(context, config, { ...draft, kind: 'reschedule', appointmentId: create });
  const edited = { ...draft, title: 'Ignored title', attendees: 'other@example.test', startLocal: '2030-01-16T10:00', endLocal: '2030-01-16T11:00' };
  await editCalendarAction(context, config, id, edited);
  const row = sqlite.prepare('SELECT payload_json FROM calendar_actions WHERE id=?').get(id) as { payload_json: string };
  expect(JSON.parse(row.payload_json)).toMatchObject({ title: draft.title, attendees: ['other@example.test'], start: '2030-01-16T15:00:00.000Z' });
  expect(writes).toHaveLength(1);
  googleEvents.get(create.replaceAll('-', ''))!.etag = 'external-edit';
  await expect(editCalendarAction(context, config, id, edited)).rejects.toThrow(/changed in Google/);
});

async function linkedAppointment() {
  const created = await proposeCalendarAction(context, config, draft);
  await approveCalendarAction(context, config, created);
  sqlite.prepare('INSERT INTO care_circle_members VALUES (?,?,?,?,?,?,?,?,?)').run('member-test', 'household-demo', 'user-test', 'owner@example.test', 'Owner', 'owner', 'active', '2030-01-01', '2030-01-01');
  sqlite.prepare('INSERT INTO recipient_members VALUES (?,?,?,?,?)').run('calendar-test-membership', context.recipientId, 'member-test', 'owner', '2030-01-01');
  sqlite.prepare("UPDATE tasks SET owner='Owner' WHERE id='task-physio'").run();
  sqlite.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?)').run('calendar-ride', 'Drive Alex to physiotherapy', 'Owner', '2030-01-15T20:00:00.000Z', 'scheduled', 'transport', null);
  sqlite.prepare('INSERT INTO record_scopes VALUES (?,?,?,?,?,?)').run('scope-calendar-ride', 'task', 'calendar-ride', context.recipientId, 'plan-alex', '2030-01-01');
  for (const [id, duration, parent] of [['task-physio', 60, ''], ['calendar-ride', 30, 'task-physio']]) sqlite.prepare('INSERT OR REPLACE INTO task_planning VALUES (?,?,?,?,?,?,?,?)').run(id, context.recipientId, 'member-test', duration, parent, '', '[]', 'previous-acceptance');
  sqlite.prepare('INSERT INTO caregiver_availability VALUES (?,?,?,?,?,?,?)').run('calendar-window', context.recipientId, 'member-test', '2030-01-15T00:00:00Z', '2030-01-20T00:00:00Z', '["appointment","transport"]', '[]');
  return created;
}
const movedDraft = (appointmentId: string) => ({ ...draft, kind: 'reschedule', appointmentId, startLocal: '2030-01-16T10:00', endLocal: '2030-01-16T11:00' });
const actionRow = (id: string) => sqlite.prepare('SELECT * FROM calendar_actions WHERE id=?').get(id) as unknown as Parameters<typeof publicAction>[0];

test('combined preview updates linked tasks only after approval, invalidates acceptance, and supplies an unsent update', async () => {
  const created = await linkedAppointment();
  const baseline = (await loadPlanning(context.db, context.recipientId, context.member.memberId)).handover.snapshot;
  sqlite.prepare('INSERT INTO handover_checkpoints VALUES (?,?,?,?)').run(context.recipientId, context.member.memberId, JSON.stringify(baseline), new Date().toISOString());
  const id = await proposeCalendarAction(context, config, movedDraft(created));
  const proposal = publicAction(actionRow(id));
  expect(proposal.payload.carePlan?.changes).toHaveLength(2);
  expect(proposal.payload.carePlan?.conflicts).toEqual([]);
  expect(calendarUpdateDraft(proposal)).toBeUndefined();
  expect(writes).toHaveLength(1);
  await approveCalendarAction(context, config, id);
  await approveCalendarAction(context, config, id);
  expect(writes).toHaveLength(2);
  expect(sqlite.prepare("SELECT due_at FROM tasks WHERE id='calendar-ride'").get()).toMatchObject({ due_at: '2030-01-16T14:30:00.000Z' });
  expect(sqlite.prepare("SELECT accepted_signature FROM task_planning WHERE task_id='calendar-ride'").get()).toMatchObject({ accepted_signature: '' });
  const after = await loadPlanning(context.db, context.recipientId, context.member.memberId);
  expect(after.handover.changes.filter(change => change.id.startsWith('task:'))).toHaveLength(2);
  const notification = calendarUpdateDraft(publicAction(actionRow(id)));
  expect(notification?.detail).toContain('Drive Alex to physiotherapy');
  expect(notification?.detail).toContain('confirm you can still cover');
  expect(sqlite.prepare('SELECT COUNT(*) count FROM notification_deliveries').get()).toMatchObject({ count: 0 });
});

test('availability, dependency changes and another linked Google event block approval without a Google write', async () => {
  const created = await linkedAppointment();
  const id = await proposeCalendarAction(context, config, movedDraft(created));
  sqlite.prepare("DELETE FROM caregiver_availability WHERE id='calendar-window'").run();
  await expect(approveCalendarAction(context, config, id)).rejects.toThrow(/availability/);
  await editCalendarAction(context, config, id, movedDraft(created));
  expect(publicAction(actionRow(id)).payload.carePlan?.conflicts.length).toBeGreaterThan(0);
  sqlite.prepare("UPDATE task_planning SET depends_on='' WHERE task_id='calendar-ride'").run();
  await expect(approveCalendarAction(context, config, id)).rejects.toThrow(/plan changed/);
  sqlite.prepare("UPDATE task_planning SET depends_on='task-physio' WHERE task_id='calendar-ride'").run();
  sqlite.prepare("INSERT INTO calendar_appointments SELECT 'other-calendar',recipient_id,member_id,connection_id,calendar_id,'other-event','calendar-ride',title,start_at,end_at,timezone,location,attendees_json,reminder_minutes,status,html_link,updated_at FROM calendar_appointments WHERE id=?").run(created);
  await editCalendarAction(context, config, id, movedDraft(created));
  expect(publicAction(actionRow(id)).payload.carePlan?.conflicts.join(' ')).toContain('connected appointment');
  expect(writes).toHaveLength(1);
});

test('local failure after Google success rolls back the whole care update and retry does not resend', async () => {
  const created = await linkedAppointment();
  const id = await proposeCalendarAction(context, config, movedDraft(created));
  sqlite.exec("CREATE TRIGGER fail_ride BEFORE UPDATE ON tasks WHEN NEW.id='calendar-ride' BEGIN SELECT RAISE(ABORT,'simulated local failure'); END");
  await expect(approveCalendarAction(context, config, id)).rejects.toThrow(/Google Calendar was updated.*incomplete/);
  expect(publicAction(actionRow(id))).toMatchObject({ status: 'uncertain', payload: { googleConfirmed: true } });
  expect(sqlite.prepare("SELECT due_at FROM tasks WHERE id='task-physio'").get()).toMatchObject({ due_at: '2030-01-15T20:30:00.000Z' });
  expect(sqlite.prepare("SELECT due_at FROM tasks WHERE id='calendar-ride'").get()).toMatchObject({ due_at: '2030-01-15T20:00:00.000Z' });
  expect(calendarUpdateDraft(publicAction(actionRow(id)))).toBeUndefined();
  sqlite.exec('DROP TRIGGER fail_ride');
  await approveCalendarAction(context, config, id);
  expect(writes).toHaveLength(2);
  expect(publicAction(actionRow(id)).status).toBe('executed');
});

test('a lost Google response and a changed local task require reviewed recovery, without resending', async () => {
  const created = await linkedAppointment();
  const id = await proposeCalendarAction(context, config, movedDraft(created));
  loseNextResponse = true;
  await expect(approveCalendarAction(context, config, id)).rejects.toThrow(/did not confirm/);
  sqlite.prepare("UPDATE tasks SET title='Updated ride instructions' WHERE id='calendar-ride'").run();
  await expect(approveCalendarAction(context, config, id)).rejects.toThrow(/plan changed/);
  await expect(reviewCalendarRecovery({ ...context, role: 'viewer' }, config, id)).rejects.toThrow(/Only owners/);
  await reviewCalendarRecovery(context, config, id);
  expect(publicAction(actionRow(id)).payload.carePlan?.changes.find(c => c.taskId === 'calendar-ride')?.title).toBe('Updated ride instructions');
  expect(writes).toHaveLength(2);
  await approveCalendarAction(context, config, id);
  expect(writes).toHaveLength(2);
  expect(publicAction(actionRow(id)).status).toBe('executed');
});

test('recovery refuses a Google event edited after the successful write', async () => {
  const created = await linkedAppointment();
  const id = await proposeCalendarAction(context, config, movedDraft(created));
  loseNextResponse = true;
  await expect(approveCalendarAction(context, config, id)).rejects.toThrow();
  googleEvents.get(created.replaceAll('-', ''))!.start = { dateTime: '2030-01-17T15:00:00Z' };
  await expect(reviewCalendarRecovery(context, config, id)).rejects.toThrow(/could not be confirmed/);
  await expect(approveCalendarAction(context, config, id)).rejects.toThrow(/changed after/);
  expect(writes).toHaveLength(2);
});
