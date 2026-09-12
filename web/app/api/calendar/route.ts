import { effectiveIntegrations } from '@/lib/integration-settings';
import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/bootstrap';
import { requireMembership } from '@/lib/auth';
import { AppError, enforceRateLimit, errorResponse, recordError } from '@/lib/guardrails';
import { randomToken, sessionToken, tokenHash } from '@/lib/sessions';
import { approveCalendarAction, calendarContext, connectionFor, field, proposeCalendarAction, publicAction, requireCalendarWrite, requireConnection, type ActionRow } from '@/lib/calendar-service';
import { accessToken, calendarScopes, isGoogleConfigured, ownedCalendars, requireGoogleConfig, type GoogleConfig } from '@/lib/google-calendar';
import type { CalendarAppointment, CalendarState } from '@/lib/calendar-types';

export const runtime = 'edge';
const config = () => effectiveIntegrations(env.DB, env) as Promise<GoogleConfig>;
const json = (data: unknown) => Response.json(data, { headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const db = env.DB; await ensureDatabase(db);
    const auth = await requireMembership(db, request); if ('error' in auth) return auth.error;
    const recipientId = new URL(request.url).searchParams.get('recipientId') || '';
    const context = await calendarContext(db, auth.member, recipientId);
    const connection = await connectionFor(context);
    const binding = connection ? await db.prepare('SELECT calendar_id,calendar_name FROM calendar_bindings WHERE member_id=? AND recipient_id=? AND connection_id=?').bind(auth.member.memberId, recipientId, connection.id).first<CalendarState['binding']>() : null;
    const appointments = (await db.prepare('SELECT * FROM calendar_appointments WHERE recipient_id=? ORDER BY start_at').bind(recipientId).all<CalendarAppointment>()).results;
    const actions = (await db.prepare('SELECT * FROM calendar_actions WHERE recipient_id=? AND member_id=? ORDER BY created_at DESC LIMIT 100').bind(recipientId, auth.member.memberId).all<ActionRow>()).results;
    const result: CalendarState = { configured: isGoogleConfigured(await config()), connection: connection ? { email: connection.email, status: connection.status } : null, binding, calendars: [], appointments: appointments.map((a) => ({ ...a, canManage: a.member_id === auth.member.memberId && a.connection_id === connection?.id })), actions: actions.map(publicAction) };
    // Listing local results continues to work during provider outages or withdrawn consent.
    if (connection?.status === 'connected' && context.consent && result.configured) {
      try { result.calendars = await ownedCalendars(await accessToken(db, await config(), connection)); }
      catch (error) {
        result.error = error instanceof AppError ? error.message : 'Calendar list could not be loaded. Try again.';
        if (error instanceof AppError && error.code === 'google_reconnect') result.connection!.status = 'reconnect_required';
      }
    }
    return json(result);
  } catch (error) { return errorResponse(error, requestId); }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID(); let action = ''; let recipientId = '';
  try {
    const db = env.DB; await ensureDatabase(db);
    const auth = await requireMembership(db, request); if ('error' in auth) return auth.error;
    const body = await request.json() as Record<string, unknown>;
    action = field(body, 'action', 40); recipientId = field(body, 'recipientId', 100);
    const context = await calendarContext(db, auth.member, recipientId);
    await enforceRateLimit(db, auth.member.id, 'calendar_action');
    if (action === 'disconnect') {
      // Erase local credentials even when recipient consent has been withdrawn.
      const running = await db.prepare("SELECT 1 FROM calendar_actions WHERE member_id=? AND status='executing' AND updated_at>?").bind(auth.member.memberId, new Date(Date.now() - 120000).toISOString()).first();
      if (running) throw new AppError('action_in_progress', 409, 'Resolve the pending calendar result before disconnecting.');
      await db.batch([
        db.prepare("UPDATE google_connections SET refresh_token='',status='disconnected',updated_at=? WHERE member_id=?").bind(new Date().toISOString(), auth.member.memberId),
        db.prepare('DELETE FROM calendar_bindings WHERE member_id=?').bind(auth.member.memberId),
        db.prepare('DELETE FROM google_oauth_states WHERE member_id=?').bind(auth.member.memberId),
        db.prepare("UPDATE calendar_actions SET status='rejected' WHERE member_id=? AND status IN ('pending','failed')").bind(auth.member.memberId),
      ]);
      return json({ ok: true });
    }
    requireCalendarWrite(context);
    if (action !== 'reject') requireGoogleConfig(await config());
    if (action === 'connect') {
      const c = requireGoogleConfig(await config());
      if (new URL(c.GOOGLE_REDIRECT_URI).origin !== new URL(request.url).origin) throw new AppError('oauth_origin', 503, 'Google Calendar must be connected from the configured app address.');
      const state = randomToken(); const verifier = randomToken();
      await db.batch([
        db.prepare('DELETE FROM google_oauth_states WHERE expires_at<? OR member_id=?').bind(new Date().toISOString(), auth.member.memberId),
        db.prepare('INSERT INTO google_oauth_states VALUES (?,?,?,?,?,?)').bind(tokenHash(state), auth.member.memberId, tokenHash(sessionToken(request)), recipientId, verifier, new Date(Date.now() + 600000).toISOString()),
      ]);
      const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: c.GOOGLE_CLIENT_ID, redirect_uri: c.GOOGLE_REDIRECT_URI, response_type: 'code', scope: calendarScopes.join(' '), access_type: 'offline', prompt: 'consent select_account', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
      return json({ url: url.toString() });
    }
    if (action === 'select_calendar') {
      const connection = await requireConnection(context);
      const calendarId = field(body, 'calendarId', 1024);
      const calendars = await ownedCalendars(await accessToken(db, await config(), connection));
      const selected = calendars.find((calendar) => calendar.id === calendarId);
      if (!selected) throw new AppError('calendar_forbidden', 403, 'Choose a calendar owned by your connected account.');
      if (await db.prepare("SELECT 1 FROM calendar_actions WHERE member_id=? AND recipient_id=? AND status IN ('executing','uncertain')").bind(auth.member.memberId, recipientId).first()) throw new AppError('action_in_progress', 409, 'Resolve the pending calendar result before switching calendars.');
      await db.prepare('INSERT INTO calendar_bindings VALUES (?,?,?,?,?) ON CONFLICT(member_id,recipient_id) DO UPDATE SET connection_id=excluded.connection_id,calendar_id=excluded.calendar_id,calendar_name=excluded.calendar_name').bind(auth.member.memberId, recipientId, connection.id, selected.id, selected.summary).run();
      return json({ ok: true });
    }
    if (action === 'propose') return json({ actionId: await proposeCalendarAction(context, await config(), body) });
    if (action === 'approve') { await approveCalendarAction(context, await config(), field(body, 'actionId', 100)); return json({ ok: true }); }
    if (action === 'reject') {
      const updated = await db.prepare("UPDATE calendar_actions SET status='rejected',updated_at=? WHERE id=? AND recipient_id=? AND member_id=? AND status IN ('pending','failed')").bind(new Date().toISOString(), field(body, 'actionId', 100), recipientId, auth.member.memberId).run();
      if (!updated.meta.changes) throw new AppError('action_in_progress', 409, 'This action cannot be discarded. Retry any uncertain result first.');
      return json({ ok: true });
    }
    throw new AppError('invalid_calendar_action', 400, 'Unknown calendar action.');
  } catch (error) {
    await recordError(env.DB, { requestId, route: '/api/calendar', action, recipientId, errorCode: error instanceof AppError ? error.code : 'unhandled' });
    return errorResponse(error, requestId);
  }
}
