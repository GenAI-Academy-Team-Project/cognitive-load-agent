import { effectiveIntegrations } from '@/lib/integration-settings';
import { editNotification, executeNotification, parseNotificationRequest, prepareNotification, prepareNotifications } from '@/lib/notification-service';
import { configuredChannels, sendNotificationTool } from '@/lib/notification-types';
import { evaluateCareState } from '@/lib/risk-engine';
import { memoryCandidate, recallMemory } from '@/lib/care-memory';
import { recipientLease } from '@/lib/recipient-lease';
import { localToInstant } from '@/lib/calendar-time';
import { careAgentRecords, loadCareSnapshot, type CareSnapshot } from '@/lib/care-context';
import { generateGroundedAnswer, modelEnabled } from '@/lib/llm-agent';
import { env } from 'cloudflare:workers';

import { ensureDatabase } from '@/db/bootstrap';
import { canWrite, isOwner, requireMembership, type CareMembership, type CareRole } from '@/lib/auth';
import { AppError, enforceRateLimit, errorResponse, recordError } from '@/lib/guardrails';
import type { CareTask, ChatActionRequest, ChatEvidence, ChatMessage, ChatState } from '@/lib/types';

export const runtime = 'edge';

type Access = { recipientId: string; accessRole: CareRole; recipientName: string };
type ActionRow = Omit<ChatActionRequest, 'payload'> & { payload_json: string; thread_id: string };
type MessageRow = Omit<ChatMessage, 'evidence' | 'action'> & {
  evidence_json: string;
  action_request_id: string | null;
  action_type: ChatActionRequest['action_type'] | null;
  action_summary: string | null;
  action_status: ChatActionRequest['status'] | null;
  action_requires_approval: 'true' | null;
  action_payload_json: string | null;
};
type ProposedAction = {
  type: ChatActionRequest['action_type'];
  summary: string;
  payload: Record<string, string>;
};
type Body = { action?: 'message' | 'approve_action' | 'reject_action' | 'propose_notification' | 'edit_notification' | 'clear_history'; notification?: unknown; recipientId?: string; message?: string; actionId?: string; scope?: 'notifications' };

const quickPrompts = [
  'What should I review today?',
  'Remember that afternoon appointments are preferred.',
  'Are there any calendar conflicts?',
  'Who are the key support contacts?',
  'Reschedule the physiotherapy appointment to tomorrow at 3:30 PM',
];

async function rows<T>(db: D1Database, sql: string, values: unknown[] = []) {
  return (await db.prepare(sql).bind(...values).all<T>()).results;
}

async function accessFor(db: D1Database, member: CareMembership, requested: string): Promise<Access | null> {
  const existing = await db.prepare('SELECT COUNT(*) count FROM recipient_members WHERE member_id=?').bind(member.memberId).first<{ count: number }>();
  if (!(existing?.count ?? 0) && isOwner(member.role)) {
    await db.prepare('INSERT OR IGNORE INTO recipient_members VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'recipient-alex', member.memberId, 'owner', new Date().toISOString()).run();
  }
  return db.prepare("SELECT rm.recipient_id recipientId,rm.access_role accessRole,cr.display_name recipientName FROM recipient_members rm JOIN care_recipients cr ON cr.id=rm.recipient_id WHERE rm.member_id=? AND rm.recipient_id=? AND cr.status='active'").bind(member.memberId, requested).first<Access>();
}

async function threadFor(db: D1Database, recipientId: string, memberId: string, now: string) {
  const found = await db.prepare('SELECT id FROM chat_threads WHERE recipient_id=? AND member_id=?').bind(recipientId, memberId).first<{ id: string }>();
  if (found) return found.id;
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO chat_threads VALUES (?, ?, ?, ?, ?, ?)').bind(id, recipientId, memberId, 'Carestead assistant', now, now).run();
  return id;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function messagesFor(db: D1Database, threadId: string): Promise<ChatMessage[]> {
  // Older app receipts have no action link; keep their original chat approval cards,
  // but omit those ambiguous activity receipts from the conversation.
  const messages = await rows<MessageRow>(db, `SELECT m.*,a.action_type,a.summary action_summary,a.status action_status,a.requires_approval action_requires_approval,a.payload_json action_payload_json
    FROM chat_messages m LEFT JOIN chat_action_requests a ON a.id=m.action_request_id
    WHERE m.thread_id=?
      AND NOT (m.role='assistant' AND m.content = 'Review the caregiver, channel, and exact message before approving delivery.')
      AND NOT (m.role='assistant' AND m.action_request_id IS NULL AND
        (m.content='Action cancelled. No care-plan data was changed.' OR m.evidence_json LIKE '%"label":"Completed tool"%'))
      ORDER BY m.created_at DESC,m.id DESC`, [threadId]);
  return messages.reverse().map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    evidence: parseJson<ChatEvidence[]>(message.evidence_json, []),
    action: message.action_request_id && message.action_type && message.action_summary && message.action_status ? {
      id: message.action_request_id,
      action_type: message.action_type,
      summary: message.action_summary,
      status: message.action_status,
      requires_approval: 'true',
      payload: parseJson<Record<string, string>>(message.action_payload_json, {}),
    } : null,
    created_at: message.created_at,
  }));
}

