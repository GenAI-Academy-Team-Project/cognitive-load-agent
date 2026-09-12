import { AppError, enforceRateLimit } from '@/lib/guardrails';
import { hashPassword, randomToken, tokenHash } from '@/lib/sessions';
import { meetsPasswordPolicy, passwordPolicyMessage } from '@/lib/password-policy';

type Config = { RESEND_API_KEY?: string; NOTIFICATION_EMAIL_FROM?: string; AUTH_PUBLIC_URL?: string; AUTH_LOCAL_HTTP_ORIGIN?: string };
export const recoveryMessage = 'If an account uses that email address, a password reset link will arrive shortly. Check your spam folder too.';
const invalidLink = () => new AppError('invalid_reset', 400, 'This reset link is invalid or expired. Request a new link.');

export async function requestPasswordReset(db: D1Database, body: Record<string, unknown>, config: Config, send: typeof fetch = fetch) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('invalid_email', 400, 'Enter a valid email address.');
  await enforceRateLimit(db, `recovery-email:${tokenHash(email)}`, 'auth_email');
  let origin: URL;
  try {
    origin = new URL(config.AUTH_PUBLIC_URL || '');
    const developmentAlias = origin.hostname === 'carestead.com' && (process.env.NODE_ENV === 'development' || config.AUTH_LOCAL_HTTP_ORIGIN === origin.origin);
    const localHttp = origin.protocol === 'http:' && (['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || developmentAlias);
    if ((!localHttp && origin.protocol !== 'https:') || origin.username || origin.password) throw new Error();
    if (!config.RESEND_API_KEY || !config.NOTIFICATION_EMAIL_FROM) throw new Error();
  } catch {
    throw new AppError('recovery_unavailable', 503, 'Password recovery is not configured. Contact the care-circle owner.');
  }
  const account = await db.prepare('SELECT id,password_hash FROM auth_accounts WHERE email=?').bind(email).first<{ id: string; password_hash: string }>();
  if (!account) return;
  const token = randomToken();
  const hash = tokenHash(token);
  await db.batch([
    db.prepare('DELETE FROM auth_password_resets WHERE expires_at<=?').bind(new Date().toISOString()),
    db.prepare('INSERT INTO auth_password_resets VALUES (?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET token_hash=excluded.token_hash,password_hash=excluded.password_hash,expires_at=excluded.expires_at').bind(account.id, hash, account.password_hash, new Date(Date.now() + 30 * 60_000).toISOString()),
  ]);
  const link = new URL('/reset-password', origin);
  link.hash = `token=${token}`;
  try {
    const response = await send('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': hash },
      body: JSON.stringify({ from: config.NOTIFICATION_EMAIL_FROM, to: [email], subject: 'Reset your Carestead password', text: `Reset your password using this link (valid for 30 minutes):\n\n${link}\n\nIf you did not request this, you can ignore this email. Your password has not changed.` }),
    });
    if (!response.ok) throw new Error('delivery_failed');
  } catch {
    await db.prepare('DELETE FROM auth_password_resets WHERE token_hash=?').bind(hash).run();
    // Never reveal whether a mailbox is registered, including on delivery failures.
    console.error('Password reset email delivery failed');
  }
}

export async function resetPassword(db: D1Database, body: Record<string, unknown>) {
  const { token, password, confirmPassword } = body;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw invalidLink();
  if (!meetsPasswordPolicy(password)) throw new AppError('weak_password', 400, passwordPolicyMessage);
  if (password !== confirmPassword) throw new AppError('password_mismatch', 400, 'The passwords do not match.');
  const hash = tokenHash(token);
  const now = new Date().toISOString();
  const reset = await db.prepare('SELECT account_id FROM auth_password_resets WHERE token_hash=? AND expires_at>?').bind(hash, now).first<{ account_id: string }>();
  if (!reset) throw invalidLink();
  const passwordHash = await hashPassword(password);
  // Conditional update, revocation and consumption are atomic; concurrent reuse cannot win twice.
  const results = await db.batch([
    db.prepare('UPDATE auth_accounts SET password_hash=? WHERE id=? AND EXISTS (SELECT 1 FROM auth_password_resets r WHERE r.account_id=auth_accounts.id AND r.token_hash=? AND r.expires_at>? AND r.password_hash=auth_accounts.password_hash)').bind(passwordHash, reset.account_id, hash, new Date().toISOString()),
    db.prepare('DELETE FROM auth_sessions WHERE account_id=? AND EXISTS (SELECT 1 FROM auth_accounts WHERE id=? AND password_hash=?)').bind(reset.account_id, reset.account_id, passwordHash),
    db.prepare('DELETE FROM auth_password_resets WHERE account_id=? AND EXISTS (SELECT 1 FROM auth_accounts WHERE id=? AND password_hash=?)').bind(reset.account_id, reset.account_id, passwordHash),
  ]);
  if (!results[0].meta.changes) throw invalidLink();
}
