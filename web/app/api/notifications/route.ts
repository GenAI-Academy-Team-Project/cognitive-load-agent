import { effectiveIntegrations } from '@/lib/integration-settings';
import { recipientLease } from '@/lib/recipient-lease';
import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/bootstrap';
import { requireMembership } from '@/lib/auth';
import { AppError, enforceRateLimit, errorResponse } from '@/lib/guardrails';
import { configuredChannels, ntfyServerUrl, validNtfyTopic, type NotificationPreferences } from '@/lib/notification-types';
import { validateSubscription } from '@/lib/notification-service';

export const runtime = 'edge';

async function handle(request: Request) {
  try {
    await ensureDatabase(env.DB);
    const auth = await requireMembership(env.DB, request, env.AUTH_PUBLIC_URL);
    if ('error' in auth) return auth.error;
    let body: Record<string, unknown> = {};
    if (request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > 8000) throw new AppError('too_large', 413, 'Notification settings are too large.');
      try { body = JSON.parse(raw); } catch { throw new AppError('invalid_json', 400, 'Invalid settings.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('invalid_payload', 400, 'Invalid settings.');
    }
    const recipientId = request.method === 'POST' ? body.recipientId : new URL(request.url).searchParams.get('recipientId');
    if (typeof recipientId !== 'string' || !recipientId) throw new AppError('recipient_required', 400, 'Choose a care recipient.');
    const memberId = auth.member.memberId;
    const access = await env.DB.prepare("SELECT rm.access_role,c.status consent FROM recipient_members rm JOIN care_recipients cr ON cr.id=rm.recipient_id LEFT JOIN consent_records c ON c.recipient_id=cr.id WHERE rm.member_id=? AND rm.recipient_id=? AND cr.status='active'").bind(memberId, recipientId).first<{ access_role: string; consent: string }>();
    if (!access) throw new AppError('forbidden', 403, 'You do not have access to this care recipient.');
    if (request.method === 'POST') {
      await enforceRateLimit(env.DB, auth.member.id, 'notification_settings');
      if (!['save_preferences', 'subscribe_push', 'disable_push', 'enable_ntfy', 'disable_ntfy'].includes(String(body.action))) throw new AppError('invalid_action', 400, 'Choose a notification setting.');
      const release = await recipientLease(env.DB, recipientId);
      try {
      const currentConsent = await env.DB.prepare('SELECT status FROM consent_records WHERE recipient_id=?').bind(recipientId).first<{ status: string }>();
      access.consent = currentConsent?.status || 'withdrawn';
      const now = new Date().toISOString();
      if (access.consent !== 'active' && !(body.action === 'disable_ntfy' || body.action === 'disable_push' || (body.action === 'save_preferences' && body.emailEnabled === false && body.smsEnabled === false))) throw new AppError('consent_inactive', 409, 'Restore consent before enabling notifications.');
      if (body.action === 'enable_ntfy') {
        const server = ntfyServerUrl((await effectiveIntegrations(env.DB, env)).NTFY_SERVER_URL);
        if (!server) throw new AppError('channel_unconfigured', 409, 'Enable ntfy in Integrations first.');
        if (!validNtfyTopic(body.topic)) throw new AppError('invalid_ntfy_topic', 400, 'Enter a topic of 1–64 letters, digits, underscores or hyphens, excluding reserved names.');
        await env.DB.prepare('INSERT INTO ntfy_preferences VALUES (?,?,?,?,?) ON CONFLICT(recipient_id,member_id) DO UPDATE SET server_url=excluded.server_url,topic=excluded.topic,updated_at=excluded.updated_at').bind(recipientId, memberId, server, body.topic, now).run();
      } else if (body.action === 'disable_ntfy') {
        await env.DB.prepare('DELETE FROM ntfy_preferences WHERE recipient_id=? AND member_id=?').bind(recipientId, memberId).run();
      } else if (body.action === 'save_preferences') {
        if (typeof body.emailEnabled !== 'boolean' || typeof body.smsEnabled !== 'boolean' || typeof body.phone !== 'string' || body.phone.length > 16 || (body.phone !== '' && !/^\+[1-9]\d{7,14}$/.test(body.phone)) || (body.smsEnabled && !body.phone)) throw new AppError('invalid_settings', 400, 'Use a phone number with country code, such as +14165550123.');
        await env.DB.prepare(`INSERT INTO notification_preferences (recipient_id,member_id,email_enabled,sms_enabled,phone,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(recipient_id,member_id) DO UPDATE SET email_enabled=excluded.email_enabled,sms_enabled=excluded.sms_enabled,phone=excluded.phone,updated_at=excluded.updated_at`).bind(recipientId, memberId, Number(body.emailEnabled), Number(body.smsEnabled), body.phone, now).run();
      } else if (body.action === 'subscribe_push') {
        if (!configuredChannels(await effectiveIntegrations(env.DB, env)).includes('push')) throw new AppError('channel_unconfigured', 409, 'Push delivery is not configured.');
        const subscription = validateSubscription(body.subscription);
        // A browser endpoint may belong to only one signed-in caregiver.
        await env.DB.batch([
          env.DB.prepare('UPDATE notification_preferences SET push_json=NULL WHERE member_id!=? AND json_extract(push_json,\'$.endpoint\')=?').bind(memberId, subscription.endpoint),
          env.DB.prepare('INSERT INTO notification_preferences (recipient_id,member_id,push_json,updated_at) VALUES (?,?,?,?) ON CONFLICT(recipient_id,member_id) DO UPDATE SET push_json=excluded.push_json,updated_at=excluded.updated_at').bind(recipientId, memberId, JSON.stringify(subscription), now),
        ]);
      } else await env.DB.prepare('UPDATE notification_preferences SET push_json=NULL,updated_at=? WHERE recipient_id=? AND member_id=?').bind(now, recipientId, memberId).run();
      await env.DB.prepare('INSERT INTO audit_entries VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), auth.member.id, auth.member.email, String(body.action), 'notification_preferences', recipientId, 'Updated own notification preferences', now).run();
      } finally { await release(); }
    }
    const prefs = await env.DB.prepare('SELECT * FROM notification_preferences WHERE recipient_id=? AND member_id=?').bind(recipientId, memberId).first<NotificationPreferences>();
    const deliveries = (await env.DB.prepare(`SELECT d.action_id,d.channel,d.status,d.error_code,d.created_at,c.display_name target_name,n.title FROM notification_deliveries d JOIN care_circle_members c ON c.id=d.member_id LEFT JOIN notifications n ON n.id=d.notification_id LEFT JOIN chat_action_requests a ON a.id=d.action_id WHERE d.recipient_id=? AND (d.member_id=? OR a.actor_member_id=?) ORDER BY d.created_at DESC`).bind(recipientId, memberId, memberId).all()).results;
    const ntfyPreference = await env.DB.prepare('SELECT topic FROM ntfy_preferences WHERE recipient_id=? AND member_id=?').bind(recipientId, memberId).first<{ topic: string }>();
    const ntfyEnabled = Boolean(ntfyPreference);
    return Response.json({ ntfyEnabled, ntfyTopic: ntfyPreference?.topic || null, ntfyServerUrl: ntfyServerUrl((await effectiveIntegrations(env.DB, env)).NTFY_SERVER_URL), email: auth.member.email, emailEnabled: Boolean(prefs?.email_enabled), smsEnabled: Boolean(prefs?.sms_enabled), phone: prefs?.phone || '', pushEnabled: Boolean(prefs?.push_json), vapidPublicKey: (await effectiveIntegrations(env.DB, env)).VAPID_PUBLIC_KEY || null, channels: configuredChannels(await effectiveIntegrations(env.DB, env)), deliveries }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error, crypto.randomUUID()); }
}

export const GET = handle;
export const POST = handle;
