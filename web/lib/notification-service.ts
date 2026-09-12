import webpush from 'web-push';
import { AppError } from './guardrails';
import { configuredChannels, notificationChannels, type NotificationConfig, type NotificationInput, type NotificationPreferences } from './notification-types';

export function validateNotification(value: unknown): NotificationInput {
  const input = value as NotificationInput;
  if (!input || typeof input !== 'object' || !notificationChannels.includes(input.channel) ||
    typeof input.memberId !== 'string' || !input.memberId || input.memberId.length > 100 ||
    typeof input.title !== 'string' || !input.title.trim() || input.title.length > 180 || /[\r\n]/.test(input.title) ||
    typeof input.detail !== 'string' || !input.detail.trim() || input.detail.length > 900) {
    throw new AppError('invalid_notification', 400, 'Choose a channel and caregiver, a title up to 180 characters, and a message up to 900 characters.');
  }
  if (input.channel === 'push' && new TextEncoder().encode(JSON.stringify({ title: input.title, body: input.detail })).length > 3500) throw new AppError('push_message_too_large', 400, 'Shorten this push message; its encoded content is too large.');
  return { channel: input.channel, memberId: input.memberId, title: input.title.trim(), detail: input.detail.trim() };
}

export function validateSubscription(value: unknown): webpush.PushSubscription {
  const input = value as webpush.PushSubscription;
  let url: URL;
  try { url = new URL(input.endpoint); } catch { throw new AppError('invalid_push', 400, 'Invalid browser push subscription.'); }
  // Only browser push services may receive server requests. Never fetch arbitrary saved URLs.
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
    !['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].some((host) => url.hostname === host || (host === 'web.push.apple.com' && url.hostname.endsWith('.web.push.apple.com'))) ||
    typeof input.keys?.p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}=?$/.test(input.keys.p256dh) ||
    typeof input.keys?.auth !== 'string' || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(input.keys.auth) || input.endpoint.length > 2048) {
    throw new AppError('invalid_push', 400, 'Unsupported or invalid browser push subscription.');
  }
  return { endpoint: url.href, keys: { p256dh: input.keys.p256dh, auth: input.keys.auth } };
}

