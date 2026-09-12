import { AppError } from './guardrails';
import { oneSignalConfigured, type NotificationConfig, type NotificationInput } from './notification-types';

export const subscriptionIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
type Subscription = { id: string; type: string; enabled: boolean };
export type OneSignalPushTarget = { appId: string; externalId: string; subscriptions: string[] };

// External IDs are bearer capabilities until OneSignal supports identity verification
// in both web and Capacitor SDKs. Never use a public care-circle member ID here.
// Only the authenticated caregiver receives their random alias; never export it.
export async function oneSignalIdentity(db: D1Database, config: NotificationConfig, memberId: string) {
  if (!oneSignalConfigured(config)) throw new AppError('channel_unconfigured', 409, 'Enable OneSignal in Integrations first.');
  await db.prepare('INSERT OR IGNORE INTO onesignal_identities (member_id,app_id,external_id) VALUES (?,?,?)')
    .bind(memberId, config.ONESIGNAL_APP_ID, crypto.randomUUID() + crypto.randomUUID()).run();
  return (await db.prepare('SELECT external_id FROM onesignal_identities WHERE member_id=? AND app_id=?')
    .bind(memberId, config.ONESIGNAL_APP_ID).first<{ external_id: string }>())!.external_id;
}

async function subscriptionsFor(config: NotificationConfig, externalId: string): Promise<Subscription[]> {
  let response: Response;
  try {
    response = await fetch(`https://api.onesignal.com/apps/${encodeURIComponent(config.ONESIGNAL_APP_ID!)}/users/by/external_id/${encodeURIComponent(externalId)}`, {
      headers: { Authorization: `Key ${config.ONESIGNAL_API_KEY}` }, redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
  } catch { throw new AppError('onesignal_verification_unavailable', 503, 'OneSignal registration could not be verified. Try again.'); }
  if (!response.ok) throw new AppError('onesignal_verification_unavailable', 409, 'OneSignal registration is not ready. Check the App ID and key, then try again.');
  const user = await response.json() as { identity?: { external_id?: string }; subscriptions?: Subscription[] };
  if (user.identity?.external_id !== externalId || !Array.isArray(user.subscriptions)) throw new AppError('onesignal_identity_mismatch', 409, 'OneSignal could not verify this device belongs to your account.');
  return user.subscriptions;
}

export async function registerOneSignalPush(db: D1Database, config: NotificationConfig, recipientId: string, memberId: string, subscriptionId: unknown) {
  if (typeof subscriptionId !== 'string' || !subscriptionIdPattern.test(subscriptionId)) throw new AppError('invalid_push', 400, 'Wait for a registered OneSignal subscription before saving.');
  const externalId = await oneSignalIdentity(db, config, memberId);
  const subscription = (await subscriptionsFor(config, externalId)).find(item => item.id === subscriptionId && item.enabled && /Push$/.test(item.type));
  if (!subscription) throw new AppError('onesignal_subscription_unverified', 409, 'Enable notifications on this device and wait for OneSignal registration, then try again.');
  const platform = subscription.type === 'iOSPush' ? 'ios' : subscription.type === 'AndroidPush' ? 'android' : 'web';
  await db.batch([
    db.prepare('DELETE FROM onesignal_push_subscriptions WHERE app_id=? AND subscription_id=? AND member_id!=?').bind(config.ONESIGNAL_APP_ID, subscriptionId, memberId),
    db.prepare('INSERT INTO onesignal_push_subscriptions VALUES (?,?,?,?,?,?) ON CONFLICT(recipient_id,member_id,app_id,subscription_id) DO UPDATE SET platform=excluded.platform,updated_at=excluded.updated_at')
      .bind(recipientId, memberId, config.ONESIGNAL_APP_ID, subscriptionId, platform, new Date().toISOString()),
  ]);
}

export async function oneSignalPushTarget(db: D1Database, config: NotificationConfig, recipientId: string, memberId: string): Promise<OneSignalPushTarget> {
  const identity = await db.prepare('SELECT external_id FROM onesignal_identities WHERE member_id=? AND app_id=?').bind(memberId, config.ONESIGNAL_APP_ID).first<{ external_id: string }>();
  const rows = (await db.prepare('SELECT subscription_id FROM onesignal_push_subscriptions WHERE recipient_id=? AND member_id=? AND app_id=? ORDER BY subscription_id')
    .bind(recipientId, memberId, config.ONESIGNAL_APP_ID).all<{ subscription_id: string }>()).results;
  if (!identity || !rows.length) throw new AppError('channel_disabled', 409, 'This caregiver must enable OneSignal push for this care recipient on a browser or mobile device.');
  return { appId: config.ONESIGNAL_APP_ID!, externalId: identity.external_id, subscriptions: rows.map(row => row.subscription_id) };
}

const htmlEscape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export async function sendOneSignal(config: NotificationConfig, input: NotificationInput, destination: string, actionId: string, recipientId: string) {
  const failed = (errorCode: string) => ({ status: 'failed' as const, errorCode });
  if (!oneSignalConfigured(config)) return failed('onesignal_unconfigured');
  const message: Record<string, unknown> = { app_id: config.ONESIGNAL_APP_ID, target_channel: input.channel, idempotency_key: actionId };
  if (input.channel === 'email') {
    Object.assign(message, { email_to: [destination], email_subject: input.title, email_body: `<div style="white-space:pre-wrap">${htmlEscape(input.detail)}</div>` });
  } else if (input.channel === 'sms') {
    Object.assign(message, { include_phone_numbers: [destination], contents: { en: `${input.title}\n${input.detail}` } });
  } else if (input.channel === 'push') {
    const target = JSON.parse(destination) as OneSignalPushTarget;
    if (target.appId !== config.ONESIGNAL_APP_ID || !target.subscriptions.length) return failed('onesignal_target_changed');
    // Recheck ownership after login/logout or device transfer. Never expand the
    // reviewed device set by sending to every subscription on an alias.
    let subscriptions: Subscription[];
    try { subscriptions = await subscriptionsFor(config, target.externalId); }
    catch { return failed('onesignal_verification_unavailable'); }
    if (target.subscriptions.some(id => !subscriptions.some(item => item.id === id && item.enabled && /Push$/.test(item.type)))) return failed('onesignal_subscription_changed');
    Object.assign(message, { include_subscription_ids: target.subscriptions, headings: { en: input.title }, contents: { en: input.detail }, data: { recipientId }, ttl: 3600 });
    // Native taps use data.recipientId. Web taps use the configured canonical site.
    if (config.AUTH_PUBLIC_URL) message.web_url = new URL(`/?recipientId=${encodeURIComponent(recipientId)}`, config.AUTH_PUBLIC_URL).href;
  } else return failed('onesignal_channel_unsupported');
  try {
    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST', headers: { Authorization: `Key ${config.ONESIGNAL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message), redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { status: response.status >= 500 || response.status === 408 ? 'unknown' as const : 'failed' as const, errorCode: `onesignal_http_${response.status}` };
    const receipt = await response.json() as { id?: string; errors?: unknown };
    if (typeof receipt.id === 'string' && receipt.id.length > 0 && receipt.id.length < 200) return { status: 'accepted' as const, providerId: `onesignal:${receipt.id}` };
    if (receipt.id === '' || receipt.errors) return failed('onesignal_no_recipients');
    return { status: 'unknown' as const, errorCode: 'onesignal_missing_receipt' };
  } catch { return { status: 'unknown' as const, errorCode: 'onesignal_result_unknown' }; }
}
