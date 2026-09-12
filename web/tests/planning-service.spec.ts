import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { ensureDatabase } from '../db/bootstrap';
import { loadPlanning, planningAction } from '../lib/planning-service';
import { currentMemories } from '../lib/current-memories';
import { extractDrafts, simulateMove } from '../lib/planning-engine';
import { evaluateCareState } from '../lib/risk-engine';
import { nextLocalDate, preferredMove, weekForecast, preparationDrafts } from '../lib/anticipation-engine';
import type { CareMembership } from '../lib/auth';

test('personal capacity and digest settings remain scoped to caregiver and recipient', async () => {
  await act('save_attention', { dailyMinutes: 45, digestHour: 20, focusMode: false });
  expect((await state()).anticipation.settings).toMatchObject({ daily_minutes: 45, digest_hour: 20, focus_mode: false });
  expect((await loadPlanning(db, 'recipient-alex', helper.memberId)).anticipation.settings.daily_minutes).toBe(120);
  expect((await loadPlanning(db, 'recipient-other', owner.memberId)).anticipation.settings.daily_minutes).toBe(120);
  await expect(act('save_attention', { dailyMinutes: -1, digestHour: 25, focusMode: true })).rejects.toThrow(/15–1440/);
});

test('forecast splits overnight care, detects overlaps, and excludes completed work', async () => {
  const current = await state(), base = current.tasks[0];
  const task = { ...base, id: 'night', status: 'open' as const, due_at: '2030-01-01T23:30:00Z', planning: { ...base.planning, owner_member_id: owner.memberId, duration_minutes: 120 } };
  current.tasks = [task, { ...task, id: 'overlap', due_at: '2030-01-02T00:30:00Z', planning: { ...task.planning, duration_minutes: 30 } }, { ...task, id: 'done', status: 'complete' }];
  current.anticipation.settings.daily_minutes = 60;
  const days = weekForecast(current, 'UTC', new Date('2030-01-01T12:00:00Z'));
  expect(days).toHaveLength(7);
  expect(days[0].minutes).toBe(30);
  expect(days[1].minutes).toBe(120);
  expect(days[1].overloaded).toBe(true);
  expect(days[1].collisions).toHaveLength(2);
  expect(days[1].unconfirmed).toHaveLength(2);
});

test('routine approval creates one occurrence, advances the local date, and blocks duplicates', async () => {
  await act('save_routine', { title: 'Weekly supplies', category: 'household', everyDays: 7, nextAt: tomorrow() });
  const initial = await state(), routine = initial.anticipation.routines[0];
  const first = await act('propose_routine', { id: routine.id }) as { proposalId: string };
  const duplicate = await act('propose_routine', { id: routine.id }) as { proposalId: string };
  expect((await state()).tasks).toHaveLength(initial.tasks.length);
  await act('apply_proposal', { id: first.proposalId });
  expect((await state()).tasks).toHaveLength(initial.tasks.length + 1);
  expect((await state()).tasks.find(item => item.title === 'Weekly supplies')?.owner).toBe('Unassigned');
  expect((await state()).anticipation.routines[0].next_at).not.toBe(routine.next_at);
  await expect(act('apply_proposal', { id: duplicate.proposalId })).rejects.toThrow(/plan changed/);
  expect((await state()).tasks).toHaveLength(initial.tasks.length + 1);
});

test('edited and removed routines invalidate pending occurrences', async () => {
  await act('save_routine', { title: 'Supplies', category: 'household', everyDays: 7, nextAt: tomorrow() });
  const routine = (await state()).anticipation.routines[0];
  const first = await act('propose_routine', { id: routine.id }) as { proposalId: string };
  await act('save_routine', { id: routine.id, title: 'Changed supplies', category: 'household', everyDays: 14, nextAt: tomorrow() });
  await expect(act('apply_proposal', { id: first.proposalId })).rejects.toThrow(/plan changed/);
  const second = await act('propose_routine', { id: routine.id }) as { proposalId: string };
  await act('remove_routine', { id: routine.id });
  await expect(act('apply_proposal', { id: second.proposalId })).rejects.toThrow(/plan changed/);
});

