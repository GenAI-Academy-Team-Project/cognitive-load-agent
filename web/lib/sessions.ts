import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { AppError } from '@/lib/guardrails';

const COOKIE = 'carestead_session';
const MAX_AGE = 60 * 60 * 24 * 7;
export const randomToken = () => randomBytes(32).toString('hex');
export const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const actual = await derive(password, salt);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function sessionToken(request: Request) {
  return (
    request.headers
      .get('cookie')
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1) ?? ''
  );
}
export function sessionCookie(request: Request, token: string, clear = false) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : MAX_AGE}${secure}`;
}
export async function createSession(
  db: D1Database,
  request: Request,
  accountId: string,
) {
  const token = randomToken();
  await db.batch([
    db
      .prepare(
        'DELETE FROM auth_sessions WHERE expires_at <= ? OR token_hash = ?',
      )
      .bind(new Date().toISOString(), tokenHash(sessionToken(request))),
    db
      .prepare('INSERT INTO auth_sessions VALUES (?, ?, ?)')
      .bind(
        tokenHash(token),
        accountId,
        new Date(Date.now() + MAX_AGE * 1000).toISOString(),
      ),
  ]);
  return sessionCookie(request, token);
}
export function checkOrigin(request: Request, publicUrl?: string) {
  let publicOrigin: string | undefined;
  try {
    const url = new URL(publicUrl || '');
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) publicOrigin = url.origin;
  } catch { /* Invalid configuration must not grant access. */ }
  const origin = request.headers.get('origin');
  if (
    (origin !== new URL(request.url).origin && origin !== publicOrigin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new AppError(
      'invalid_origin',
      403,
      'Open Carestead in this browser and try again.',
    );
  }
}
export async function issueInvitation(db: D1Database, memberId: string) {
  const token = randomToken();
  await db
    .prepare(
      'INSERT INTO auth_invitations VALUES (?, ?, ?) ON CONFLICT(member_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at',
    )
    .bind(
      memberId,
      tokenHash(token),
      new Date(Date.now() + 7 * 86400000).toISOString(),
    )
    .run();
  return token;
}
