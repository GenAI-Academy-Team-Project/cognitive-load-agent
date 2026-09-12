import { effectiveIntegrations } from '@/lib/integration-settings';
import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/bootstrap';
import { requireMembership } from '@/lib/auth';
import { AppError, recordError } from '@/lib/guardrails';
import { calendarContext, requireCalendarWrite } from '@/lib/calendar-service';
import { exchangeCode, requireGoogleConfig, sealToken, type GoogleConfig } from '@/lib/google-calendar';
import { sessionToken, tokenHash } from '@/lib/sessions';

export const runtime = 'edge';
export async function GET(request: Request) {
  const returnUrl = new URL('/', request.url);
  returnUrl.searchParams.set('view', 'Calendar');
  try {
    const db = env.DB; await ensureDatabase(db);
    const auth = await requireMembership(db, request, env.AUTH_PUBLIC_URL);
    if ('error' in auth) throw new AppError('oauth_session', 401, 'Sign in and connect Google Calendar again.');
    const url = new URL(request.url);
    const rawState = url.searchParams.get('state') || '';
    if (!/^[a-f0-9]{64}$/.test(rawState)) throw new AppError('oauth_state', 400, 'Invalid Google authorization state.');
    const state = await db.prepare('DELETE FROM google_oauth_states WHERE state_hash=? AND member_id=? AND session_hash=? AND expires_at>? RETURNING *').bind(tokenHash(rawState), auth.member.memberId, tokenHash(sessionToken(request)), new Date().toISOString()).first<{ recipient_id: string; verifier: string }>();
    if (!state) throw new AppError('oauth_state', 400, 'Google authorization expired. Connect again.');
    returnUrl.searchParams.set('recipientId', state.recipient_id);
    requireCalendarWrite(await calendarContext(db, auth.member, state.recipient_id));
    if (url.searchParams.has('error')) throw new AppError('oauth_denied', 400, 'Google Calendar connection was cancelled.');
    const code = url.searchParams.get('code');
    if (!code || code.length > 4096) throw new AppError('oauth_code', 400, 'Google authorization code is missing.');
    const config = requireGoogleConfig(await effectiveIntegrations(db, env) as GoogleConfig);
    const user = await exchangeCode(config, code, state.verifier);
    const existing = await db.prepare('SELECT id,google_sub,status FROM google_connections WHERE member_id=?').bind(auth.member.memberId).first<{ id: string; google_sub: string; status: string }>();
    if (existing && existing.google_sub !== user.sub && existing.status !== 'disconnected') throw new AppError('google_account_changed', 409, 'Disconnect your previous Google account before connecting a different account.');
    const id = existing?.google_sub === user.sub ? existing.id : crypto.randomUUID();
    await db.prepare("INSERT INTO google_connections VALUES (?,?,?,?,?,'connected',?) ON CONFLICT(member_id) DO UPDATE SET id=excluded.id,google_sub=excluded.google_sub,email=excluded.email,refresh_token=excluded.refresh_token,status=excluded.status,updated_at=excluded.updated_at").bind(auth.member.memberId, id, user.sub, user.email, await sealToken(user.refreshToken, config.GOOGLE_TOKEN_KEY, auth.member.memberId), new Date().toISOString()).run();
    returnUrl.searchParams.set('calendarNotice', 'Google account connected. Choose a calendar for this recipient.');
  } catch (error) {
    await recordError(env.DB, { requestId: crypto.randomUUID(), route: '/api/calendar/callback', action: 'connect', errorCode: error instanceof AppError ? error.code : 'unhandled' });
    returnUrl.searchParams.set('calendarNotice', error instanceof AppError ? error.message : 'Google connection failed. Please try again.');
  }
  return new Response(null, { status: 303, headers: { Location: returnUrl.pathname + returnUrl.search, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
