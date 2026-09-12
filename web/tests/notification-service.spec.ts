import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { ensureDatabase } from '../db/bootstrap';
import { executeNotification, prepareNotification, parseNotificationRequest, sendViaProvider, validateSubscription } from '../lib/notification-service';

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
let sends: { url: string; init?: RequestInit }[];
const config = { RESEND_API_KEY: 'synthetic', NOTIFICATION_EMAIL_FROM: 'care@example.com', TWILIO_ACCOUNT_SID: 'ACsynthetic', TWILIO_AUTH_TOKEN: 'synthetic', TWILIO_FROM_NUMBER: '+14165550100' };
const input = { channel: 'email' as const, memberId: 'target', title: 'Care update', detail: 'Please review the care plan.' };

test.beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:'); db = database(sqlite); await ensureDatabase(db);
  sends = []; originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sends.push({ url: url instanceof Request ? url.url : url.toString(), init }); return Response.json({ id: 'receipt', sid: 'sms-receipt' }); };
  for (const id of ['actor', 'target']) {
    sqlite.prepare('INSERT INTO care_circle_members VALUES (?,?,?,?,?,?,?,?,?)').run(id, 'household', id, id + '@example.com', id, 'caregiver', 'active', '2030', '2030');
    sqlite.prepare('INSERT INTO recipient_members VALUES (?,?,?,?,?)').run(id, 'recipient-alex', id, 'caregiver', '2030');
  }
  sqlite.prepare('INSERT INTO notification_preferences VALUES (?,?,?,?,?,?,?)').run('recipient-alex', 'target', 1, 1, '+14165550123', null, '2030');
});
test.afterEach(() => { globalThis.fetch = originalFetch; sqlite.close(); });