export async function notificationTarget(db: D1Database, config: NotificationConfig, recipientId: string, input: NotificationInput) {
  const member = await db.prepare("SELECT c.id,c.display_name,c.email FROM care_circle_members c JOIN recipient_members rm ON rm.member_id=c.id JOIN care_recipients cr ON cr.id=rm.recipient_id WHERE rm.recipient_id=? AND c.id=? AND c.status='active' AND cr.status='active'").bind(recipientId, input.memberId).first<{ id: string; display_name: string; email: string }>();
  if (!member) throw new AppError('notification_target_forbidden', 403, 'Choose an active member of this care circle.');
  if ((await db.prepare('SELECT status FROM consent_records WHERE recipient_id=?').bind(recipientId).first<{ status: string }>())?.status !== 'active') throw new AppError('consent_inactive', 409, 'Consent is withdrawn.');
  if (!configuredChannels(config).includes(input.channel)) throw new AppError('channel_unconfigured', 409, `${input.channel} delivery is not configured.`);
  const preferences = await db.prepare('SELECT * FROM notification_preferences WHERE recipient_id=? AND member_id=?').bind(recipientId, input.memberId).first<NotificationPreferences>();
  let destination = member.id;
  if (input.channel === 'email') {
    if (!preferences?.email_enabled) throw new AppError('channel_disabled', 409, 'This caregiver has not enabled email notifications.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) throw new AppError('invalid_email', 409, 'This caregiver needs a valid account email.');
    destination = member.email;
  } else if (input.channel === 'sms') {
    if (!preferences?.sms_enabled || !/^\+[1-9]\d{7,14}$/.test(preferences.phone)) throw new AppError('channel_disabled', 409, 'This caregiver must enable SMS and save a phone number with country code.');
    destination = preferences.phone;
  } else if (input.channel === 'pushover') {
    const saved = await db.prepare('SELECT user_key FROM pushover_preferences WHERE recipient_id=? AND member_id=?').bind(recipientId, input.memberId).first<{ user_key: string }>();
    if (!saved || !/^[A-Za-z0-9]{30}$/.test(saved.user_key)) throw new AppError('channel_disabled', 409, 'This caregiver must enable Pushover in Notifications first.');
    destination = saved.user_key;
  } else if (input.channel === 'push') {
    if (!preferences?.push_json) throw new AppError('channel_disabled', 409, 'This caregiver must enable push on their browser first.');
    destination = JSON.stringify(validateSubscription(JSON.parse(preferences.push_json)));
  }
  return { member, destination };
}

async function destinationFingerprint(destination: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(destination));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function prepareNotification(db: D1Database, config: NotificationConfig, recipientId: string, value: unknown) {
  const input = validateNotification(value);
  const target = await notificationTarget(db, config, recipientId, input);
  return {
    type: 'send_notification' as const,
    summary: `Send ${input.channel.replace('_', '-')} notification to ${target.member.display_name}.`,
    payload: { ...input, targetName: target.member.display_name, destination: await destinationFingerprint(target.destination), destinationLabel: input.channel === 'pushover' ? 'Registered Pushover account' : input.channel === 'push' ? 'Registered browser' : target.destination },
  };
}

export function parseNotificationRequest(message: string) {
  // Deliberately explicit grammar: do not infer external delivery from arbitrary care text.
  const match = message.match(/^(?:please\s+)?(?:send\s+)?(email|sms|text|push|pushover|in-app)(?:\s+notification(?=\s+to\s))?\s+(?:to\s+)?([^:]+):\s*(.+)$/i);
  if (!match) return null;
  return { channel: (match[1].toLowerCase() === 'text' ? 'sms' : match[1].toLowerCase() === 'in-app' ? 'in_app' : match[1].toLowerCase()) as NotificationInput['channel'], target: match[2].trim(), title: 'Caregiver update', detail: match[3].trim() };
}

type SendResult = { status: 'accepted' | 'failed' | 'unknown'; providerId?: string; errorCode?: string; expired?: boolean };
export async function sendViaProvider(config: NotificationConfig, input: NotificationInput, destination: string, actionId: string, recipientId: string): Promise<SendResult> {
  let url: string;
  let init: RequestInit;
  if (input.channel === 'email') {
    url = 'https://api.resend.com/emails';
    init = { method: 'POST', headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': actionId }, body: JSON.stringify({ from: config.NOTIFICATION_EMAIL_FROM, to: [destination], subject: input.title, text: input.detail }) };
  } else if (input.channel === 'sms') {
    url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.TWILIO_ACCOUNT_SID!)}/Messages.json`;
    init = { method: 'POST', headers: { Authorization: `Basic ${btoa(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ From: config.TWILIO_FROM_NUMBER!, To: destination, Body: `${input.title}\n${input.detail}` }).toString() };
  } else if (input.channel === 'pushover') {
    url = 'https://api.pushover.net/1/messages.json';
    init = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: config.PUSHOVER_API_TOKEN!, user: destination, title: input.title, message: input.detail, priority: '0' }).toString() };
  } else if (input.channel === 'push') {
    const request = webpush.generateRequestDetails(validateSubscription(JSON.parse(destination)), JSON.stringify({ title: input.title, body: input.detail, url: `/?recipientId=${encodeURIComponent(recipientId)}`, tag: actionId }), {
      vapidDetails: { subject: config.VAPID_SUBJECT!, publicKey: config.VAPID_PUBLIC_KEY!, privateKey: config.VAPID_PRIVATE_KEY! }, TTL: 3600,
    });
    url = request.endpoint;
    init = { method: request.method, headers: request.headers as Record<string, string>, body: request.body ? new Uint8Array(request.body) : undefined };
  } else throw new Error('In-app delivery does not use a provider');
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) return { status: response.status >= 500 || response.status === 408 ? 'unknown' : 'failed', errorCode: `provider_http_${response.status}`, expired: input.channel === 'push' && [404, 410].includes(response.status) };
    if (input.channel === 'push') return { status: 'accepted' };
    const body = await response.json() as { id?: string; sid?: string; status?: number; request?: string };
    if (input.channel === 'pushover') {
      if (body.status === 0) return { status: 'failed', errorCode: 'pushover_rejected' };
      return body.status === 1 && typeof body.request === 'string' && body.request.length <= 200 ? { status: 'accepted', providerId: body.request } : { status: 'unknown', errorCode: 'missing_provider_receipt' };
    }
    const providerId = body.id || body.sid;
    return typeof providerId === 'string' && providerId.length <= 200 ? { status: 'accepted', providerId } : { status: 'unknown', errorCode: 'missing_provider_receipt' };
  } catch { return { status: 'unknown', errorCode: 'provider_result_unknown' }; }
}

