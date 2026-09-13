import { AppError } from './guardrails';

export type GoogleConfig = { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; GOOGLE_REDIRECT_URI?: string; GOOGLE_TOKEN_KEY?: string };
export const calendarScopes = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events.owned', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
export type GoogleConnection = { member_id: string; id: string; google_sub: string; email: string; refresh_token: string; status: string };
export type GoogleEvent = {
  id: string; etag: string; status?: string; htmlLink?: string; summary?: string; location?: string;
  start?: { dateTime?: string; timeZone?: string }; end?: { dateTime?: string; timeZone?: string };
  attendees?: { email: string }[]; reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
  extendedProperties?: { private?: Record<string, string> };
};

export function isGoogleConfigured(config: GoogleConfig) {
  return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REDIRECT_URI && /^[a-f0-9]{64}$/i.test(config.GOOGLE_TOKEN_KEY || ''));
}
export function requireGoogleConfig(config: GoogleConfig) {
  if (!isGoogleConfigured(config)) throw new AppError('calendar_not_configured', 503, 'Google Calendar is not configured for this deployment yet.');
  return config as Required<GoogleConfig>;
}
export async function sealToken(value: string, secret: string, memberId: string) {
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g)!, (byte) => parseInt(byte, 16)), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(memberId) }, key, new TextEncoder().encode(value));
  return `${Buffer.from(iv).toString('base64')}.${Buffer.from(data).toString('base64')}`;
}
export async function openToken(value: string, secret: string, memberId: string) {
  const [iv, data] = value.split('.');
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g)!, (byte) => parseInt(byte, 16)), 'AES-GCM', false, ['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(iv, 'base64'), additionalData: new TextEncoder().encode(memberId) }, key, Buffer.from(data, 'base64')));
}

export async function googleFetch(url: string, init: RequestInit = {}, failureMessage = 'Google could not be reached. Try again shortly.') {
  try {
    // Workers supports manual/follow only. Never forward credentials to a redirect target.
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12000), redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) throw new Error('Unexpected Google redirect');
    return response;
  } catch { throw new AppError('google_unavailable', 503, failureMessage); }
}

export async function exchangeCode(config: GoogleConfig, code: string, verifier: string) {
  const c = requireGoogleConfig(config);
  const response = await googleFetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: c.GOOGLE_CLIENT_ID, client_secret: c.GOOGLE_CLIENT_SECRET, redirect_uri: c.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code', code, code_verifier: verifier }) });
  if (!response.ok) throw new AppError('oauth_exchange_failed', 400, 'Google authorization expired. Connect again.');
  const token = await response.json() as { access_token?: string; refresh_token?: string; scope?: string };
  if (!token.access_token || !token.refresh_token || !calendarScopes.slice(2).every((scope) => token.scope?.split(' ').includes(scope))) throw new AppError('oauth_missing_scope', 400, 'Grant Calendar permissions and offline access to connect.');
  const identity = await googleFetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!identity.ok) throw new AppError('oauth_identity_failed', 400, 'Google account could not be verified. Connect again.');
  const user = await identity.json() as { sub?: string; email?: string; email_verified?: boolean };
  if (!user.sub || !user.email || user.email_verified !== true) throw new AppError('oauth_identity_failed', 400, 'A verified Google email is required.');
  return { refreshToken: token.refresh_token, sub: user.sub, email: user.email };
}

export async function accessToken(db: D1Database, config: GoogleConfig, connection: GoogleConnection) {
  const c = requireGoogleConfig(config);
  if (connection.status !== 'connected') throw new AppError('google_reconnect', 409, 'Reconnect your Google account to continue.');
  const token = await openToken(connection.refresh_token, c.GOOGLE_TOKEN_KEY, connection.member_id);
  const response = await googleFetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: c.GOOGLE_CLIENT_ID, client_secret: c.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: token }) });
  if (!response.ok) {
    const error = await response.json() as { error?: string };
    if (error.error === 'invalid_grant') {
      await db.prepare("UPDATE google_connections SET status='reconnect_required' WHERE id=?").bind(connection.id).run();
      throw new AppError('google_reconnect', 409, 'Google access expired or was revoked. Reconnect your account.');
    }
    throw new AppError('google_unavailable', 503, 'Google is unavailable. Try again shortly.');
  }
  const result = await response.json() as { access_token?: string };
  if (!result.access_token) throw new AppError('google_unavailable', 503, 'Google did not return an access token. Reconnect your account.');
  return result.access_token;
}

export async function calendarRequest(token: string, path: string, init: RequestInit = {}, allowed: number[] = []) {
  const failureMessage = ['GET', 'HEAD'].includes((init.method || 'GET').toUpperCase())
    ? 'Google Calendar could not be loaded. Refresh to try again.'
    : 'Google did not confirm the result. Retry this action to check its status safely.';
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`); headers.set('Content-Type', 'application/json');
  const response = await googleFetch(`https://www.googleapis.com/calendar/v3/${path}`, { ...init, headers }, failureMessage);
  if (!response.ok && !allowed.includes(response.status)) {
    if (response.status === 400) throw new AppError('invalid_calendar_event', 400, 'Google rejected these event details. Discard the proposal and review the appointment fields.');
    if (response.status === 401) throw new AppError('google_reconnect', 409, 'Reconnect your Google account to continue.');
    if (response.status === 403) throw new AppError('calendar_forbidden', 403, 'Google denied access. Check your calendar permissions and reconnect if needed.');
    if (response.status === 404 || response.status === 410 || response.status === 412) throw new AppError('calendar_changed', 409, 'This event changed or was removed in Google Calendar. Discard this proposal and review it again.');
    throw new AppError('google_unavailable', 503, failureMessage);
  }
  return response;
}

export async function ownedCalendars(token: string) {
  const items: { id: string; summary: string; timeZone?: string }[] = [];
  let pageToken = '';
  do {
    const response = await calendarRequest(token, `users/me/calendarList?minAccessRole=owner&maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    const page = await response.json() as { items?: { id: string; summary: string; timeZone?: string }[]; nextPageToken?: string };
    items.push(...page.items || []);
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return items;
}

export const eventPath = (calendarId: string, eventId: string) => `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
export async function getGoogleEvent(token: string, calendarId: string, eventId: string) {
  const response = await calendarRequest(token, eventPath(calendarId, eventId), {}, [404, 410]);
  return response.status === 404 || response.status === 410 ? null : await response.json() as GoogleEvent;
}