test('recurrence preserves local hours across DST and rejects ambiguous dates', () => {
  expect(nextLocalDate('2030-03-09T14:00:00Z', 1, 'America/Toronto')).toBe('2030-03-10T13:00:00.000Z');
  expect(() => nextLocalDate('2030-03-09T07:30:00Z', 1, 'America/Toronto')).toThrow(/clock change/);
});

test('preparation tasks are approval gated, atomic, and reject a changed appointment', async () => {
  await db.prepare("UPDATE tasks SET due_at=? WHERE id='task-physio'").bind(later(tomorrow(), 1440 * 3)).run();
  const before = await state();
  const first = await act('propose_preparation', { taskId: 'task-physio' }) as { proposalId: string };
  const duplicate = await act('propose_preparation', { taskId: 'task-physio' }) as { proposalId: string };
  expect((await state()).tasks).toHaveLength(before.tasks.length);
  await act('apply_proposal', { id: first.proposalId });
  expect((await state()).tasks).toHaveLength(before.tasks.length + 3);
  await expect(act('apply_proposal', { id: duplicate.proposalId })).rejects.toThrow(/plan changed/);
  expect((await state()).tasks).toHaveLength(before.tasks.length + 3);
  await expect(act('propose_preparation', { taskId: 'task-physio' })).rejects.toThrow(/already exist/);
});

test('visit notes are scoped to caregiver and reject unrelated task references', async () => {
  await act('save_appointment_notes', { taskId: 'task-physio', questions: 'Which paperwork?', followUp: 'Call the clinic.' });
  expect((await state()).anticipation.notes[0].questions).toBe('Which paperwork?');
  expect((await loadPlanning(db, 'recipient-alex', helper.memberId)).anticipation.notes).toEqual([]);
  await expect(act('save_appointment_notes', { taskId: 'unrelated-task', questions: 'Private', followUp: '' })).rejects.toThrow(/not found/);
  await expect(act('propose_preparation', { taskId: 'unrelated-task' })).rejects.toThrow(/not found/);
});

test('changed preference sources pause suggestions and block pending preferred moves', async () => {
  await configure(); await availability(owner);
  const original = await state(), memory = original.anticipation.verifiedMemories[0];
  expect(memory).toBeTruthy();
  await act('save_care_preference', { memoryId: memory.id, startHour: 0, endHour: 24 });
  const current = await state(), task = current.tasks.find(item => item.id === 'task-physio')!;
  const dueAt = preferredMove(current, task, 'America/Toronto');
  expect(dueAt).toBeTruthy();
  const proposed = await act('propose_preferred_move', { taskId: task.id, dueAt }) as { proposalId: string };
  await db.prepare('UPDATE memories SET value=? WHERE id=?').bind('Corrected preference', memory.id).run();
  expect((await state()).anticipation.preference).toBeNull();
  expect((await state()).anticipation.preferenceNeedsReview).toBe(true);
  await expect(act('apply_proposal', { id: proposed.proposalId })).rejects.toThrow(/preference changed/);
  await expect(act('save_care_preference', { memoryId: 'unrelated-memory', startHour: 12, endHour: 17 })).rejects.toThrow(/verified fact/);
});

test('forecast coverage does not change ownership until the selected caregiver accepts', async () => {
  await configure(); await availability();
  const proposal = await act('propose_forecast_coverage', { taskId: 'task-physio', memberId: helper.memberId }) as { proposalId: string };
  await act('apply_proposal', { id: proposal.proposalId });
  expect((await state()).tasks.find(item => item.id === 'task-physio')?.owner).toBe('Planner');
  const offer = (await state()).offers[0];
  await act('accept_offer', { id: offer.id }, helper);
  expect((await state()).tasks.find(item => item.id === 'task-physio')).toMatchObject({ owner: 'Helper', accepted: true });
});

