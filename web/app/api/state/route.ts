import { env } from 'cloudflare:workers';
import { runCareAgent } from '@/agent/orchestrator';
import { ensureDatabase } from '@/db/bootstrap';
import { canWrite, isOwner, requireMembership, type CareMembership, type CareRole } from '@/lib/auth';
import { runBenchmark } from '@/lib/benchmark';
import type {
  Approval, CareCircleMember, CareEvent, CareTask, DashboardState, MemoryRecord, Risk, Trace,
} from '@/lib/types';

export const runtime = 'edge';

type ActionBody = {
  action?: string;
  id?: string;
  title?: string;
  owner?: string;
  dueAt?: string;
  category?: string;
  status?: string;
  kind?: string;
  value?: string;
  source?: string;
  confidence?: string;
  email?: string;
  displayName?: string;
  role?: CareRole;
};

async function rows<T>(db: D1Database, statement: string) {
  return (await db.prepare(statement).all<T>()).results;
}

async function loadState(db: D1Database, member: CareMembership): Promise<DashboardState> {
  const [risks, tasks, events, memories, approvals, traces, careCircle] = await Promise.all([
    rows<Risk>(db, "SELECT * FROM risks ORDER BY CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, updated_at DESC"),
    rows<CareTask>(db, "SELECT * FROM tasks WHERE status != 'archived' ORDER BY due_at ASC"),
    rows<CareEvent>(db, 'SELECT * FROM events ORDER BY occurred_at DESC'),
    rows<MemoryRecord>(db, "SELECT * FROM memories WHERE status != 'archived' ORDER BY updated_at DESC"),
    rows<Approval>(db, 'SELECT * FROM approvals ORDER BY created_at DESC'),
    rows<Trace>(db, 'SELECT * FROM traces ORDER BY created_at DESC'),
    rows<CareCircleMember>(db, "SELECT id, email, display_name, role, status, updated_at FROM care_circle_members WHERE status != 'archived' ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'caregiver' THEN 2 ELSE 3 END, display_name"),
  ]);
  return {
    risks, tasks, events, memories, approvals, traces, careCircle,
    currentUser: { id: member.id, email: member.email, displayName: member.displayName, role: member.role },
    benchmark: runBenchmark(),
    agentMode: 'deterministic',
  };
}