async function proposal(override = {}) {
  const proposed = await prepareNotification(db, config, 'recipient-alex', { ...input, ...override });
  const id = crypto.randomUUID();
  sqlite.prepare('INSERT INTO chat_action_requests VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, 'thread', 'recipient-alex', 'actor', 'send_notification', proposed.summary, JSON.stringify(proposed.payload), 'pending', 'true', '2030', null, null);
  return { id, payload: proposed.payload };
}
const execute = (action: Awaited<ReturnType<typeof proposal>>) => executeNotification(db, config, 'recipient-alex', 'actor', action.id, action.payload);

test('preparing a tool call never sends; approved execution sends the exact preview once', async () => {
  const action = await proposal();
  expect(sends).toHaveLength(0);
  expect(action.payload.destinationLabel).toBe('target@example.com');
  expect(await execute(action)).toContain('accepted');
  expect(sends).toHaveLength(1);
  expect(JSON.parse(sends[0].init!.body as string)).toEqual({ from: 'care@example.com', to: ['target@example.com'], subject: input.title, text: input.detail });
  expect((sends[0].init!.headers as Record<string, string>)['Idempotency-Key']).toBe(action.id);
  await expect(execute(action)).rejects.toThrow('already attempted');
  expect(sends).toHaveLength(1);
});

test('concurrent approvals call the provider once', async () => {
  const action = await proposal();
  const results = await Promise.allSettled([execute(action), execute(action)]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(sends).toHaveLength(1);
});

test('rejected and nonexistent actions cannot send', async () => {
  const action = await proposal();
  sqlite.prepare("UPDATE chat_action_requests SET status='rejected' WHERE id=?").run(action.id);
  await expect(execute(action)).rejects.toThrow('already attempted');
  await expect(execute({ ...action, id: 'missing' })).rejects.toThrow('already attempted');
  expect(sends).toHaveLength(0);
});

test('withdrawn consent, opt-out, revoked access and changed destinations block stale approvals', async () => {
  const action = await proposal();
  sqlite.exec("UPDATE consent_records SET status='withdrawn' WHERE recipient_id='recipient-alex'");
  await expect(execute(action)).rejects.toThrow('Consent');
  sqlite.exec("UPDATE consent_records SET status='active' WHERE recipient_id='recipient-alex'; UPDATE notification_preferences SET email_enabled=0");
  await expect(execute(action)).rejects.toThrow('not enabled');
  sqlite.exec("UPDATE notification_preferences SET email_enabled=1; UPDATE care_circle_members SET email='changed@example.com' WHERE id='target'");
  await expect(execute(action)).rejects.toThrow('destination changed');
  sqlite.exec("UPDATE care_circle_members SET email='target@example.com' WHERE id='target'; DELETE FROM recipient_members WHERE member_id='target'");
  await expect(execute(action)).rejects.toThrow('active member');
  expect(sends).toHaveLength(0);
});

test('viewer or revoked sender cannot execute, and cross-recipient targets are rejected', async () => {
  const action = await proposal();
  sqlite.exec("UPDATE recipient_members SET access_role='viewer' WHERE member_id='actor'");
  await expect(execute(action)).rejects.toThrow('access no longer');
  await expect(prepareNotification(db, config, 'other-recipient', input)).rejects.toThrow('active member');
  expect(sends).toHaveLength(0);
});

test('missing provider configuration fails before creating a send', async () => {
  await expect(prepareNotification(db, {}, 'recipient-alex', input)).rejects.toThrow('not configured');
  expect(sends).toHaveLength(0);
});

test('provider rejections and timeouts are recorded without claiming delivery or retrying', async () => {
  globalThis.fetch = async () => new Response('secret provider error', { status: 400 });
  const rejected = await proposal();
  expect(await execute(rejected)).toContain('failed');
  expect(sqlite.prepare('SELECT status,error_code FROM notification_deliveries WHERE action_id=?').get(rejected.id)).toEqual({ status: 'failed', error_code: 'provider_http_400' });
  globalThis.fetch = async () => { throw new Error('timeout'); };
  const uncertain = await proposal();
  expect(await execute(uncertain)).toContain('unknown');
  await expect(execute(uncertain)).rejects.toThrow('already attempted');
});

test('SMS uses the saved opted-in number and exact approved text', async () => {
  const action = await proposal({ channel: 'sms' });
  await execute(action);
  expect(sends[0].url).toContain('api.twilio.com/2010-04-01/Accounts/');
  const body = new URLSearchParams(sends[0].init!.body as string);
  expect(body.get('To')).toBe('+14165550123');
  expect(body.get('Body')).toBe(input.title + '\n' + input.detail);
});

test('in-app sends work without provider keys and are targeted', async () => {
  const action = await proposal({ channel: 'in_app' });
  expect(await executeNotification(db, {}, 'recipient-alex', 'actor', action.id, action.payload)).toContain('inbox');
  expect(sends).toHaveLength(0);
  expect(sqlite.prepare('SELECT member_id,status FROM notification_deliveries').get()).toEqual({ member_id: 'target', status: 'posted' });
});

test('explicit command grammar preserves message text and refuses inference', () => {
  expect(parseNotificationRequest('Email Maya: Do not change the appointment.')).toEqual({ channel: 'email', target: 'Maya', title: 'Caregiver update', detail: 'Do not change the appointment.' });
  expect(parseNotificationRequest('SMS me: Review: today')).toMatchObject({ channel: 'sms', target: 'me', detail: 'Review: today' });
  expect(parseNotificationRequest('In-app Notification Viewer: Review today.')).toMatchObject({ target: 'Notification Viewer', channel: 'in_app' });
  expect(parseNotificationRequest('Push notification to Maya: Review today.')).toMatchObject({ target: 'Maya', channel: 'push' });
  expect(parseNotificationRequest('Should I email someone?')).toBeNull();
  expect(parseNotificationRequest('Do not email Maya: hello')).toBeNull();
});

test('push validates destinations and generates an encrypted request', async () => {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
  expect(() => validateSubscription({ ...subscription, endpoint: 'https://127.0.0.1/private' })).toThrow();
  expect(() => validateSubscription({ ...subscription, endpoint: 'https://fcm.googleapis.com.attacker.example/private' })).toThrow();
  const keys = webpush.generateVAPIDKeys();
  const result = await sendViaProvider({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: 'mailto:care@example.com' }, { ...input, channel: 'push' }, JSON.stringify(subscription), crypto.randomUUID(), 'recipient-alex');
  expect(result.status).toBe('accepted');
  expect(sends[0].init!.body).toBeInstanceOf(Uint8Array);
  expect(Buffer.from(sends[0].init!.body as Uint8Array).toString()).not.toContain(input.detail);
});

test('Pushover approval sends once with private keys excluded from previews and history', async () => {
  const userKey = 'u'.repeat(30), token = 'a'.repeat(30);
  const cfg = { PUSHOVER_API_TOKEN: token };
  sqlite.prepare('INSERT INTO pushover_preferences VALUES (?,?,?,?)').run('recipient-alex', 'target', userKey, '2030');
  const proposed = await prepareNotification(db, cfg, 'recipient-alex', { ...input, channel: 'pushover' });
  expect(JSON.stringify(proposed)).not.toContain(userKey);
  expect(sends).toHaveLength(0);
  const id = crypto.randomUUID();
  sqlite.prepare('INSERT INTO chat_action_requests VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, 'thread', 'recipient-alex', 'actor', 'send_notification', proposed.summary, JSON.stringify(proposed.payload), 'pending', 'true', '2030', null, null);
  globalThis.fetch = async (url, init) => { sends.push({ url: url instanceof Request ? url.url : url.toString(), init }); return Response.json({ status: 1, request: 'receipt' }); };
  expect(await executeNotification(db, cfg, 'recipient-alex', 'actor', id, proposed.payload)).toContain('accepted');
  expect(sends).toHaveLength(1);
  expect(sends[0].url).toBe('https://api.pushover.net/1/messages.json');
  expect(Object.fromEntries(new URLSearchParams(sends[0].init!.body as string))).toEqual({ token, user: userKey, title: input.title, message: input.detail, priority: '0' });
  expect(sqlite.prepare('SELECT destination FROM notification_deliveries WHERE action_id=?').get(id)?.destination).toBe('Registered Pushover account');
  await expect(executeNotification(db, cfg, 'recipient-alex', 'actor', id, proposed.payload)).rejects.toThrow('already attempted');
  expect(sends).toHaveLength(1);
});

test('Pushover opt-out, changed keys, and disabled integration block pending sends', async () => {
  const cfg = { PUSHOVER_API_TOKEN: 'a'.repeat(30) }, request = { ...input, channel: 'pushover' };
  await expect(prepareNotification(db, cfg, 'recipient-alex', request)).rejects.toThrow('enable Pushover');
  sqlite.prepare('INSERT INTO pushover_preferences VALUES (?,?,?,?)').run('recipient-alex', 'target', 'u'.repeat(30), '2030');
  const p = await prepareNotification(db, cfg, 'recipient-alex', request);
  sqlite.prepare('UPDATE pushover_preferences SET user_key=?').run('v'.repeat(30));
  await expect(executeNotification(db, cfg, 'recipient-alex', 'actor', 'unused', p.payload)).rejects.toThrow('destination changed');
  await expect(executeNotification(db, {}, 'recipient-alex', 'actor', 'unused', p.payload)).rejects.toThrow('not configured');
  sqlite.exec('DELETE FROM pushover_preferences');
  await expect(executeNotification(db, cfg, 'recipient-alex', 'actor', 'unused', p.payload)).rejects.toThrow('enable Pushover');
  expect(sends).toHaveLength(0);
  expect(parseNotificationRequest('Pushover me: Mobile test.')).toMatchObject({ channel: 'pushover', target: 'me', detail: 'Mobile test.' });
});

test('Pushover rejection and ambiguous results never claim delivery', async () => {
  const cfg = { PUSHOVER_API_TOKEN: 'a'.repeat(30) }, request = { ...input, channel: 'pushover' as const };
  for (const [body, expected] of [[{ status: 0, errors: ['private-provider-detail'] }, 'failed'], [{ status: 1 }, 'unknown']] as const) {
    globalThis.fetch = async () => Response.json(body);
    const result = await sendViaProvider(cfg, request, 'u'.repeat(30), 'action', 'recipient-alex');
    expect(result.status).toBe(expected);
    expect(JSON.stringify(result)).not.toContain('private-provider-detail');
  }
  globalThis.fetch = async () => { throw new Error('timeout'); };
  expect((await sendViaProvider(cfg, request, 'u'.repeat(30), 'action', 'recipient-alex')).status).toBe('unknown');
});
