import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { ensureDatabase } from '../db/bootstrap';
import { requestPasswordReset, resetPassword } from '../lib/password-recovery';
import { hashPassword, verifyPassword, tokenHash } from '../lib/sessions';
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
let sqlite: DatabaseSync, db: D1Database;
const config = { AUTH_PUBLIC_URL: 'https://care.example', RESEND_API_KEY: 'test', NOTIFICATION_EMAIL_FROM: 'care@example.test' };
let tokens: string[];
const send: typeof fetch = async (_url, init) => {
  const email = JSON.parse(init?.body as string);
  expect(email.to).toEqual(['person@example.test']);
  tokens.push(email.text.match(/https:\/\/care.example\/reset-password#token=([a-f0-9]{64})/)[1]);
  return Response.json({ id: 'sent' });
};
test.beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:'); db = database(sqlite); await ensureDatabase(db); tokens = [];
  await db.prepare('INSERT INTO auth_accounts VALUES (?,?,?,?,?)').bind('person', 'person@example.test', 'Person', await hashPassword('original password'), new Date().toISOString()).run();
  await db.prepare('INSERT INTO auth_sessions VALUES (?,?,?)').bind('session', 'person', '2099-01-01').run();
});
test.afterEach(() => sqlite.close());
const requestReset = () => requestPasswordReset(db, { email: ' Person@Example.Test ' }, config, send);
const reset = (token: string) => resetPassword(db, { token, password: 'Replacement password 2026!', confirmPassword: 'Replacement password 2026!' });

test('emails a hashed, single-use reset and revokes sessions atomically', async () => {
  await requestReset();
  expect(sqlite.prepare('SELECT token_hash FROM auth_password_resets').get()?.token_hash).toBe(tokenHash(tokens[0]));
  const outcomes = await Promise.allSettled([reset(tokens[0]), reset(tokens[0])]);
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(sqlite.prepare('SELECT * FROM auth_sessions').all()).toHaveLength(0);
  expect(sqlite.prepare('SELECT * FROM auth_password_resets').all()).toHaveLength(0);
  const hash = String(sqlite.prepare('SELECT password_hash FROM auth_accounts').get()?.password_hash);
  expect(await verifyPassword('Replacement password 2026!', hash)).toBe(true);
  expect(await verifyPassword('original password', hash)).toBe(false);
  await expect(reset(tokens[0])).rejects.toThrow(/invalid or expired/);
});
test('replacement, expiry and intervening password changes invalidate links', async () => {
  await requestReset(); await requestReset();
  await expect(reset(tokens[0])).rejects.toThrow(/invalid or expired/);
  sqlite.exec("UPDATE auth_password_resets SET expires_at='2000-01-01'");
  await expect(reset(tokens[1])).rejects.toThrow(/invalid or expired/);
  await requestReset();
  sqlite.exec("UPDATE auth_accounts SET password_hash='changed'");
  await expect(reset(tokens[2])).rejects.toThrow(/invalid or expired/);
  expect(sqlite.prepare('SELECT * FROM auth_sessions').all()).toHaveLength(1);
});
test('unknown mailboxes, missing configuration, validation and throttling', async () => {
  await requestPasswordReset(db, { email: 'absent@example.test' }, config, send);
  expect(tokens).toEqual([]);
  await expect(requestPasswordReset(db, { email: 'person@example.test' }, {}, send)).rejects.toThrow(/not configured/);
  await expect(requestPasswordReset(db, { email: 'invalid' }, config, send)).rejects.toThrow(/valid email/);
  await requestReset();
  await expect(resetPassword(db, { token: tokens[0], password: 'short', confirmPassword: 'short' })).rejects.toThrow(/12 and 128/);
  await expect(resetPassword(db, { token: tokens[0], password: 'Replacement password 2026!', confirmPassword: 'different' })).rejects.toThrow(/do not match/);
  for (let i = 0; i < 8; i++) await requestReset();
  await expect(requestReset()).rejects.toThrow(/Too many requests/);
});
test('delivery failures invalidate the token without disclosing membership', async () => {
  await requestPasswordReset(db, { email: 'person@example.test' }, config, async () => new Response(null, { status: 500 }));
  expect(sqlite.prepare('SELECT * FROM auth_password_resets').all()).toHaveLength(0);
});

test('local development links allow HTTP loopback but reject insecure remote hosts', async () => {
  for (const origin of ['http://localhost:3000', 'http://127.0.0.1:8080', 'http://[::1]:3000']) {
    let deliveredText = '';
    await requestPasswordReset(db, { email: 'person@example.test' }, { ...config, AUTH_PUBLIC_URL: origin }, async (_url, init) => {
      deliveredText = JSON.parse(init?.body as string).text;
      return Response.json({ id: 'sent' });
    });
    expect(deliveredText).toContain(`${origin}/reset-password#token=`);
  }
  for (const origin of ['http://care.example', 'http://localhost.evil.example', 'http://user:password@localhost:3000']) {
    await expect(requestPasswordReset(db, { email: 'person@example.test' }, { ...config, AUTH_PUBLIC_URL: origin }, send)).rejects.toThrow(/not configured/);
  }
});

test('HTTP carestead.com alias requires development or an explicit local preview origin', async () => {
  const environment: Record<string, string | undefined> = process.env;
  const previous = environment.NODE_ENV;
  try {
    environment.NODE_ENV = 'development';
    let deliveredText = '';
    await requestPasswordReset(db, { email: 'person@example.test' }, { ...config, AUTH_PUBLIC_URL: 'http://carestead.com:3001' }, async (_url, init) => {
      deliveredText = JSON.parse(init?.body as string).text;
      return Response.json({ id: 'sent' });
    });
    expect(deliveredText).toContain('http://carestead.com:3001/reset-password#token=');
    environment.NODE_ENV = 'production';
    await expect(requestPasswordReset(db, { email: 'person@example.test' }, { ...config, AUTH_PUBLIC_URL: 'http://carestead.com:3001' }, send)).rejects.toThrow(/not configured/);
    await requestPasswordReset(db, { email: 'person@example.test' }, { ...config, AUTH_PUBLIC_URL: 'http://carestead.com:8080', AUTH_LOCAL_HTTP_ORIGIN: 'http://carestead.com:8080' }, async () => Response.json({ id: 'sent' }));
    await expect(requestPasswordReset(db, { email: 'person@example.test' }, { ...config, AUTH_PUBLIC_URL: 'http://carestead.com:8080', AUTH_LOCAL_HTTP_ORIGIN: 'http://carestead.com:3001' }, send)).rejects.toThrow(/not configured/);
  } finally {
    if (previous === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = previous;
  }
});