test('preparation omits past reminders without claiming they were completed', async () => {
  const task = (await state()).tasks.find(item => item.id === 'task-physio')!;
  task.due_at = '2030-01-02T15:00:00Z';
  const drafts = preparationDrafts(task, 'UTC', new Date('2030-01-02T12:00:00Z'));
  expect(drafts).toHaveLength(1);
  expect(drafts[0].title).toContain('follow-up');
});

function database(sqlite: DatabaseSync): D1Database {
  function statement(sql: string, values: unknown[] = []) {
    return {
      bind: (...params: unknown[]) => statement(sql, params),
      first: async () => sqlite.prepare(sql).get(...values as never[]) || null,
      all: async () => ({ results: sqlite.prepare(sql).all(...values as never[]) }),
      run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...values as never[]).changes) }, success: true }),
    };
  }
  return { prepare: statement, batch: async (statements: { run: () => Promise<unknown> }[]) => {
    sqlite.exec('BEGIN');
    try { const results = []; for (const query of statements) results.push(await query.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
}
let sqlite: DatabaseSync, db: D1Database;
const owner: CareMembership = { id: 'user-planner', memberId: 'planner', displayName: 'Planner', email: 'planner@example.test', role: 'owner', status: 'active' };
const helper: CareMembership = { id: 'user-helper', memberId: 'helper', displayName: 'Helper', email: 'helper@example.test', role: 'caregiver', status: 'active' };
const tomorrow = () => new Date(Date.now() + 86400000).toISOString();
const later = (value: string, minutes: number) => new Date(Date.parse(value) + minutes * 60000).toISOString();
const act = (action: string, body: Record<string, unknown> = {}, member = owner) => planningAction(db, member, 'recipient-alex', { ...body, action });
const state = () => loadPlanning(db, 'recipient-alex', owner.memberId);
async function configure(taskId = 'task-physio', memberId = owner.memberId, dependsOn = '') {
  await act('save_task_details', { taskId, ownerMemberId: memberId, durationMinutes: 20, dependsOn, requirements: [], backupMemberId: helper.memberId });
}
async function availability(member = helper) {
  const start = new Date(Date.now() + 3600000).toISOString();
  await act('save_availability', { start, end: later(start, 60 * 48), categories: ['appointment', 'transport', 'general', 'medication'], capabilities: [] }, member);
}
test.beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:'); db = database(sqlite); await ensureDatabase(db);
  for (const member of [owner, helper]) {
    await db.prepare('INSERT INTO care_circle_members VALUES (?,?,?,?,?,?,?,?,?)').bind(member.memberId, 'household-demo', member.id, member.email, member.displayName, member.role, 'active', tomorrow(), tomorrow()).run();
    await db.prepare('INSERT INTO recipient_members VALUES (?,?,?,?,?)').bind(member.memberId, 'recipient-alex', member.memberId, member.role, tomorrow()).run();
  }
  await db.prepare("UPDATE tasks SET due_at=?,owner='Unassigned'").bind(tomorrow()).run();
});
test.afterEach(() => sqlite.close());

test('break approval requests coverage; only the requested caregiver can accept', async () => {
  await configure(); await availability();
  const start = later(tomorrow(), -30), end = later(start, 120);
  const result = await act('preview_relief', { start, end }) as { proposalId: string };
  expect((await state()).tasks.find((task) => task.id === 'task-physio')).toMatchObject({ owner: 'Planner', accepted: false });
  await act('apply_proposal', { id: result.proposalId });
  let current = await state(); const offer = current.offers[0];
  expect(offer.status).toBe('pending');
  expect(current.tasks.find((task) => task.id === 'task-physio')?.owner).toBe('Planner');
  await expect(act('accept_offer', { id: offer.id })).rejects.toThrow(/No current coverage/);
  await act('accept_offer', { id: offer.id }, helper);
  current = await state();
  expect(current.tasks.find((task) => task.id === 'task-physio')).toMatchObject({ owner: 'Helper', accepted: true });
  await expect(act('accept_offer', { id: offer.id }, helper)).rejects.toThrow(/No current coverage/);
  await db.prepare("UPDATE tasks SET due_at=? WHERE id='task-physio'").bind(later(tomorrow(), 15)).run();
  const changed = await state();
  expect(changed.offers.find((item) => item.id === offer.id)?.status).toBe('stale');
  expect(changed.handover.snapshot.find((entry) => entry.id === `coverage:${offer.id}`)?.detail).toContain('stale');
});

test('changed task and removed availability invalidate pending coverage', async () => {
  await configure(); await availability();
  const result = await act('preview_relief', { start: later(tomorrow(), -30), end: later(tomorrow(), 60) }) as { proposalId: string };
  await db.prepare("UPDATE tasks SET title='Changed appointment' WHERE id='task-physio'").run();
  await expect(act('apply_proposal', { id: result.proposalId })).rejects.toThrow(/responsibility changed/);
  expect((await state()).offers).toHaveLength(0);
  const next = await act('preview_relief', { start: later(tomorrow(), -30), end: later(tomorrow(), 60) }) as { proposalId: string };
  await act('apply_proposal', { id: next.proposalId });
  const current = await state();
  await act('remove_availability', { id: current.availability[0].id }, helper);
  await expect(act('accept_offer', { id: current.offers[0].id }, helper)).rejects.toThrow(/matching availability/);
});

test('one helper is not offered overlapping responsibilities', async () => {
  await configure(); await configure('task-ride'); await availability();
  const result = await act('preview_relief', { start: later(tomorrow(), -30), end: later(tomorrow(), 60) }) as { proposalId: string };
  const proposal = (await state()).proposals.find((p) => p.id === result.proposalId)!;
  expect(proposal.payload.coverage?.filter((item) => item.memberId)).toHaveLength(1);
  expect(proposal.payload.coverage?.filter((item) => !item.memberId)).toHaveLength(1);
});

test('simulation cascades dependency offsets and remains read-only until approval', async () => {
  await configure(); await configure('task-ride', helper.memberId, 'task-physio');
  await db.prepare("UPDATE tasks SET due_at=? WHERE id='task-ride'").bind(later(tomorrow(), -30)).run();
  await availability(owner); await availability(helper);
  const before = await state(), dueAt = later(tomorrow(), 90);
  const preview = await act('simulate', { taskId: 'task-physio', dueAt }) as { simulation: { changes: unknown[]; conflicts: string[] } };
  expect(preview.simulation.changes).toHaveLength(2); expect(preview.simulation.conflicts).toEqual([]);
  expect((await state()).tasks).toEqual(before.tasks);
  const proposal = await act('propose_simulation', { taskId: 'task-physio', dueAt }) as { proposalId: string };
  await act('apply_proposal', { id: proposal.proposalId });
  expect((await state()).tasks.find((task) => task.id === 'task-physio')?.due_at).toBe(dueAt);
  await expect(act('apply_proposal', { id: proposal.proposalId })).rejects.toThrow(/no longer pending/);
});

test('dependency loops and cross-recipient references are rejected', async () => {
  await configure(); await configure('task-ride', helper.memberId, 'task-physio');
  await expect(configure('task-physio', owner.memberId, 'task-ride')).rejects.toThrow(/loop/);
  await expect(configure('another-recipients-task')).rejects.toThrow(/not found/);
  await expect(configure('task-physio', 'unrelated-member')).rejects.toThrow(/active caregiver/);
});

test('micro task claiming requires capabilities and acceptance is invalidated by edits', async () => {
  await configure('task-ride', '');
  await act('save_task_details', { taskId: 'task-ride', ownerMemberId: '', durationMinutes: 20, dependsOn: '', backupMemberId: '', requirements: ['accessible vehicle'] });
  await availability(helper);
  await expect(act('claim_task', { taskId: 'task-ride' }, helper)).rejects.toThrow(/matching availability/);
  await act('save_availability', { start: later(tomorrow(), -30), end: later(tomorrow(), 60), categories: ['transport'], capabilities: ['accessible vehicle'] }, helper);
  await act('claim_task', { taskId: 'task-ride' }, helper);
  expect((await state()).tasks.find((task) => task.id === 'task-ride')?.accepted).toBe(true);
  await db.prepare("UPDATE tasks SET due_at=? WHERE id='task-ride'").bind(later(tomorrow(), 15)).run();
  expect((await state()).tasks.find((task) => task.id === 'task-ride')?.accepted).toBe(false);
});

test('handover snapshots are per caregiver and stale acknowledgement is rejected', async () => {
  const current = await state();
  await act('acknowledge', { snapshot: JSON.stringify(current.handover.snapshot) });
  await db.prepare("UPDATE tasks SET title='Updated responsibility' WHERE id='task-ride'").run();
  const next = await state();
  expect(next.handover.changes.some((change) => change.label === 'Updated responsibility')).toBe(true);
  expect((await loadPlanning(db, 'recipient-alex', helper.memberId)).handover.acknowledgedAt).toBeNull();
  await expect(act('acknowledge', { snapshot: JSON.stringify(current.handover.snapshot) })).rejects.toThrow(/New changes/);
});

test('conflicting and expired facts are withheld from recall; resolution keeps provenance', async () => {
  for (const [id, value] of [['closing-a', 'Closes at 5 PM'], ['closing-b', 'Closes at 6 PM']]) {
    await db.prepare('INSERT INTO memories VALUES (?,?,?,?,?,?,?)').bind(id, 'logistics', value, `Source ${id}`, 'high', 'verified', tomorrow()).run();
    await db.prepare('INSERT INTO record_scopes VALUES (?,?,?,?,?,?)').bind(id, 'memory', id, 'recipient-alex', 'plan-alex', tomorrow()).run();
    await act('describe_fact', { memoryId: id, subject: 'Pharmacy', attribute: 'Closing time', validUntil: '' });
  }
  const conflict = (await state()).conflicts[0];
  expect(conflict.records).toHaveLength(2);
  expect((await currentMemories(db, 'recipient-alex')).some((m) => m.id.startsWith('closing-'))).toBe(false);
  await act('resolve_conflict', { key: conflict.key, memoryId: 'closing-a', source: 'Confirmed with pharmacy by phone' });
  expect((await state()).conflicts).toHaveLength(0);
  expect((await currentMemories(db, 'recipient-alex')).find((m) => m.id === 'closing-a')?.source).toContain('by phone');
  expect(sqlite.prepare("SELECT superseded_by FROM memory_facts WHERE memory_id='closing-b'").get()).toMatchObject({ superseded_by: 'closing-a' });
  await act('describe_fact', { memoryId: 'closing-a', subject: 'Pharmacy', attribute: 'Closing time', validUntil: '2020-01-01T00:00:00Z' });
  expect((await currentMemories(db, 'recipient-alex')).some((m) => m.id === 'closing-a')).toBe(false);
});

test('brain dump exposes ambiguity and applies a reviewed bundle atomically', async () => {
  const current = await state();
  const drafts = extractDrafts('The appointment moved to Friday; confirm pickup tomorrow at 10 AM', current.tasks, 'America/Toronto');
  expect(drafts[0].dueAt).toBe(''); expect(drafts[0].question).toContain('exact date');
  expect(drafts[1].source).toContain('confirm pickup');
  await expect(act('propose_dump', { drafts })).rejects.toThrow(/date and time/);
  const reviewed = drafts.map((draft) => ({ ...draft, dueAt: tomorrow() }));
  const proposal = await act('propose_dump', { drafts: reviewed }) as { proposalId: string };
  expect((await state()).tasks).toHaveLength(current.tasks.length);
  await act('apply_proposal', { id: proposal.proposalId });
  expect((await state()).tasks).toHaveLength(current.tasks.length + 1);
  const second = await act('propose_dump', { drafts: reviewed }) as { proposalId: string };
  await db.prepare("UPDATE tasks SET status='complete' WHERE id='task-physio'").run();
  await expect(act('apply_proposal', { id: second.proposalId })).rejects.toThrow(/not found/);
  expect((await state()).tasks).toHaveLength(current.tasks.length + 1);
});

test('risk evaluation uses deadlines and ignores archived tasks and unverified facts', async () => {
  const tasks = (await state()).tasks;
  const medication = tasks.find((t) => t.category === 'medication')!;
  const futureTask = { ...medication, status: 'open' as const, owner: 'Planner', due_at: '2030-01-01T00:00:00Z' };
  expect(evaluateCareState([futureTask], [], [], new Date('2029-01-01')).risk).toBe('low');
  const nearTask = { ...futureTask, due_at: '2029-01-01T12:00:00Z' };
  expect(evaluateCareState([nearTask], [], [], new Date('2029-01-01')).risk).toBe('high');
  expect(evaluateCareState([{ ...nearTask, status: 'archived' }], [], [], new Date('2029-01-01')).risk).toBe('low');
  const linked = { ...tasks[0], status: 'open' as const, calendarLinked: true };
  expect(simulateMove([linked], [], linked.id, tomorrow(), 'America/Toronto').conflicts.join(' ')).toContain('Calendar');
});

test('a task depending on an unverified fact cannot be accepted or rescheduled', async () => {
  await availability(owner);
  await db.prepare('INSERT INTO memories VALUES (?,?,?,?,?,?,?)').bind('uncertain-hours', 'logistics', 'Pharmacy closes at 5 PM', 'Unconfirmed call', 'low', 'review_due', tomorrow()).run();
  await db.prepare('INSERT INTO record_scopes VALUES (?,?,?,?,?,?)').bind('uncertain-scope', 'memory', 'uncertain-hours', 'recipient-alex', 'plan-alex', tomorrow()).run();
  await act('save_task_details', { taskId: 'task-physio', ownerMemberId: owner.memberId, durationMinutes: 20, dependsOn: '', backupMemberId: '', requirements: [], factIds: ['uncertain-hours'] });
  await expect(act('accept_task', { taskId: 'task-physio' })).rejects.toThrow(/verify the required care fact/);
  await expect(act('propose_simulation', { taskId: 'task-physio', dueAt: later(tomorrow(), 60) })).rejects.toThrow(/Resolve the conflicts/);
  await db.prepare("UPDATE memories SET status='verified' WHERE id='uncertain-hours'").run();
  await act('accept_task', { taskId: 'task-physio' });
  expect((await state()).tasks.find((task) => task.id === 'task-physio')?.accepted).toBe(true);
  await act('describe_fact', { memoryId: 'uncertain-hours', subject: 'Pharmacy', attribute: 'Closing time', validUntil: '2020-01-01T00:00:00Z' });
  expect((await state()).tasks.find((task) => task.id === 'task-physio')?.accepted).toBe(false);
});

test('direct planning reads apply recipient retention to proposals and handovers', async () => {
  const current = await state();
  await act('acknowledge', { snapshot: JSON.stringify(current.handover.snapshot) });
  await act('propose_dump', { drafts: [{ kind: 'create', title: 'Old source', source: 'Retained update', taskId: '', dueAt: tomorrow(), category: 'general' }] });
  await db.prepare("UPDATE handover_checkpoints SET acknowledged_at='2020-01-01T00:00:00Z'").run();
  await db.prepare("UPDATE planning_proposals SET created_at='2020-01-01T00:00:00Z'").run();
  await db.prepare("UPDATE consent_records SET retention_days='30' WHERE recipient_id='recipient-alex'").run();
  const next = await state();
  expect(next.proposals).toHaveLength(0);
  expect(next.handover.acknowledgedAt).toBeNull();
});

test('a new dependency invalidates an already reviewed simulation', async () => {
  await configure(); await availability(owner); await availability(helper);
  const proposal = await act('propose_simulation', { taskId: 'task-physio', dueAt: later(tomorrow(), 90) }) as { proposalId: string };
  await configure('task-ride', helper.memberId, 'task-physio');
  await expect(act('apply_proposal', { id: proposal.proposalId })).rejects.toThrow(/Linked responsibilities changed/);
});