async function chatState(db: D1Database, env: typeof import('cloudflare:workers').env, access: Access, threadId: string, notifications = false): Promise<ChatState> {
  // The composer reads pending drafts directly; app activity is never a chat message.
  const drafts = notifications ? await rows<ActionRow & { created_at: string }>(db,
    "SELECT * FROM chat_action_requests WHERE thread_id=? AND recipient_id=? AND action_type='send_notification' AND status='pending' ORDER BY created_at,id",
    [threadId, access.recipientId]) : [];

  const llmConfig = await effectiveIntegrations(db, env);

  return {
    recipientId: access.recipientId,
    recipientName: access.recipientName,
    messages: notifications ? drafts.map((draft) => ({
      id: draft.id, role: 'assistant' as const, content: '', evidence: [], created_at: draft.created_at,
      action: { id: draft.id, action_type: draft.action_type, summary: draft.summary, status: draft.status,
        requires_approval: draft.requires_approval, payload: parseJson<Record<string, string>>(draft.payload_json, {}) },
    })) : await messagesFor(db, threadId),
    quickPrompts,
    tools: [sendNotificationTool],
    agentMode: modelEnabled(llmConfig) ? 'model' : 'deterministic',
    model: modelEnabled(llmConfig) ? (llmConfig.OPENAI_MODEL || 'gpt-5.6-terra') : undefined,
    notificationChannels: configuredChannels(llmConfig),
    capabilities: { voiceInput: true, spokenReplies: true, externalDelivery: configuredChannels(llmConfig).length > 1 },
  };
}

const compact = (value: string, max = 180) => value.replace(/\s+/g, ' ').trim().slice(0, max);
const evidence = (label: string, detail: string): ChatEvidence => ({ label, detail: compact(detail, 220) });
const formatWhen = (value: string) => new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' }).format(new Date(value)).replace('a.m.', 'AM').replace('p.m.', 'PM');

function requestedDate(message: string, now: Date) {
  const iso = message.match(/\b(20\d{2}-\d{2}-\d{2})(?:[ t](\d{1,2})(?::(\d{2}))?)?\b/i);
  const clock = message.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (iso) {
    let hour = Number(iso[2] || clock?.[1] || '09');
    if (clock) hour = Number(clock[1]) % 12 + (clock[3].toLowerCase() === 'pm' ? 12 : 0);
    try { return localToInstant(`${iso[1]}T${String(hour).padStart(2, '0')}:${String(iso[3] || clock?.[2] || '00').padStart(2, '0')}`, 'America/Toronto'); } catch { return null; }
  }
  if (!clock) return null;
  const period = clock[3].toLowerCase();
  let hour = Number(clock[1]) % 12;
  if (period === 'pm') hour += 12;
  const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => Number(dateParts.find((item) => item.type === type)?.value || 0);
  const localDay = new Date(Date.UTC(part('year'), part('month') - 1, part('day') + (/\btomorrow\b/i.test(message) ? 1 : 0), 12));
  const wallTime = Date.UTC(localDay.getUTCFullYear(), localDay.getUTCMonth(), localDay.getUTCDate(), hour, Number(clock[2] || 0));
  const offsetText = new Intl.DateTimeFormat('en', { timeZone: 'America/Toronto', timeZoneName: 'shortOffset' }).formatToParts(new Date(wallTime)).find((item) => item.type === 'timeZoneName')?.value || 'GMT-4';
  const offsetMatch = offsetText.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const offsetMinutes = offsetMatch ? (offsetMatch[1] === '+' ? 1 : -1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3] || 0)) : -240;
  return new Date(wallTime - offsetMinutes * 60000).toISOString();
}