export async function executeNotification(db: D1Database, config: NotificationConfig, recipientId: string, actorMemberId: string, actionId: string, payload: Record<string, string>) {
  const input = validateNotification(payload);
  const actor = await db.prepare("SELECT 1 FROM recipient_members rm JOIN care_circle_members c ON c.id=rm.member_id WHERE rm.recipient_id=? AND rm.member_id=? AND rm.access_role IN ('owner','caregiver') AND c.status='active'").bind(recipientId, actorMemberId).first();
  if (!actor) throw new AppError('notification_forbidden', 403, 'Your access no longer permits this notification.');
  const target = await notificationTarget(db, config, recipientId, input);
  if (await destinationFingerprint(target.destination) !== payload.destination || target.member.display_name !== payload.targetName) throw new AppError('notification_target_changed', 409, 'The caregiver’s destination changed. Prepare a new notification for review.');
  const now = new Date().toISOString();
  const notificationId = crypto.randomUUID();
  // A unique action claim prevents duplicate sends, including simultaneous approvals.
  const claim = await db.prepare(`INSERT OR IGNORE INTO notification_deliveries (action_id,notification_id,recipient_id,member_id,channel,destination,status,created_at,updated_at)
    SELECT ?,?,?,?,?,?,'sending',?,? WHERE EXISTS (SELECT 1 FROM chat_action_requests WHERE id=? AND recipient_id=? AND actor_member_id=? AND action_type='send_notification' AND status='pending')`).bind(actionId, notificationId, recipientId, input.memberId, input.channel, input.channel === 'pushover' ? 'Registered Pushover account' : input.channel === 'push' ? 'Registered browser' : target.destination, now, now, actionId, recipientId, actorMemberId).run();
  if (!claim.meta.changes) throw new AppError('notification_already_attempted', 409, 'This notification was already attempted. Check delivery history before preparing another.');
  let result: SendResult | { status: 'posted' };
  if (input.channel === 'in_app') result = { status: 'posted' };
  else {
    try { result = await sendViaProvider(config, input, target.destination, actionId, recipientId); }
    catch { result = { status: 'failed', errorCode: 'provider_configuration_invalid' }; }
  }
  const outcome = result.status === 'posted' ? 'The update was posted to the caregiver’s Carestead inbox.' : result.status === 'accepted' ? `The ${input.channel} provider accepted the notification. Delivery and reading are not yet confirmed.` : result.status === 'failed' ? `The ${input.channel} notification failed. Check notification delivery history.` : `The ${input.channel} delivery result is unknown. Check the provider before sending again; it may already have been sent.`;
  await db.batch([
    db.prepare('UPDATE notification_deliveries SET status=?,provider_id=?,error_code=?,updated_at=? WHERE action_id=?').bind(result.status, 'providerId' in result ? result.providerId ?? null : null, 'errorCode' in result ? result.errorCode ?? null : null, new Date().toISOString(), actionId),
    db.prepare('INSERT INTO notifications VALUES (?,?,?,?,?,?,?,?,?)').bind(notificationId, recipientId, 'reminder', input.title, input.detail, null, 'delivered', null, now),
    db.prepare("UPDATE chat_action_requests SET status='executed',decided_at=?,executed_at=? WHERE id=?").bind(now, now, actionId),
  ]);
  if ('expired' in result && result.expired) await db.prepare('UPDATE notification_preferences SET push_json=NULL WHERE recipient_id=? AND member_id=? AND push_json=?').bind(recipientId, input.memberId, target.destination).run();
  return outcome;
}
