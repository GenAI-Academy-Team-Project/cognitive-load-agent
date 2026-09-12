import { meetsPasswordPolicy, passwordPolicyMessage } from '@/lib/password-policy';
import { requestPasswordReset, resetPassword, recoveryMessage } from '@/lib/password-recovery';
import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/bootstrap';
import { authenticatedUser } from '@/lib/auth';
import { AppError, enforceRateLimit, errorResponse } from '@/lib/guardrails';
import {
  checkOrigin,
  createSession,
  hashPassword,
  sessionCookie,
  sessionToken,
  tokenHash,
  verifyPassword,
} from '@/lib/sessions';

export const runtime = 'edge';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!new URL(request.url).pathname.endsWith('/session'))
    return new Response(null, { status: 404 });
  await ensureDatabase(env.DB);
  const user = await authenticatedUser(env.DB, request);
  return Response.json(
    { user },
    { status: user ? 200 : 401, headers: noStore },
  );
}

export async function POST(request: Request) {
  try {
    checkOrigin(request, env.AUTH_PUBLIC_URL);
    await ensureDatabase(env.DB);
    const db = env.DB;
    const action = new URL(request.url).pathname.split('/').pop();
    if (action === 'sign-out') {
      await db
        .prepare('DELETE FROM auth_sessions WHERE token_hash=?')
        .bind(tokenHash(sessionToken(request)))
        .run();
      return Response.json(
        { ok: true },
        {
          headers: {
            ...noStore,
            'Set-Cookie': sessionCookie(request, '', true),
          },
        },
      );
    }
    if (action === 'guest') {
      await enforceRateLimit(db, `auth-ip:${tokenHash(request.headers.get('cf-connecting-ip') || 'local')}`, 'auth_ip');
      if (await authenticatedUser(db, request)) return Response.json({ ok: true }, { headers: noStore });
      return Response.json({ ok: true }, { headers: { ...noStore, 'Set-Cookie': await createSession(db, request, 'guest') } });
    }
    if (!['sign-in', 'sign-up', 'update-password', 'forgot-password', 'reset-password'].includes(action || ''))
      return new Response(null, { status: 404 });
    if (!request.headers.get('content-type')?.includes('application/json'))
      throw new AppError('invalid_body', 400, 'Send the sign-in form as JSON.');
    const raw = await request.text();
    if (raw.length > 8192)
      throw new AppError('invalid_body', 400, 'The form is too large.');
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AppError('invalid_body', 400, 'Check the form and try again.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new AppError('invalid_body', 400, 'Check the form and try again.');
    if (action === 'forgot-password' || action === 'reset-password') {
      await enforceRateLimit(db, `recovery-ip:${tokenHash(request.headers.get('cf-connecting-ip') || 'local')}`, 'auth_ip');
      if (action === 'forgot-password') {
        await requestPasswordReset(db, body, env);
        return Response.json({ ok: true, message: recoveryMessage }, { headers: noStore });
      }
      await resetPassword(db, body);
      return Response.json({ ok: true }, { headers: { ...noStore, 'Set-Cookie': sessionCookie(request, '', true) } });
    }
    if (action === 'update-password') {
      const user = await authenticatedUser(db, request);
      if (!user) throw new AppError('authentication_required', 401, 'Sign in to update your password.');
      if (user.isGuest) throw new AppError('guest_access', 403, 'Guest accounts cannot update credentials.');
      await enforceRateLimit(db, `password:${user.id}`, 'auth_email');
      const { currentPassword, newPassword, confirmPassword } = body;
      if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128)
        throw new AppError('invalid_password', 400, 'Enter your current password.');
      if (!meetsPasswordPolicy(newPassword)) throw new AppError('weak_password', 400, passwordPolicyMessage);
      if (newPassword !== confirmPassword) throw new AppError('password_mismatch', 400, 'The new passwords do not match.');
      if (newPassword === currentPassword) throw new AppError('unchanged_password', 400, 'Choose a different password.');
      const account = await db.prepare('SELECT password_hash FROM auth_accounts WHERE id=?').bind(user.id).first<{ password_hash: string }>();
      if (!account || !await verifyPassword(currentPassword, account.password_hash)) throw new AppError('invalid_credentials', 400, 'Your current password is incorrect.');
      const results = await db.batch([
        db.prepare('UPDATE auth_accounts SET password_hash=? WHERE id=? AND password_hash=?').bind(await hashPassword(newPassword), user.id, account.password_hash),
        db.prepare('DELETE FROM auth_sessions WHERE account_id=? AND token_hash!=? AND changes()>0').bind(user.id, tokenHash(sessionToken(request))),
      ]);
      if (!results[0].meta.changes) throw new AppError('password_changed', 409, 'Your password changed in another session. Try again.');
      return Response.json({ ok: true }, { headers: noStore });
    }
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new AppError('invalid_email', 400, 'Enter a valid email address.');
    if (!password || password.length > 128)
      throw new AppError(
        'invalid_password',
        400,
        'Enter a password of up to 128 characters.',
      );
    await enforceRateLimit(
      db,
      `auth-ip:${tokenHash(request.headers.get('cf-connecting-ip') || 'local')}`,
      'auth_ip',
    );
    await enforceRateLimit(db, `auth-email:${tokenHash(email)}`, 'auth_email');
    let accountId: string;
    if (action === 'sign-in') {
      const account = await db
        .prepare('SELECT id,password_hash FROM auth_accounts WHERE email=?')
        .bind(email)
        .first<{ id: string; password_hash: string }>();
      // Do the same expensive derivation even when the email does not exist.
      const fallback = `scrypt$00000000000000000000000000000000$${'00'.repeat(64)}`;
      const valid = await verifyPassword(
        password,
        account?.password_hash ?? fallback,
      );
      if (!account || !valid)
        throw new AppError(
          'invalid_credentials',
          401,
          'Email or password is incorrect.',
        );
      accountId = account.id;
      const member = await db
        .prepare(
          "SELECT id FROM care_circle_members WHERE user_id=? AND status='active'",
        )
        .bind(accountId)
        .first();
      if (!member)
        throw new AppError(
          'membership_required',
          403,
          'Your care-circle access is no longer active. Contact the owner.',
        );
    } else {
      const name =
        typeof body.displayName === 'string' ? body.displayName.trim() : '';
      if (!name || name.length > 100)
        throw new AppError(
          'invalid_name',
          400,
          'Enter a name of up to 100 characters.',
        );
      if (!meetsPasswordPolicy(password))
        throw new AppError(
          'weak_password',
          400,
          passwordPolicyMessage,
        );
      if (body.confirmPassword !== password)
        throw new AppError(
          'password_mismatch',
          400,
          'The passwords do not match.',
        );
      accountId = crypto.randomUUID();
      const now = new Date().toISOString();
      const passwordHash = await hashPassword(password);
      const invitation =
        typeof body.invitation === 'string' ? body.invitation : '';
      const batch: D1PreparedStatement[] = [];
      if (invitation) {
        if (!/^[a-f0-9]{64}$/.test(invitation))
          throw new AppError(
            'invalid_invitation',
            400,
            'This invitation is invalid. Ask the owner for a new link.',
          );
        // Conditional inserts and consumption run in one D1 transaction, so a link can only be used once.
        batch.push(
          db
            .prepare(
              "INSERT OR IGNORE INTO auth_accounts SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM auth_invitations i JOIN care_circle_members m ON m.id=i.member_id WHERE i.token_hash=? AND i.expires_at>? AND m.email=? AND m.status='invited')",
            )
            .bind(
              accountId,
              email,
              name,
              passwordHash,
              now,
              tokenHash(invitation),
              now,
              email,
            ),
          db
            .prepare(
              "UPDATE care_circle_members SET user_id=?,display_name=?,status='active',updated_at=? WHERE id=(SELECT member_id FROM auth_invitations WHERE token_hash=?) AND EXISTS (SELECT 1 FROM auth_accounts WHERE id=?)",
            )
            .bind(accountId, name, now, tokenHash(invitation), accountId),
          db
            .prepare(
              'DELETE FROM auth_invitations WHERE token_hash=? AND EXISTS (SELECT 1 FROM auth_accounts WHERE id=?)',
            )
            .bind(tokenHash(invitation), accountId),
        );
      } else {
        // Upgrade the old synthetic localhost owner without exposing this claim on a deployed host.
        const local =
          ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname) &&
          process.env.NODE_ENV !== 'production';
        const eligible = local
          ? "(NOT EXISTS (SELECT 1 FROM care_circle_members) OR (EXISTS (SELECT 1 FROM care_circle_members WHERE user_id='local-demo-owner' AND role='owner' AND status='active') AND NOT EXISTS (SELECT 1 FROM care_circle_members WHERE user_id IS NOT NULL AND user_id!='local-demo-owner')))"
          : 'NOT EXISTS (SELECT 1 FROM care_circle_members)';
        batch.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO auth_accounts SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM auth_accounts) AND (${eligible})`,
            )
            .bind(accountId, email, name, passwordHash, now),
          db
            .prepare(
              "UPDATE care_circle_members SET user_id=?,email=?,display_name=?,updated_at=? WHERE user_id='local-demo-owner' AND EXISTS (SELECT 1 FROM auth_accounts WHERE id=?)",
            )
            .bind(accountId, email, name, now, accountId),
          db
            .prepare(
              "INSERT INTO care_circle_members SELECT ?,'household-demo',?,?,?,'owner','active',?,? WHERE NOT EXISTS (SELECT 1 FROM care_circle_members) AND EXISTS (SELECT 1 FROM auth_accounts WHERE id=?)",
            )
            .bind(
              crypto.randomUUID(),
              accountId,
              email,
              name,
              now,
              now,
              accountId,
            ),
        );
      }
      const results = await db.batch(batch);
      if (!results[0].meta.changes)
        throw new AppError(
          'signup_unavailable',
          409,
          'Unable to create this account. Sign in if you already have one, or ask the owner for a new invitation link.',
        );
    }
    return Response.json(
      { ok: true },
      {
        status: action === 'sign-up' ? 201 : 200,
        headers: {
          ...noStore,
          'Set-Cookie': await createSession(db, request, accountId),
        },
      },
    );
  } catch (error) {
    const response = errorResponse(error, crypto.randomUUID());
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