function bestTask(message: string, tasks: CareTask[]) {
  const lower = message.toLowerCase();
  const words = lower.split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  return [...tasks].sort((a, b) => words.filter((word) => b.title.toLowerCase().includes(word)).length - words.filter((word) => a.title.toLowerCase().includes(word)).length)[0];
}

function propose(message: string, snapshot: CareSnapshot, now: Date): ProposedAction | null {
  const lower = message.toLowerCase();
  if (lower.includes('reschedule') || /\bmove\b/.test(lower)) {
    const task = bestTask(message, snapshot.tasks.filter((item) => item.category === 'appointment'));
    const dueAt = requestedDate(message, now);
    if (task && dueAt) return { type: 'reschedule_task', summary: `Move “${task.title}” to ${formatWhen(dueAt)}.`, payload: { taskId: task.id, dueAt } };
  }
  if (lower.includes('notify') || lower.includes('send a notification') || lower.includes('send notification')) {
    return { type: 'send_notification', summary: `Post an in-app caregiver update for ${snapshot.profile.preferred_name || 'this recipient'}.`, payload: { title: 'Caregiver update', detail: compact(message.replace(/^(please\s+)?(send\s+)?(a\s+)?notification\s*(to\s+[^:,.]+)?[:,.]?\s*/i, '') || message, 500) } };
  }
  if (lower.includes('add responsibility') || lower.includes('create responsibility')) {
    const title = compact(message.replace(/^.*?(?:add|create) responsibility(?: to)?/i, '').replace(/\b(?:due\s+)?tomorrow.*$/i, ''), 160) || 'Follow up with care team';
    const dueAt = requestedDate(message, now) ?? new Date(now.getTime() + 86400000).toISOString();
    return { type: 'create_task', summary: `Add “${title}” due ${formatWhen(dueAt)}.`, payload: { title, dueAt, owner: 'Unassigned', category: 'general' } };
  }
  if (lower.includes('run care check') || lower.includes('check the care plan')) {
    return { type: 'run_care_check', summary: 'Run Carestead’s deterministic care-state check and save its trace.', payload: {} };
  }
  return null;
}

