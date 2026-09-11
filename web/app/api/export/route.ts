import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/bootstrap';
import { requireMembership, type CareRole } from '@/lib/auth';
import { AppError, enforceRateLimit, errorResponse, recordError } from '@/lib/guardrails';

export const runtime = 'edge';

async function all<T>(sql: string, values: unknown[] = []) { return (await env.DB.prepare(sql).bind(...values).all<T>()).results; }

export async function GET(request: Request) {
  const requestId = crypto.randomUUID(); let recipientId = '';
  try {
    await ensureDatabase(env.DB); const auth = await requireMembership(env.DB, request); if ('error' in auth) return auth.error;
    recipientId = new URL(request.url).searchParams.get('recipientId') || ''; if (!recipientId) throw new AppError('recipient_required', 400, 'Choose a care recipient to export');
    await enforceRateLimit(env.DB, auth.member.id, 'export');
    const access = await env.DB.prepare("SELECT rm.access_role role FROM recipient_members rm JOIN care_recipients cr ON cr.id=rm.recipient_id WHERE rm.member_id=? AND rm.recipient_id=? AND cr.status='active'").bind(auth.member.memberId, recipientId).first<{ role: CareRole }>();
    if (!access || access.role !== 'owner') throw new AppError('export_forbidden', 403, 'Only the recipient owner can export this data');
    const consent = await env.DB.prepare('SELECT * FROM consent_records WHERE recipient_id=?').bind(recipientId).first<{ status: string }>(); if (consent?.status !== 'active') throw new AppError('consent_inactive', 409, 'Consent must be active before data can be exported');
    const recipient = await env.DB.prepare('SELECT * FROM care_recipients WHERE id=?').bind(recipientId).first<{ display_name: string }>(); if (!recipient) throw new AppError('not_found', 404, 'Care recipient not found');
    const scoped = (table: string, type: string) => `SELECT x.* FROM ${table} x JOIN record_scopes s ON s.entity_type='${type}' AND s.entity_id=x.id WHERE s.recipient_id=?`;
    const [profile, contacts, plans, tasks, events, memories, risks, approvals, traces, notifications, careTeam] = await Promise.all([
      env.DB.prepare('SELECT * FROM recipient_profiles WHERE recipient_id=?').bind(recipientId).first(), all('SELECT * FROM support_contacts WHERE recipient_id=?', [recipientId]), all('SELECT * FROM care_plans WHERE recipient_id=?', [recipientId]), all(scoped('tasks','task'), [recipientId]), all(scoped('events','event'), [recipientId]), all(scoped('memories','memory'), [recipientId]), all(scoped('risks','risk'), [recipientId]), all(scoped('approvals','approval'), [recipientId]), all(scoped('traces','trace'), [recipientId]), all('SELECT * FROM notifications WHERE recipient_id=?', [recipientId]), all('SELECT c.display_name,c.email,rm.access_role role,c.status FROM recipient_members rm JOIN care_circle_members c ON c.id=rm.member_id WHERE rm.recipient_id=?', [recipientId]),
    ]);
    const completedAt = new Date().toISOString(); await env.DB.prepare('INSERT INTO data_requests VALUES (?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), recipientId, 'export', 'completed', auth.member.id, completedAt, completedAt).run();
    const payload = { schema_version: 'carestead-export-v1', exported_at: completedAt, exported_by: auth.member.email, non_clinical_notice: 'Carestead is a care-coordination tool, not a medical record or clinical decision system.', recipient, profile, consent, support_contacts: contacts, care_team: careTeam, plans, tasks, events, memories, risks, approvals, traces, notifications };
    const filename = `${recipient.display_name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'care-recipient'}-carestead-export.json`;
    return new Response(JSON.stringify(payload, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' } });
  } catch (error) { await recordError(env.DB, { requestId, route: '/api/export', action: 'export', errorCode: error instanceof AppError ? error.code : 'unhandled', recipientId }); return errorResponse(error, requestId); }
}