async function audit(db: D1Database, member: CareMembership, action: string, entityType: string, entityId: string, detail: string) {
  await db.prepare('INSERT INTO audit_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), member.id, member.email, action, entityType, entityId, detail, new Date().toISOString()).run();
}

function forbidden(message = 'Your care-circle role does not allow this action') {
  return Response.json({ error: message }, { status: 403 });
}

const taskStatuses = new Set(['open', 'due_soon', 'assigned', 'scheduled', 'complete']);
const memoryStatuses = new Set(['review_due', 'verified']);
const confidenceLevels = new Set(['low', 'medium', 'high']);
const assignableRoles = new Set(['caregiver', 'viewer']);

export async function GET(request: Request) {
  await ensureDatabase(env.DB);
  const auth = await requireMembership(env.DB, request);
  if ('error' in auth) return auth.error;
  return Response.json(await loadState(env.DB, auth.member));
}

export async function POST(request: Request) {
  const body = (await request.json()) as ActionBody;
  const db = env.DB;
  await ensureDatabase(db);
  const auth = await requireMembership(db, request);
  if ('error' in auth) return auth.error;
  const member = auth.member;
  const now = new Date().toISOString();

  if (body.action === 'approve_plan' && body.id) {
    if (!canWrite(member.role)) return forbidden();
    const approval = await db.prepare('SELECT * FROM approvals WHERE id = ?').bind(body.id).first<Approval>();
    if (!approval) return Response.json({ error: 'Approval not found' }, { status: 404 });
    await db.batch([
      db.prepare('UPDATE approvals SET status = ?, decided_at = ? WHERE id = ?').bind('approved', now, body.id),
      db.prepare('UPDATE risks SET status = ?, updated_at = ? WHERE id = ?').bind('resolved', now, approval.risk_id),
      db.prepare('UPDATE tasks SET owner = ?, status = ? WHERE source_risk_id = ? AND category = ?').bind('Maya', 'assigned', approval.risk_id, 'medication'),
      db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'action', 'Medication plan approved', approval.action, member.displayName, now),
      db.prepare('INSERT INTO traces VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'Caregiver approval', approval.action, 'Assign medication pickup to Maya', 'approved by human', 'responsibility updater', 'Plan recorded', now),
    ]);
    await audit(db, member, 'approve', 'approval', body.id, approval.action);
  } else if (body.action === 'assign_ride') {
    if (!canWrite(member.role)) return forbidden();
    await db.batch([
      db.prepare('UPDATE tasks SET owner = ?, status = ? WHERE id = ?').bind('Maya', 'assigned', 'task-ride'),
      db.prepare('UPDATE risks SET status = ?, updated_at = ? WHERE id = ?').bind('resolved', now, 'risk-ride'),
      db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'transport', 'Physio ride assigned', 'Maya will drive Alex to physiotherapy.', member.displayName, now),
    ]);
    await audit(db, member, 'assign', 'task', 'task-ride', 'Assigned physio ride to Maya');
  } else if (body.action === 'complete_task' && body.id) {
    if (!canWrite(member.role)) return forbidden();
    await db.batch([
      db.prepare('UPDATE tasks SET status = ? WHERE id = ?').bind('complete', body.id),
      db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'task', 'Responsibility completed', `Task ${body.id} was marked complete.`, member.displayName, now),
    ]);
    await audit(db, member, 'complete', 'task', body.id, 'Marked responsibility complete');
  } else if (body.action === 'add_task' && body.title && body.dueAt) {
    if (!canWrite(member.role)) return forbidden();
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, body.title.trim(), body.owner?.trim() || 'Unassigned', body.dueAt, 'open', body.category?.trim() || 'general', null).run();
    await audit(db, member, 'create', 'task', id, body.title.trim());
  } else if (body.action === 'update_task' && body.id && body.title && body.dueAt) {
    if (!canWrite(member.role)) return forbidden();
    if (!taskStatuses.has(body.status || 'open')) return Response.json({ error: 'Invalid responsibility status' }, { status: 400 });
    await db.prepare('UPDATE tasks SET title = ?, owner = ?, due_at = ?, status = ?, category = ? WHERE id = ?')
      .bind(body.title.trim(), body.owner?.trim() || 'Unassigned', body.dueAt, body.status || 'open', body.category?.trim() || 'general', body.id).run();
    await audit(db, member, 'update', 'task', body.id, body.title.trim());
  } else if (body.action === 'archive_task' && body.id) {
    if (!canWrite(member.role)) return forbidden();
    await db.prepare("UPDATE tasks SET status = 'archived' WHERE id = ?").bind(body.id).run();
    await audit(db, member, 'archive', 'task', body.id, 'Archived responsibility');
  } else if (body.action === 'add_memory' && body.value && body.source) {
    if (!canWrite(member.role)) return forbidden();
    if (!confidenceLevels.has(body.confidence || 'medium')) return Response.json({ error: 'Invalid confidence level' }, { status: 400 });
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO memories VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, body.kind?.trim() || 'general', body.value.trim(), body.source.trim(), body.confidence || 'medium', 'review_due', now).run();
    await audit(db, member, 'create', 'memory', id, body.value.trim());
  } else if (body.action === 'update_memory' && body.id && body.value && body.source) {
    if (!canWrite(member.role)) return forbidden();
    if (!confidenceLevels.has(body.confidence || 'medium') || !memoryStatuses.has(body.status || 'review_due')) return Response.json({ error: 'Invalid memory status or confidence' }, { status: 400 });
    await db.prepare('UPDATE memories SET kind = ?, value = ?, source = ?, confidence = ?, status = ?, updated_at = ? WHERE id = ?')
      .bind(body.kind?.trim() || 'general', body.value.trim(), body.source.trim(), body.confidence || 'medium', body.status || 'review_due', now, body.id).run();
    await audit(db, member, 'update', 'memory', body.id, body.value.trim());
  } else if (body.action === 'verify_memory' && body.id) {
    if (!canWrite(member.role)) return forbidden();
    await db.prepare("UPDATE memories SET status = 'verified', updated_at = ? WHERE id = ?").bind(now, body.id).run();
    await audit(db, member, 'verify', 'memory', body.id, 'Verified trusted fact');
  } else if (body.action === 'archive_memory' && body.id) {
    if (!canWrite(member.role)) return forbidden();
    await db.prepare("UPDATE memories SET status = 'archived', updated_at = ? WHERE id = ?").bind(now, body.id).run();
    await audit(db, member, 'archive', 'memory', body.id, 'Archived trusted fact');
  } else if (body.action === 'invite_member' && body.email && body.role) {
    if (!isOwner(member.role)) return forbidden('Only the care-circle owner can invite members');
    if (!assignableRoles.has(body.role)) return Response.json({ error: 'Invalid care-circle role' }, { status: 400 });
    const email = body.email.trim().toLowerCase();
    const existing = await db.prepare('SELECT id FROM care_circle_members WHERE lower(email) = lower(?)').bind(email).first<{ id: string }>();
    if (existing) return Response.json({ error: 'That email is already in the care circle' }, { status: 409 });
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO care_circle_members VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, 'household-demo', null, email, body.displayName?.trim() || email.split('@')[0], body.role, 'invited', now, now).run();
    await audit(db, member, 'invite', 'member', id, `Invited ${email} as ${body.role}`);
  } else if (body.action === 'update_member' && body.id && body.role) {
    if (!isOwner(member.role)) return forbidden('Only the care-circle owner can change roles');
    if (!assignableRoles.has(body.role)) return Response.json({ error: 'Invalid care-circle role' }, { status: 400 });
    const target = await db.prepare('SELECT role FROM care_circle_members WHERE id = ?').bind(body.id).first<{ role: CareRole }>();
    if (!target) return Response.json({ error: 'Member not found' }, { status: 404 });
    if (target.role === 'owner') return forbidden('The owner role cannot be changed here');
    await db.prepare('UPDATE care_circle_members SET role = ?, updated_at = ? WHERE id = ?').bind(body.role, now, body.id).run();
    await audit(db, member, 'change_role', 'member', body.id, `Changed role to ${body.role}`);
  } else if (body.action === 'archive_member' && body.id) {
    if (!isOwner(member.role)) return forbidden('Only the care-circle owner can remove members');
    const target = await db.prepare('SELECT role FROM care_circle_members WHERE id = ?').bind(body.id).first<{ role: CareRole }>();
    if (!target) return Response.json({ error: 'Member not found' }, { status: 404 });
    if (target.role === 'owner') return forbidden('The owner cannot be removed');
    await db.prepare("UPDATE care_circle_members SET status = 'archived', updated_at = ? WHERE id = ?").bind(now, body.id).run();
    await audit(db, member, 'remove', 'member', body.id, 'Removed member from care circle');
  } else if (body.action === 'run_check') {
    if (!canWrite(member.role)) return forbidden();
    const state = await loadState(db, member);
    const { decision } = await runCareAgent(state.tasks, state.events, state.memories);
    await db.batch([
      db.prepare('INSERT INTO traces VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'Manual care-state check', decision.evidence.join(' • '), `${decision.title}: ${decision.recommendation}`, decision.risk === 'high' ? 'human approval required' : 'allowed', 'care-state rules', 'Check completed', now),
      db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'agent', 'Care plan checked', decision.rationale, 'Carestead agent', now),
    ]);
    await audit(db, member, 'run', 'agent', 'care-state', decision.title);
  } else {
    return Response.json({ error: 'Unsupported or incomplete action' }, { status: 400 });
  }

  return Response.json(await loadState(db, member));
}