function answer(message: string, snapshot: CareSnapshot): { content: string; evidence: ChatEvidence[] } {
  const lower = message.toLowerCase();
  if (/\bassign\b/.test(lower)) return { content: 'Open Care planning → Task planning to choose a caregiver by identity. They can accept once their availability matches. Use “I need a break” to request replacement coverage.', evidence: [] };
  const openRisks = snapshot.risks.filter((risk) => risk.status !== 'resolved');
  const openTasks = snapshot.tasks.filter((task) => task.status !== 'complete');
  if (/summary|handover|review today|attention|what.*today/.test(lower)) {
    const topRisk = openRisks[0];
    const next = openTasks.slice(0, 3);
    return {
      content: `${snapshot.profile.preferred_name || 'This recipient'} has ${openRisks.length} open risk${openRisks.length === 1 ? '' : 's'} and ${openTasks.length} open responsibilities. ${topRisk ? `The first item to review is “${topRisk.title}.”` : 'No unresolved risk is recorded.'} ${next.length ? `Next responsibilities: ${next.map((task) => `${task.title} (${task.owner})`).join('; ')}.` : ''}`,
      evidence: [topRisk ? evidence('Highest-priority risk', `${topRisk.severity}: ${topRisk.detail}`) : evidence('Risk register', 'No unresolved risks'), ...next.map((task) => evidence('Responsibility', `${task.title} · ${task.owner} · ${formatWhen(task.due_at)}`))],
    };
  }
  if (/conflict|calendar|schedule|appointment|upcoming/.test(lower)) {
    const appointments = openTasks.filter((task) => task.category === 'appointment').sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
    const conflicts = appointments.flatMap((first, index) => appointments.slice(index + 1).filter((second) => Math.abs(Date.parse(first.due_at) - Date.parse(second.due_at)) < 90 * 60000).map((second) => [first, second] as const));
    return conflicts.length ? {
      content: `I found ${conflicts.length} potential calendar conflict${conflicts.length === 1 ? '' : 's'}. I can prepare a reschedule for caregiver approval.`,
      evidence: conflicts.flatMap(([first, second]) => [evidence('Conflicting appointment', `${first.title} · ${formatWhen(first.due_at)}`), evidence('Conflicting appointment', `${second.title} · ${formatWhen(second.due_at)}`)]),
    } : {
      content: appointments.length ? `I found no overlapping appointments. The next recorded appointment is “${appointments[0].title}” on ${formatWhen(appointments[0].due_at)}.` : 'There are no active appointments in this care plan.',
      evidence: appointments.slice(0, 3).map((task) => evidence('Calendar', `${task.title} · ${formatWhen(task.due_at)} · owner ${task.owner}`)),
    };
  }
  if (/contact|support|phone|call|who/.test(lower)) {
    return { content: snapshot.contacts.length ? `Key support contacts are ${snapshot.contacts.map((contact) => `${contact.name} (${contact.relationship})`).join(', ')}.` : 'No active support contacts are recorded.', evidence: snapshot.contacts.slice(0, 5).map((contact) => evidence(contact.priority === 'primary' ? 'Primary contact' : 'Support contact', `${contact.name} · ${contact.relationship}${contact.phone ? ` · ${contact.phone}` : ''}${contact.notes ? ` · ${contact.notes}` : ''}`)) };
  }
  if (/medication|medicine|pharmacy|refill/.test(lower)) {
    const risks = snapshot.risks.filter((item) => item.kind === 'medication');
    const tasks = snapshot.tasks.filter((item) => item.category === 'medication');
    const memories = snapshot.memories.filter((item) => item.kind === 'medication');
    return { content: risks[0] ? `${risks[0].title}. ${risks[0].detail} The proposed next step is: ${risks[0].proposed_action}` : 'No medication risk is currently recorded.', evidence: [...risks.slice(0, 2).map((item) => evidence('Medication risk', `${item.severity} · ${item.status} · ${item.rationale}`)), ...tasks.slice(0, 3).map((item) => evidence('Medication responsibility', `${item.title} · ${item.owner} · ${item.status}`)), ...memories.slice(0, 2).map((item) => evidence('Trusted fact', `${item.value} · ${item.source}`))] };
  }
  if (/decision|agent|why|trace/.test(lower)) {
    const latest = snapshot.traces[0];
    return { content: latest ? `The latest recorded agent decision was “${latest.decision}.” Policy result: ${latest.policy_status}. Outcome: ${latest.outcome}.` : 'No agent decision trace is recorded yet.', evidence: latest ? [evidence('Decision evidence', latest.evidence), evidence('Tool and outcome', `${latest.tool} · ${latest.outcome}`)] : [] };
  }
  const terms = lower.split(/[^a-z0-9]+/).filter((term) => term.length > 3);
  const candidates = [
    ...snapshot.memories.map((item) => evidence('Trusted fact', `${item.value} · ${item.source}`)),
    ...snapshot.tasks.map((item) => evidence('Responsibility', `${item.title} · ${item.owner} · ${item.status}`)),
    ...snapshot.events.map((item) => evidence('Timeline', `${item.title} · ${item.detail}`)),
    ...snapshot.risks.map((item) => evidence('Risk', `${item.title} · ${item.detail}`)),
    ...snapshot.contacts.map((item) => evidence('Contact', `${item.name} · ${item.relationship} · ${item.notes}`)),
  ].filter((item) => terms.some((term) => item.detail.toLowerCase().includes(term))).slice(0, 5);
  return candidates.length ? { content: `I found ${candidates.length} relevant care-plan record${candidates.length === 1 ? '' : 's'}. I’ve listed the supporting information below.`, evidence: candidates } : { content: `I could not find that in ${snapshot.profile.preferred_name || 'this recipient'}’s profile, responsibilities, timeline, risks, contacts, or trusted facts. You can add it as a responsibility or trusted fact if appropriate.`, evidence: [] };
}

async function saveMessage(db: D1Database, threadId: string, role: ChatMessage['role'], content: string, evidenceItems: ChatEvidence[], actionId: string | null, now: string) {
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO chat_messages VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, threadId, role, compact(content, 4000), JSON.stringify(evidenceItems), actionId, now).run();
  await db.prepare('UPDATE chat_threads SET updated_at=? WHERE id=?').bind(now, threadId).run();
  return id;
}

async function audit(db: D1Database, member: CareMembership, action: string, entityType: string, entityId: string, detail: string) {
  await db.prepare('INSERT INTO audit_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), member.id, member.email, action, entityType, entityId, detail, new Date().toISOString()).run();
}

async function proposeAction(db: D1Database, threadId: string, recipientId: string, member: CareMembership, proposal: ProposedAction, now: string) {
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO chat_action_requests VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, threadId, recipientId, member.memberId, proposal.type, proposal.summary, JSON.stringify(proposal.payload), 'pending', 'true', now, null, null).run();
  return id;
}

async function executeAction(db: D1Database, member: CareMembership, access: Access, action: ActionRow, now: string) {
  if (action.action_type !== 'send_notification') return executeActionImpl(db, member, access, action, now);
  // Share the consent/deletion lease through provider dispatch and audit persistence.
  const release = await recipientLease(db, access.recipientId);
  try {
    if ((await db.prepare('SELECT status FROM consent_records WHERE recipient_id=?').bind(access.recipientId).first<{ status: string }>())?.status !== 'active') throw new AppError('consent_inactive', 409, 'Consent is withdrawn.');
    return await executeActionImpl(db, member, access, action, now);
  } finally { await release(); }
}

async function executeActionImpl(db: D1Database, member: CareMembership, access: Access, action: ActionRow, now: string) {
  const payload = parseJson<Record<string, string>>(action.payload_json, {});
  const plan = await db.prepare("SELECT id FROM care_plans WHERE recipient_id=? AND status='active' ORDER BY activated_at DESC LIMIT 1").bind(access.recipientId).first<{ id: string }>();
  if (!plan) throw new AppError('plan_not_found', 404, 'Active care plan not found');
  const scoped = async (type: string, id: string) => Boolean(await db.prepare('SELECT 1 ok FROM record_scopes WHERE entity_type=? AND entity_id=? AND recipient_id=?').bind(type, id, access.recipientId).first());
  const scope = (type: string, id: string) => db.prepare('INSERT INTO record_scopes VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), type, id, access.recipientId, plan.id, now);
  const eventId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  let outcome = '';
  if (action.action_type === 'save_memory') {
    if (!payload.value || payload.value.length > 1200 || !payload.memoryId || !payload.sourceMessageId) throw new AppError('invalid_memory', 400, 'This suggested fact is incomplete.');
    const source = await db.prepare("SELECT content FROM chat_messages WHERE id=? AND thread_id=? AND role='user'").bind(payload.sourceMessageId, action.thread_id).first<{ content: string }>();
    if (!source || memoryCandidate(source.content) !== payload.value) throw new AppError('memory_source_expired', 409, 'The original message is unavailable or changed. Please suggest the fact again.');
    const release = await recipientLease(db, access.recipientId);
    try {
      if ((await db.prepare('SELECT status FROM consent_records WHERE recipient_id=?').bind(access.recipientId).first<{ status: string }>())?.status !== 'active') throw new AppError('consent_inactive', 409, 'Consent is withdrawn.');
      if (!(await db.prepare("SELECT 1 FROM chat_action_requests WHERE id=? AND status='pending'").bind(action.id).first())) throw new AppError('action_already_decided', 409, 'This action was already decided');
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO memories VALUES (?, ?, ?, ?, ?, ?, ?)").bind(payload.memoryId, 'preference', payload.value, `Chat message ${payload.sourceMessageId}; confirmed by ${member.displayName}`.slice(0, 200), 'high', 'verified', now),
        db.prepare("INSERT OR IGNORE INTO record_scopes VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), 'memory', payload.memoryId, access.recipientId, plan.id, now),
        db.prepare('UPDATE chat_action_requests SET status=?,decided_at=?,executed_at=? WHERE id=?').bind('executed', now, now, action.id),
        db.prepare('INSERT INTO traces VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(traceId, 'Caregiver-approved chat fact', action.summary, action.action_type, 'approved by human', 'Carestead memory', 'Verified fact saved', now),
        scope('trace', traceId),
      ]);
      await audit(db, member, 'execute', 'chat_action', action.id, 'Saved a caregiver-confirmed fact from chat');
      return 'The verified fact was saved for this care circle and is available in future conversations.';
    } finally { await release(); }
  } else if (action.action_type === 'reschedule_task') {
    if (await db.prepare("SELECT 1 FROM calendar_appointments WHERE task_id=? AND recipient_id=? AND status='confirmed'").bind(payload.taskId || '', access.recipientId).first()) throw new AppError('linked_calendar_task', 409, 'Use Calendar to review the new time and notify this appointment’s guests.');
    if (!payload.taskId || !payload.dueAt || !await scoped('task', payload.taskId)) throw new AppError('task_not_found', 404, 'Appointment not found');
    const task = await db.prepare('SELECT title FROM tasks WHERE id=?').bind(payload.taskId).first<{ title: string }>();
    await db.batch([db.prepare('UPDATE tasks SET due_at=? WHERE id=?').bind(payload.dueAt, payload.taskId), db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)').bind(eventId, 'appointment', 'Appointment rescheduled', `${task?.title || 'Appointment'} moved to ${formatWhen(payload.dueAt)}.`, member.displayName, now), scope('event', eventId)]);
    outcome = `${task?.title || 'Appointment'} was rescheduled to ${formatWhen(payload.dueAt)}.`;
  } else if (action.action_type === 'send_notification') {
    // Older proposals without a target retain their original in-app behavior.
    if (!payload.channel) {
      await db.prepare('INSERT OR IGNORE INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(action.id, access.recipientId, 'reminder', compact(payload.title || 'Caregiver update', 180), compact(payload.detail || action.summary, 900), null, 'delivered', null, now).run();
      outcome = 'The update was posted to Carestead notifications. No external message was sent.';
    } else outcome = await executeNotification(db, await effectiveIntegrations(db, env), access.recipientId, member.memberId, action.id, payload);
  } else if (action.action_type === 'assign_task') {
    if (!payload.taskId || !await scoped('task', payload.taskId)) throw new AppError('task_not_found', 404, 'Responsibility not found');
    const task = await db.prepare('SELECT title FROM tasks WHERE id=?').bind(payload.taskId).first<{ title: string }>();
    throw new AppError('choose_caregiver', 409, `Use Care planning to assign ${task?.title || 'this responsibility'} and request acceptance.`);
  } else if (action.action_type === 'create_task') {
    const taskId = crypto.randomUUID();
    await db.batch([db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)').bind(taskId, compact(payload.title || 'Care follow-up', 180), compact(payload.owner || 'Unassigned', 100), payload.dueAt || new Date(Date.now() + 86400000).toISOString(), 'open', compact(payload.category || 'general', 80), null), scope('task', taskId)]);
    outcome = `“${payload.title || 'Care follow-up'}” was added to responsibilities.`;
  } else if (action.action_type === 'run_care_check') {
    const snapshot = await loadCareSnapshot(db, access.recipientId);
    const decision = evaluateCareState(snapshot.tasks, snapshot.events, snapshot.memories);
    outcome = `Care check completed. ${decision.title}. ${decision.recommendation}`;
  } else throw new AppError('unsupported_chat_action', 400, 'This action is not supported');
  await db.batch([
    db.prepare('UPDATE chat_action_requests SET status=?,decided_at=?,executed_at=? WHERE id=?').bind('executed', now, now, action.id),
    db.prepare('INSERT INTO traces VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(traceId, 'Caregiver-approved chat action', action.summary, action.action_type, 'approved by human', 'Carestead chat tools', outcome, now),
    scope('trace', traceId),
  ]);
  await audit(db, member, 'execute', 'chat_action', action.id, `${action.summary} ${outcome}`);
  return outcome;
}

async function resolveContext(request: Request, recipientId: string) {
  const db = env.DB;
  await ensureDatabase(db);
  const auth = await requireMembership(db, request, env.AUTH_PUBLIC_URL);
  if ('error' in auth) return { error: auth.error } as const;
  const access = await accessFor(db, auth.member, recipientId);
  if (!access) return { error: Response.json({ error: 'You do not have access to this care recipient' }, { status: 403 }) } as const;
  const consent = await db.prepare('SELECT status,retention_days FROM consent_records WHERE recipient_id=?').bind(recipientId).first<{ status: string; retention_days: string }>();
  if (consent?.status !== 'active') return { error: Response.json({ error: 'Consent is withdrawn. Chat and voice are paused for this profile.' }, { status: 409 }) } as const;
  const days = Number(consent.retention_days);
  if (days > 0) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    await db.batch([
      db.prepare('DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE recipient_id=?) AND created_at<?').bind(recipientId, cutoff),
      db.prepare('DELETE FROM chat_action_requests WHERE recipient_id=? AND created_at<?').bind(recipientId, cutoff),
    ]);
  }
  const threadId = await threadFor(db, recipientId, auth.member.memberId, new Date().toISOString());
  return { db, member: auth.member, access, threadId } as const;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const recipientId = new URL(request.url).searchParams.get('recipientId');
    if (!recipientId) throw new AppError('recipient_required', 400, 'Choose a care recipient');
    const context = await resolveContext(request, recipientId);
    if ('error' in context) return context.error;
    return Response.json(await chatState(context.db, env, context.access, context.threadId, new URL(request.url).searchParams.get('scope') === 'notifications'), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    await ensureDatabase(env.DB);
    await recordError(env.DB, { requestId, route: '/api/chat', action: 'read', errorCode: error instanceof AppError ? error.code : 'unhandled' });
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let preview: Body = {};
  try {
    preview = await request.json() as Body;
    if (typeof preview.recipientId !== 'string' || !preview.recipientId || !['message', 'approve_action', 'reject_action', 'propose_notification', 'edit_notification', 'clear_history'].includes(preview.action || '')) throw new AppError('invalid_chat_request', 400, 'A recipient and chat action are required');
    const context = await resolveContext(request, preview.recipientId);
    if ('error' in context) return context.error;
    const { db, member, access, threadId } = context;
    const now = new Date().toISOString();
    if (preview.action === 'clear_history') {
      await enforceRateLimit(db, member.id, 'chat_action');
      await db.prepare('DELETE FROM chat_messages WHERE thread_id=?').bind(threadId).run();
      await audit(db, member, 'delete', 'chat', threadId, 'Cleared own saved voice and text conversation');
    } else if (preview.action === 'propose_notification') {
      await enforceRateLimit(db, member.id, 'chat_action');
      if (!canWrite(access.accessRole)) throw new AppError('forbidden', 403, 'Your role cannot prepare notifications.');
      const proposals = await prepareNotifications(db, await effectiveIntegrations(db, env), access.recipientId, preview.notification);
      for (const proposal of proposals) {
        const actionId = await proposeAction(db, threadId, access.recipientId, member, proposal, now);
        await audit(db, member, 'propose', 'chat_action', actionId, proposal.summary);
      }
    } else if (preview.action === 'message') {
      await enforceRateLimit(db, member.id, 'chat_message');
      if (typeof preview.message !== 'string' || preview.message.length > 1200) throw new AppError('invalid_message', 400, 'Enter a message of up to 1200 characters.');
      const message = compact(preview.message, 1200);
      if (!message) throw new AppError('message_required', 400, 'Enter a message');
      const sourceMessageId = await saveMessage(db, threadId, 'user', message, [], null, now);
      const snapshot = await loadCareSnapshot(db, access.recipientId);
      const candidate = memoryCandidate(message);
      let proposal: ProposedAction | null = candidate ? {
        type: 'save_memory', summary: `Save as a verified fact for ${access.recipientName}’s care circle: “${candidate}”`,
        payload: { value: candidate, sourceMessageId, memoryId: crypto.randomUUID() },
      } : propose(message, snapshot, new Date());
      const notificationRequest = parseNotificationRequest(message);
      if (notificationRequest) {
        const members = await rows<{ id: string; display_name: string }>(db, "SELECT c.id,c.display_name FROM care_circle_members c JOIN recipient_members rm ON rm.member_id=c.id WHERE rm.recipient_id=? AND c.status='active'", [access.recipientId]);
        const matches = members.filter((item) => notificationRequest.target.toLowerCase() === 'me' ? item.id === member.memberId : item.display_name.toLowerCase() === notificationRequest.target.toLowerCase() || item.id === notificationRequest.target);
        if (matches.length !== 1) throw new AppError('notification_target_ambiguous', 400, 'Use one exact caregiver name from the care circle, or “me”.');
        proposal = await prepareNotification(db, await effectiveIntegrations(db, env), access.recipientId, { ...notificationRequest, memberId: matches[0].id });
      } else if (/^(?:please\s+)?(?:send\s+)?(?:email|sms|text|push|in-app)\b/i.test(message)) {
        throw new AppError('notification_details_required', 400, 'Use “Email Maya: your message”, “SMS Maya: your message”, or “Push me: your message”. Enable the channel in Notifications first.');
      }
      let actionId: string | null = null;
      let response: { content: string; evidence: ChatEvidence[] };
      let answerSource = 'deterministic fallback';
      if (proposal && canWrite(access.accessRole)) {
        actionId = await proposeAction(db, threadId, access.recipientId, member, proposal, now);
        response = { content: proposal.type === 'save_memory' ? 'Review this suggested fact. Saving confirms it is accurate and shares it with this recipient’s care circle. You can correct or archive it in Trusted facts.' : 'I prepared this action but have not changed anything yet. Review the details and approve it if they are correct.', evidence: [evidence('Proposed tool', proposal.type.replaceAll('_', ' ')), evidence('Safety policy', 'Explicit caregiver approval is required before any chat-initiated write.')] };
      } else if (proposal) {
        response = { content: 'I can explain this change, but your Guest role cannot create or approve care-plan actions. Nothing has been changed.', evidence: [evidence('Requested tool', proposal.type.replaceAll('_', ' ')), evidence('Permission policy', 'Only recipient owners and caregivers may change care-plan records.')] };
      } else if ((message.toLowerCase().includes('reschedule') || /\bmove\b/i.test(message)) && !requestedDate(message, new Date())) {
        response = { content: 'I found the rescheduling request, but I need a date and time—for example, “tomorrow at 3:30 PM.” Nothing has been changed.', evidence: [] };
      } else {
        const llmConfig = await effectiveIntegrations(db, env);
        const grounded = await generateGroundedAnswer(llmConfig, message, access.recipientName, careAgentRecords(snapshot));
        if (grounded) {
          response = grounded.value;
          answerSource = grounded.model;
        } else {
          const recalled = await recallMemory(db, access.recipientId, message);
          response = answer(message, snapshot);
          if (recalled.memories.length) {
            const operational = /summary|handover|review today|conflict|calendar|schedule|upcoming|contact|support|phone|call|medication|medicine|pharmacy|refill|decision|trace/.test(message.toLowerCase());
            response = {
              content: `Relevant verified facts: ${recalled.memories.map((memory) => memory.value).join(' ')}${operational ? ` ${response.content}` : ''}`,
              evidence: [...recalled.memories.map((memory) => evidence('Verified fact', `${memory.value} · ${memory.source}`)), ...(operational ? response.evidence : [])],
            };
          }
        }
      }
      await saveMessage(db, threadId, 'assistant', response.content, response.evidence, actionId, new Date(Date.now() + 1).toISOString());
      await audit(db, member, proposal ? 'propose' : 'answer', 'chat', threadId, proposal?.summary || `Answered with ${answerSource} using ${response.evidence.length} scoped records`);
    } else {
      await enforceRateLimit(db, member.id, 'chat_action');
      if (!canWrite(access.accessRole)) return Response.json({ error: 'Your role cannot approve care-plan changes' }, { status: 403 });
      if (!preview.actionId) throw new AppError('action_required', 400, 'Choose an action request');
      const action = await db.prepare('SELECT * FROM chat_action_requests WHERE id=? AND thread_id=? AND recipient_id=?').bind(preview.actionId, threadId, access.recipientId).first<ActionRow>();
      if (!action) throw new AppError('action_not_found', 404, 'Action request not found');
      if (action.status !== 'pending') throw new AppError('action_already_decided', 409, 'This action was already decided');
      const conversationAction = await db.prepare("SELECT id FROM chat_messages WHERE thread_id=? AND action_request_id=? AND content != 'Review the caregiver, channel, and exact message before approving delivery.' LIMIT 1").bind(threadId, action.id).first();
      if (preview.action === 'edit_notification') {
        if (action.action_type !== 'send_notification') throw new AppError('notification_not_editable', 409, 'Choose a notification draft.');
        const id = await editNotification(db, await effectiveIntegrations(db, env), access.recipientId, member.memberId, action.id, preview.notification);
        await audit(db, member, 'edit', 'chat_action', id, 'Edited an unsent notification draft; fresh approval required.');
      } else if (preview.action === 'reject_action') {
        const rejected = await db.prepare("UPDATE chat_action_requests SET status='rejected',decided_at=? WHERE id=? AND status='pending' AND NOT EXISTS (SELECT 1 FROM notification_deliveries WHERE action_id=?)").bind(now, action.id, action.id).run();
        if (!rejected.meta.changes) throw new AppError('action_already_decided', 409, 'This action was already decided or delivery started.');
        if (conversationAction) await saveMessage(db, threadId, 'assistant', 'Action cancelled. No care-plan data was changed.', [], action.id, now);
        await audit(db, member, 'reject', 'chat_action', action.id, action.summary);
      } else {
        const outcome = await executeAction(db, member, access, action, now);
        if (conversationAction) await saveMessage(db, threadId, 'assistant', outcome, [evidence('Completed tool', action.action_type.replaceAll('_', ' ')), evidence('Audit', 'Approved action and outcome saved to the recipient timeline.')], action.id, new Date(Date.now() + 1).toISOString());
      }
    }
    return Response.json(await chatState(db, env, access, threadId, preview.scope === 'notifications' || preview.action === 'propose_notification' || preview.action === 'edit_notification'), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    await ensureDatabase(env.DB);
    await recordError(env.DB, { requestId, route: '/api/chat', action: preview.action || 'unknown', errorCode: error instanceof AppError ? error.code : 'unhandled', recipientId: preview.recipientId });
    return errorResponse(error, requestId);
  }
}
