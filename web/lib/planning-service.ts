import { AppError } from './guardrails';
import { extractCareUpdate, type LlmConfig } from './llm-agent';
import { loadAnticipation } from './anticipation-service';
import {
  coverageSuggestion,
  nextLocalDate,
  preferredMove,
  preparationDrafts,
  preparationKey,
  routineKey,
} from './anticipation-engine';
import type { CareMembership } from './auth';
import type { CareCircleMember, CareTask, MemoryRecord } from './types';
import type {
  Availability,
  CoverageOffer,
  DraftItem,
  FactDraft,
  FactDetails,
  PlannedTask,
  PlanningProposal,
  PlanningState,
  ProposalPayload,
  SnapshotEntry,
  TaskDetails,
} from './planning-types';
import { taskCategories } from './planning-types';
import {
  availableFor,
  extractDrafts,
  handoverDiff,
  isOpen,
  memoryConflicts,
  reliefPlan,
  simulateMove,
  taskSignature,
  taskFactIssues,
} from './planning-engine';

const all = async <T>(db: D1Database, sql: string, args: unknown[] = []) =>
  (
    await db
      .prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;
const text = (
  value: unknown,
  name: string,
  max = 200,
  optional = false,
): string => {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new AppError('invalid_field', 400, `Enter a valid ${name}.`);
  return value.trim();
};
const instant = (value: unknown) => {
  const input = text(value, 'date and time', 50);
  if (
    !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(input) ||
    !Number.isFinite(Date.parse(input))
  )
    throw new AppError(
      'invalid_date',
      400,
      'Enter a date and time with a time zone.',
    );
  return new Date(input).toISOString();
};
const strings = (value: unknown, name: string): string[] => {
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    value.some(
      (item) => typeof item !== 'string' || !item.trim() || item.length > 80,
    )
  )
    throw new AppError('invalid_field', 400, `Choose valid ${name}.`);
  return [...new Set(value.map((item: string) => item.trim().toLowerCase()))];
};
function period(body: Record<string, unknown>) {
  const start = instant(body.start),
    end = instant(body.end);
  if (
    Date.parse(start) < Date.now() - 60000 ||
    Date.parse(end) <= Date.parse(start) ||
    Date.parse(end) - Date.parse(start) > 31 * 86400000
  )
    throw new AppError(
      'invalid_window',
      400,
      'Choose a future window of up to 31 days.',
    );
  return { start, end };
}

export async function loadPlanning(
  db: D1Database,
  recipientId: string,
  memberId: string,
): Promise<PlanningState> {
  const retention = await db
    .prepare('SELECT retention_days FROM consent_records WHERE recipient_id=?')
    .bind(recipientId)
    .first<{ retention_days: string }>();
  const days = Number(retention?.retention_days ?? 0);
  if (days > 0) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    await db.batch([
      db
        .prepare(
          'DELETE FROM planning_proposals WHERE recipient_id=? AND created_at<?',
        )
        .bind(recipientId, cutoff),
      db
        .prepare(
          'DELETE FROM coverage_offers WHERE recipient_id=? AND created_at<?',
        )
        .bind(recipientId, cutoff),
      db
        .prepare(
          'DELETE FROM handover_checkpoints WHERE recipient_id=? AND acknowledged_at<?',
        )
        .bind(recipientId, cutoff),
      db
        .prepare(
          'DELETE FROM caregiver_availability WHERE recipient_id=? AND end_at<?',
        )
        .bind(recipientId, cutoff),
    ]);
  }
  const scoped = (table: string, kind: string) =>
    `SELECT t.* FROM ${table} t JOIN record_scopes s ON s.entity_id=t.id AND s.entity_type='${kind}' WHERE s.recipient_id=?`;
  const [
    rawTasks,
    members,
    details,
    windows,
    rawMemories,
    facts,
    proposals,
    offers,
    checkpoint,
    linked,
    profiles,
    risks,
    contacts,
  ] = await Promise.all([
    all<CareTask>(
      db,
      scoped('tasks', 'task') + " AND t.status!='archived' ORDER BY t.due_at",
      [recipientId],
    ),
    all<CareCircleMember>(
      db,
      "SELECT c.id,c.display_name,c.email,c.status,c.updated_at,rm.access_role role FROM recipient_members rm JOIN care_circle_members c ON c.id=rm.member_id WHERE rm.recipient_id=? AND c.status='active' ORDER BY c.display_name",
      [recipientId],
    ),
    all<Omit<TaskDetails, 'requirements'> & { requirements_json: string }>(
      db,
      'SELECT * FROM task_planning WHERE recipient_id=?',
      [recipientId],
    ),
    all<
      Omit<Availability, 'categories' | 'capabilities'> & {
        categories_json: string;
        capabilities_json: string;
      }
    >(
      db,
      'SELECT * FROM caregiver_availability WHERE recipient_id=? AND end_at>? ORDER BY start_at',
      [recipientId, new Date().toISOString()],
    ),
    all<MemoryRecord>(
      db,
      scoped('memories', 'memory') + " AND t.status!='archived'",
      [recipientId],
    ),
    all<FactDetails>(db, 'SELECT * FROM memory_facts WHERE recipient_id=?', [
      recipientId,
    ]),
    all<Omit<PlanningProposal, 'payload'> & { payload_json: string }>(
      db,
      'SELECT * FROM planning_proposals WHERE recipient_id=? ORDER BY created_at DESC',
      [recipientId],
    ),
    all<CoverageOffer>(
      db,
      'SELECT * FROM coverage_offers WHERE recipient_id=? ORDER BY created_at DESC',
      [recipientId],
    ),
    db
      .prepare(
        'SELECT snapshot_json,acknowledged_at FROM handover_checkpoints WHERE recipient_id=? AND member_id=?',
      )
      .bind(recipientId, memberId)
      .first<{ snapshot_json: string; acknowledged_at: string }>(),
    all<{ task_id: string }>(
      db,
      "SELECT task_id FROM calendar_appointments WHERE recipient_id=? AND status='confirmed'",
      [recipientId],
    ),
    all<Record<string, string>>(
      db,
      'SELECT * FROM recipient_profiles WHERE recipient_id=?',
      [recipientId],
    ),
    all<{ id: string; title: string; detail: string; status: string }>(
      db,
      scoped('risks', 'risk'),
      [recipientId],
    ),
    all<{
      id: string;
      name: string;
      relationship: string;
      phone: string;
      email: string;
      notes: string;
    }>(
      db,
      "SELECT * FROM support_contacts WHERE recipient_id=? AND status='active'",
      [recipientId],
    ),
  ]);
  const tasks: PlannedTask[] = rawTasks.map((task) => {
    const saved = details.find((item) => item.task_id === task.id);
    const matching = members.filter(
      (member) =>
        member.display_name === task.owner && member.role !== 'viewer',
    );
    // Never guess between two people with the same display name.
    const namedOwner = matching.length === 1 ? matching[0].id : '';
    const savedOwner = members.find(
      (member) =>
        member.id === saved?.owner_member_id &&
        member.display_name === task.owner &&
        member.role !== 'viewer',
    );
    const planning: TaskDetails = {
      task_id: task.id,
      recipient_id: recipientId,
      owner_member_id: savedOwner?.id ?? namedOwner,
      duration_minutes: saved?.duration_minutes ?? 20,
      depends_on: saved?.depends_on ?? '',
      backup_member_id: saved?.backup_member_id ?? '',
      requirements: saved
        ? Array.isArray(JSON.parse(saved.requirements_json))
          ? JSON.parse(saved.requirements_json)
          : JSON.parse(saved.requirements_json).capabilities
        : [],
      fact_ids:
        saved && !Array.isArray(JSON.parse(saved.requirements_json))
          ? (JSON.parse(saved.requirements_json).factIds ?? [])
          : [],
      accepted_signature: saved?.accepted_signature ?? '',
    };
    const result = {
      ...task,
      planning,
      accepted: false,
      calendarLinked: linked.some((item) => item.task_id === task.id),
    };
    result.accepted =
      Boolean(planning.owner_member_id) &&
      planning.accepted_signature === taskSignature(result);
    return result;
  });
  const memories = rawMemories.map((memory) => ({
    ...memory,
    fact: facts.find((fact) => fact.memory_id === memory.id) ?? null,
  }));
  for (const task of tasks)
    if (taskFactIssues(task, memories).length) task.accepted = false;
  const liveProposals: PlanningProposal[] = proposals.map((item) => ({
    ...item,
    payload: JSON.parse(item.payload_json),
  }));
  const seenSimulationSignatures = new Set<string>();
  const retiredProposalIds: string[] = [];
  // Proposals are loaded newest-first. Keep the newest actionable copy so the
  // first approval card a caregiver sees remains the one they can apply.
  for (const proposal of liveProposals) {
    if (proposal.status !== 'pending' || proposal.kind !== 'simulation')
      continue;
    const stale = proposal.payload.baseline.some((before) => {
      const current = tasks.find((task) => task.id === before.id);
      return (
        !current ||
        current.status !== before.status ||
        taskSignature(current) !== taskSignature(before)
      );
    });
    const signature = JSON.stringify([
      proposal.payload.rootTaskId,
      proposal.payload.changes ?? [],
    ]);
    if (stale || seenSimulationSignatures.has(signature)) {
      proposal.status = 'rejected';
      retiredProposalIds.push(proposal.id);
    } else seenSimulationSignatures.add(signature);
  }
  if (retiredProposalIds.length)
    await db.batch(
      retiredProposalIds.map((id) =>
        db
          .prepare(
            "UPDATE planning_proposals SET status='rejected' WHERE id=? AND recipient_id=? AND status='pending'",
          )
          .bind(id, recipientId),
      ),
    );
  const liveOffers: CoverageOffer[] = offers.map((offer) => {
    const task = tasks.find((t) => t.id === offer.task_id);
    return {
      ...offer,
      status:
        (offer.status === 'accepted' &&
          (!task?.accepted ||
            task.planning.owner_member_id !== offer.member_id)) ||
        (offer.status === 'pending' &&
          (!task ||
            !isOpen(task) ||
            taskSignature(task) !== offer.signature ||
            Date.parse(task.due_at) < Date.now()))
          ? 'stale'
          : offer.status,
    };
  });
  const snapshot: SnapshotEntry[] = [
    ...liveOffers.map((offer) => ({
      id: `coverage:${offer.id}`,
      label:
        tasks.find((task) => task.id === offer.task_id)?.title ??
        'Coverage request',
      kind: 'Coverage request',
      detail: `${members.find((member) => member.id === offer.member_id)?.display_name ?? 'Caregiver'} · ${offer.status}`,
    })),
    ...tasks.map((task) => ({
      id: `task:${task.id}`,
      label: task.title,
      kind: 'Responsibility',
      detail: `${task.due_at} · ${task.owner} · ${task.status} · ${task.accepted ? 'accepted' : 'not confirmed'} · ${task.planning.duration_minutes} minutes`,
    })),
    ...memories.map((memory) => ({
      id: `memory:${memory.id}`,
      label: memory.fact
        ? `${memory.fact.subject} / ${memory.fact.attribute}`
        : memory.kind,
      kind: 'Care fact',
      detail: `${memory.value} · ${memory.source} · ${memory.status}${memory.fact?.valid_until ? ` · valid until ${memory.fact.valid_until}` : ''}`,
    })),
    ...risks.map((risk) => ({
      id: `risk:${risk.id}`,
      label: risk.title,
      kind: 'Review priority',
      detail: `${risk.detail} · ${risk.status}`,
    })),
    ...contacts.map((contact) => ({
      id: `contact:${contact.id}`,
      label: contact.name,
      kind: 'Support contact',
      detail: `${contact.relationship} · ${contact.phone} · ${contact.email} · ${contact.notes}`,
    })),
    ...Object.entries(profiles[0] ?? {})
      .filter(([key]) => !['recipient_id', 'updated_at'].includes(key))
      .map(([key, value]) => ({
        id: `profile:${key}`,
        label: key.replaceAll('_', ' '),
        kind: 'Profile',
        detail: value,
      })),
  ];
  return {
    anticipation: await loadAnticipation(db, recipientId, memberId),
    memberId,
    tasks,
    members,
    memories,
    availability: windows.map((item) => ({
      ...item,
      categories: JSON.parse(item.categories_json),
      capabilities: JSON.parse(item.capabilities_json),
    })),
    conflicts: memoryConflicts(memories),
    proposals: liveProposals,
    offers: liveOffers,
    handover: {
      acknowledgedAt: checkpoint?.acknowledged_at ?? null,
      snapshot,
      changes: checkpoint
        ? handoverDiff(JSON.parse(checkpoint.snapshot_json), snapshot)
        : [],
    },
  };
}

function saveDetails(db: D1Database, task: PlannedTask) {
  const p = task.planning;
  return db
    .prepare(
      'INSERT INTO task_planning VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET owner_member_id=excluded.owner_member_id,duration_minutes=excluded.duration_minutes,depends_on=excluded.depends_on,backup_member_id=excluded.backup_member_id,requirements_json=excluded.requirements_json,accepted_signature=excluded.accepted_signature',
    )
    .bind(
      task.id,
      p.recipient_id,
      p.owner_member_id,
      p.duration_minutes,
      p.depends_on,
      p.backup_member_id,
      JSON.stringify({
        capabilities: p.requirements,
        factIds: p.fact_ids ?? [],
      }),
      p.accepted_signature,
    );
}
function assertTask(db: D1Database, task: PlannedTask) {
  return db
    .prepare(
      'INSERT INTO planning_guards SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM tasks WHERE id=? AND title=? AND owner=? AND due_at=? AND status=?) THEN 1 ELSE 0 END',
    )
    .bind(
      crypto.randomUUID(),
      task.id,
      task.title,
      task.owner,
      task.due_at,
      task.status,
    );
}
function guard(db: D1Database, sql: string, args: unknown[]) {
  return db
    .prepare(
      `INSERT INTO planning_guards SELECT ?,CASE WHEN EXISTS(${sql}) THEN 1 ELSE 0 END`,
    )
    .bind(crypto.randomUUID(), ...args);
}
async function commit(db: D1Database, statements: D1PreparedStatement[]) {
  try {
    await db.batch([...statements, db.prepare('DELETE FROM planning_guards')]);
  } catch (error) {
    if (
      String(error).includes('constraint') ||
      String(error).includes('CHECK') ||
      String(error).includes('UNIQUE')
    )
      throw new AppError(
        'stale_plan',
        409,
        'The plan changed while you were reviewing it. Refresh and prepare a new proposal.',
      );
    throw error;
  }
}

export async function planningAction(
  db: D1Database,
  member: CareMembership,
  recipientId: string,
  body: Record<string, unknown>,
  modelConfig: LlmConfig = {},
) {
  const state = await loadPlanning(db, recipientId, member.memberId);
  const now = new Date().toISOString();
  const recipient = await db
    .prepare('SELECT timezone FROM care_recipients WHERE id=?')
    .bind(recipientId)
    .first<{ timezone: string }>();
  const plan = await db
    .prepare(
      "SELECT id FROM care_plans WHERE recipient_id=? AND status='active'",
    )
    .bind(recipientId)
    .first<{ id: string }>();
  if (!plan || !recipient)
    throw new AppError('missing_plan', 404, 'Care plan not found.');
  const scope = (kind: string, id: string) =>
    db
      .prepare('INSERT INTO record_scopes VALUES (?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), kind, id, recipientId, plan.id, now);
  const taskFor = (id: unknown) => {
    const task = state.tasks.find((t) => t.id === id && isOpen(t));
    if (!task)
      throw new AppError(
        'missing_task',
        404,
        'Open responsibility not found in this care plan.',
      );
    return task;
  };
  const memberFor = (id: unknown) => {
    const target = state.members.find(
      (m) => m.id === id && m.role !== 'viewer',
    );
    if (!target)
      throw new AppError(
        'missing_member',
        400,
        'Choose an active caregiver in this care circle.',
      );
    return target;
  };
  const reviewedDrafts = (value: unknown, optional = false): DraftItem[] => {
    if (
      !Array.isArray(value) ||
      value.length > 12 ||
      (!optional && value.length < 1)
    )
      throw new AppError(
        'invalid_drafts',
        400,
        optional
          ? 'Review up to 12 draft items.'
          : 'Review between 1 and 12 draft items.',
      );
    const drafts = value.map((raw: unknown) => {
      if (!raw || typeof raw !== 'object')
        throw new AppError('invalid_draft', 400, 'Review each draft.');
      const item = raw as Record<string, unknown>;
      if (!['create', 'reschedule'].includes(String(item.kind)))
        throw new AppError(
          'invalid_kind',
          400,
          'Choose a supported draft action.',
        );
      const kind = item.kind as DraftItem['kind'],
        task = kind === 'reschedule' ? taskFor(item.taskId) : null;
      if (task?.calendarLinked)
        throw new AppError(
          'linked_calendar_task',
          409,
          'Use Calendar to reschedule connected appointments.',
        );
      const dueAt = instant(item.dueAt);
      if (Date.parse(dueAt) <= Date.now())
        throw new AppError(
          'past_date',
          400,
          'Confirm a future date and time for every draft.',
        );
      return {
        kind,
        taskId: task?.id ?? '',
        title: text(item.title, 'task title'),
        dueAt,
        category:
          task?.category ??
          (taskCategories.includes(
            item.category as (typeof taskCategories)[number],
          )
            ? String(item.category)
            : 'general'),
        source: text(item.source, 'source text', 4000),
        question: '',
      };
    });
    const ids = drafts
      .filter((draft) => draft.taskId)
      .map((draft) => draft.taskId);
    if (new Set(ids).size !== ids.length)
      throw new AppError(
        'duplicate_task',
        400,
        'Keep only one change for each appointment.',
      );
    return drafts;
  };
  const audit = (title: string, detail: string): D1PreparedStatement[] => {
    const eventId = crypto.randomUUID(),
      traceId = crypto.randomUUID();
    return [
      db
        .prepare('INSERT INTO audit_entries VALUES (?,?,?,?,?,?,?,?)')
        .bind(
          crypto.randomUUID(),
          member.id,
          member.email,
          String(body.action),
          'recipient',
          recipientId,
          title,
          now,
        ),
      db
        .prepare('INSERT INTO events VALUES (?,?,?,?,?,?)')
        .bind(eventId, 'coordination', title, detail, member.displayName, now),
      scope('event', eventId),
      db
        .prepare('INSERT INTO traces VALUES (?,?,?,?,?,?,?,?)')
        .bind(
          traceId,
          title,
          detail,
          title,
          'reviewed by caregiver',
          'care planning',
          'Recorded',
          now,
        ),
      scope('trace', traceId),
    ];
  };
  const propose = async (
    kind: PlanningProposal['kind'],
    payload: ProposalPayload,
  ) => {
    const id = crypto.randomUUID();
    await commit(db, [
      db
        .prepare('INSERT INTO planning_proposals VALUES (?,?,?,?,?,?,?)')
        .bind(
          id,
          recipientId,
          member.memberId,
          kind,
          'pending',
          JSON.stringify(payload),
          now,
        ),
      ...audit('Plan prepared for review', payload.title),
    ]);
    return { proposalId: id };
  };

  switch (body.action) {
    case 'propose_preferred_move': {
      const task = taskFor(body.taskId),
        dueAt = preferredMove(state, task, recipient.timezone);
      if (!dueAt || dueAt !== body.dueAt || !state.anticipation.preference)
        throw new AppError(
          'preference_changed',
          409,
          'The preference or schedule changed. Review the refreshed suggestion.',
        );
      const simulation = simulateMove(
        state.tasks,
        state.availability,
        task.id,
        dueAt,
        recipient.timezone,
      );
      return propose('simulation', {
        rootTaskId: task.id,
        title: `Preferred visit time: ${task.title}`,
        preferenceEvidence: state.anticipation.preference,
        changes: simulation.changes,
        baseline: state.tasks.filter((item) =>
          simulation.changes.some((change) => change.taskId === item.id),
        ),
      });
    }
    case 'save_attention': {
      const daily = Number(body.dailyMinutes),
        hour = Number(body.digestHour);
      if (
        !Number.isInteger(daily) ||
        daily < 15 ||
        daily > 1440 ||
        !Number.isInteger(hour) ||
        hour < 0 ||
        hour > 23 ||
        typeof body.focusMode !== 'boolean'
      )
        throw new AppError(
          'invalid_preferences',
          400,
          'Choose 15–1440 minutes per day and a digest hour from 0–23.',
        );
      await commit(db, [
        db
          .prepare(
            'INSERT INTO attention_settings VALUES (?,?,?,?,?) ON CONFLICT(recipient_id,member_id) DO UPDATE SET daily_minutes=excluded.daily_minutes,digest_hour=excluded.digest_hour,focus_mode=excluded.focus_mode',
          )
          .bind(
            recipientId,
            member.memberId,
            daily,
            hour,
            Number(body.focusMode),
          ),
        ...audit(
          'Personal planning preferences updated',
          'Daily care capacity and in-app digest preferences saved.',
        ),
      ]);
      break;
    }
    case 'save_care_preference': {
      if (body.memoryId === '') {
        await commit(db, [
          db
            .prepare('DELETE FROM care_preferences WHERE recipient_id=?')
            .bind(recipientId),
          ...audit(
            'Visit preference cleared',
            'Scheduling suggestions no longer use a preferred visit window.',
          ),
        ]);
        break;
      }
      const memory = state.anticipation.verifiedMemories.find(
        (item) => item.id === body.memoryId,
      );
      const start = Number(body.startHour),
        end = Number(body.endHour);
      if (
        !memory ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end > 24 ||
        start >= end
      )
        throw new AppError(
          'invalid_preference',
          400,
          'Choose a current verified fact and a valid visit window.',
        );
      await commit(db, [
        db
          .prepare(
            'INSERT INTO care_preferences VALUES (?,?,?,?,?) ON CONFLICT(recipient_id) DO UPDATE SET memory_id=excluded.memory_id,memory_value=excluded.memory_value,start_hour=excluded.start_hour,end_hour=excluded.end_hour',
          )
          .bind(recipientId, memory.id, memory.value, start, end),
        ...audit(
          'Visit preference confirmed',
          `Use ${start}:00–${end}:00 for visit suggestions. Source: ${memory.id}`,
        ),
      ]);
      break;
    }
    case 'save_routine': {
      const days = Number(body.everyDays),
        nextAt = instant(body.nextAt),
        title = text(body.title, 'routine title');
      if (
        !Number.isInteger(days) ||
        days < 1 ||
        days > 365 ||
        Date.parse(nextAt) <= Date.now() ||
        !taskCategories.includes(
          body.category as (typeof taskCategories)[number],
        )
      )
        throw new AppError(
          'invalid_routine',
          400,
          'Choose a future start, task category, and interval of 1–365 days.',
        );
      const id = body.id ? text(body.id, 'routine') : crypto.randomUUID();
      if (
        body.id &&
        !state.anticipation.routines.some((item) => item.id === id)
      )
        throw new AppError(
          'missing_routine',
          404,
          'Routine not found in this care plan.',
        );
      await commit(db, [
        db
          .prepare(
            'INSERT INTO care_routines VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,every_days=excluded.every_days,next_at=excluded.next_at,updated_at=excluded.updated_at',
          )
          .bind(
            id,
            recipientId,
            title,
            body.category,
            days,
            nextAt,
            crypto.randomUUID(),
          ),
        ...audit(
          'Care routine saved',
          `${title}: every ${days} days. Each occurrence requires review.`,
        ),
      ]);
      break;
    }
    case 'remove_routine': {
      await commit(db, [
        db
          .prepare('DELETE FROM care_routines WHERE id=? AND recipient_id=?')
          .bind(text(body.id, 'routine'), recipientId),
        ...audit(
          'Care routine removed',
          'Existing responsibilities remain available for review.',
        ),
      ]);
      break;
    }
    case 'propose_routine': {
      const routine = state.anticipation.routines.find(
        (item) => item.id === body.id,
      );
      if (!routine)
        throw new AppError('missing_routine', 404, 'Routine not found.');
      if (Date.parse(routine.next_at) <= Date.now())
        throw new AppError(
          'past_routine',
          409,
          'Update this routine’s next date before preparing it.',
        );
      return propose('dump', {
        title: `Next occurrence: ${routine.title}`,
        baseline: [],
        generated: {
          key: routineKey(routine),
          routineId: routine.id,
          revision: routine.updated_at,
          nextAt: nextLocalDate(
            routine.next_at,
            routine.every_days,
            recipient.timezone,
          ),
        },
        drafts: [
          {
            kind: 'create',
            taskId: '',
            title: routine.title,
            category: routine.category,
            dueAt: routine.next_at,
            source: `Reviewed routine: every ${routine.every_days} days.`,
            question: '',
          },
        ],
      });
    }
    case 'propose_preparation': {
      const task = taskFor(body.taskId);
      if (task.category !== 'appointment')
        throw new AppError('not_appointment', 400, 'Choose an appointment.');
      const key = preparationKey(task);
      if (state.anticipation.generatedKeys.includes(key))
        throw new AppError(
          'already_prepared',
          409,
          'Preparation tasks already exist for this appointment plan.',
        );
      const drafts = preparationDrafts(task, recipient.timezone);
      if (!drafts.length)
        throw new AppError(
          'no_preparation',
          400,
          'This appointment has no future preparation or follow-up dates.',
        );
      return propose('dump', {
        title: `Prepare for ${task.title}`,
        preparationFor: task.id,
        baseline: [task],
        generated: { key },
        drafts,
      });
    }
    case 'save_appointment_notes': {
      const task = state.tasks.find(
        (item) => item.id === body.taskId && item.category === 'appointment',
      );
      if (!task)
        throw new AppError(
          'missing_appointment',
          404,
          'Appointment not found.',
        );
      await commit(db, [
        db
          .prepare(
            'INSERT INTO appointment_notes VALUES (?,?,?,?,?) ON CONFLICT(recipient_id,member_id,task_id) DO UPDATE SET questions=excluded.questions,follow_up=excluded.follow_up',
          )
          .bind(
            recipientId,
            member.memberId,
            task.id,
            text(body.questions, 'questions', 4000, true),
            text(body.followUp, 'follow-up notes', 4000, true),
          ),
        ...audit(
          'Appointment notes saved',
          'Personal questions and follow-up notes updated.',
        ),
      ]);
      break;
    }
    case 'propose_forecast_coverage': {
      const task = taskFor(body.taskId),
        candidate = coverageSuggestion(state, task);
      if (
        !candidate ||
        candidate.id !== body.memberId ||
        Date.parse(task.due_at) <= Date.now()
      )
        throw new AppError(
          'coverage_changed',
          409,
          'Coverage options changed. Review the refreshed forecast.',
        );
      return propose('relief', {
        title: `Coverage for ${task.title}`,
        start: task.due_at,
        end: new Date(
          Date.parse(task.due_at) + task.planning.duration_minutes * 60000,
        ).toISOString(),
        baseline: [task],
        coverage: [
          {
            taskId: task.id,
            memberId: candidate.id,
            reason: `${candidate.display_name} has matching availability and task capabilities. Acceptance is still required.`,
          },
        ],
      });
    }
    case 'acknowledge': {
      // Acknowledge exactly the snapshot the user saw, never silently include newer changes.
      if (body.snapshot !== JSON.stringify(state.handover.snapshot))
        throw new AppError(
          'handover_changed',
          409,
          'New changes arrived. Review the refreshed handover before acknowledging.',
        );
      await db
        .prepare(
          'INSERT INTO handover_checkpoints VALUES (?,?,?,?) ON CONFLICT(recipient_id,member_id) DO UPDATE SET snapshot_json=excluded.snapshot_json,acknowledged_at=excluded.acknowledged_at',
        )
        .bind(
          recipientId,
          member.memberId,
          JSON.stringify(state.handover.snapshot),
          now,
        )
        .run();
      break;
    }
    case 'save_availability': {
      const { start, end } = period(body);
      const categories = strings(body.categories, 'task categories'),
        capabilities = strings(body.capabilities ?? [], 'capabilities');
      if (
        !categories.length ||
        categories.some(
          (category) =>
            !taskCategories.includes(
              category as (typeof taskCategories)[number],
            ),
        )
      )
        throw new AppError(
          'invalid_categories',
          400,
          'Choose at least one supported task category.',
        );
      await commit(db, [
        db
          .prepare('INSERT INTO caregiver_availability VALUES (?,?,?,?,?,?,?)')
          .bind(
            crypto.randomUUID(),
            recipientId,
            member.memberId,
            start,
            end,
            JSON.stringify(categories),
            JSON.stringify(capabilities),
          ),
        ...audit(
          'Availability shared',
          `${member.displayName}: ${start} to ${end}`,
        ),
      ]);
      break;
    }
    case 'remove_availability': {
      await commit(db, [
        guard(
          db,
          'SELECT 1 FROM caregiver_availability WHERE id=? AND recipient_id=? AND member_id=?',
          [text(body.id, 'availability'), recipientId, member.memberId],
        ),
        db
          .prepare(
            'DELETE FROM caregiver_availability WHERE id=? AND recipient_id=? AND member_id=?',
          )
          .bind(body.id, recipientId, member.memberId),
        ...audit('Availability removed', member.displayName),
      ]);
      break;
    }
    case 'save_task_details': {
      const task = taskFor(body.taskId),
        owner = body.ownerMemberId ? memberFor(body.ownerMemberId) : null;
      const duration = Number(body.durationMinutes);
      if (!Number.isInteger(duration) || duration < 5 || duration > 480)
        throw new AppError(
          'invalid_duration',
          400,
          'Task duration must be 5–480 minutes.',
        );
      const dependsOn = text(body.dependsOn, 'dependency', 100, true),
        backup = text(body.backupMemberId, 'backup', 100, true);
      if (backup) memberFor(backup);
      if (dependsOn) {
        let next = taskFor(dependsOn);
        const seen = new Set([task.id]);
        while (next) {
          if (seen.has(next.id))
            throw new AppError(
              'dependency_cycle',
              400,
              'Dependencies cannot form a loop.',
            );
          seen.add(next.id);
          if (!next.planning.depends_on) break;
          next = taskFor(next.planning.depends_on);
        }
      }
      const updated: PlannedTask = {
        ...task,
        owner: owner?.display_name ?? 'Unassigned',
        planning: {
          ...task.planning,
          owner_member_id: owner?.id ?? '',
          duration_minutes: duration,
          depends_on: dependsOn,
          backup_member_id: backup,
          requirements: strings(body.requirements ?? [], 'task requirements'),
          fact_ids: strings(body.factIds ?? [], 'required facts'),
        },
      };
      if (
        updated.planning.fact_ids?.some(
          (id) => !state.memories.some((memory) => memory.id === id),
        )
      )
        throw new AppError(
          'invalid_fact',
          400,
          'Choose care facts from this recipient.',
        );
      if (taskSignature(updated) !== taskSignature(task))
        updated.planning.accepted_signature = '';
      await commit(db, [
        assertTask(db, task),
        db
          .prepare('UPDATE tasks SET owner=? WHERE id=?')
          .bind(updated.owner, task.id),
        saveDetails(db, updated),
        ...audit('Responsibility planning updated', task.title),
      ]);
      break;
    }
    case 'preview_relief': {
      const { start, end } = period(body);
      const coverage = reliefPlan(
        state.tasks,
        state.members,
        state.availability,
        member.memberId,
        start,
        end,
      );
      for (const item of coverage) {
        const issues = taskFactIssues(taskFor(item.taskId), state.memories);
        if (issues.length) {
          item.memberId = '';
          item.reason = issues.join(' ');
        }
      }
      if (!coverage.length)
        throw new AppError(
          'no_tasks',
          400,
          'You have no assigned responsibilities in this window. Assign your responsibilities in Task planning first.',
        );
      return propose('relief', {
        title: `${member.displayName} needs a break`,
        start,
        end,
        coverage,
        baseline: state.tasks.filter((task) =>
          coverage.some((item) => item.taskId === task.id),
        ),
        handover: state.handover.snapshot,
      });
    }
    case 'simulate':
    case 'propose_simulation': {
      const task = taskFor(body.taskId),
        dueAt = instant(body.dueAt);
      if (Date.parse(dueAt) < Date.now())
        throw new AppError('past_date', 400, 'Choose a future time.');
      const simulation = simulateMove(
        state.tasks,
        state.availability,
        task.id,
        dueAt,
        recipient.timezone,
      );
      simulation.conflicts.push(
        ...simulation.changes.flatMap((change) =>
          taskFactIssues(taskFor(change.taskId), state.memories),
        ),
      );
      if (body.action === 'simulate') return { simulation };
      if (simulation.conflicts.length)
        throw new AppError(
          'simulation_conflicts',
          409,
          'Resolve the conflicts before preparing this change. Connected appointments must be changed in Calendar.',
        );
      const payload: ProposalPayload = {
        rootTaskId: task.id,
        title: `Move ${task.title}`,
        changes: simulation.changes,
        baseline: state.tasks.filter((task) =>
          simulation.changes.some((change) => change.taskId === task.id),
        ),
      };
      const existing = state.proposals.find(
        (proposal) =>
          proposal.status === 'pending' &&
          proposal.kind === 'simulation' &&
          proposal.payload.rootTaskId === task.id &&
          JSON.stringify(proposal.payload.changes) ===
            JSON.stringify(payload.changes),
      );
      return existing
        ? { proposalId: existing.id, reused: true }
        : propose('simulation', payload);
    }
    case 'extract': {
      const message = text(body.message, 'update', 4000);
      const generated = await extractCareUpdate(
        modelConfig,
        message,
        state.tasks,
        recipient.timezone,
      );
      return {
        drafts:
          generated?.value ??
          extractDrafts(message, state.tasks, recipient.timezone),
        agentMode: generated ? 'model' : 'deterministic',
        model: generated?.model,
      };
    }
    case 'propose_dump': {
      const drafts = reviewedDrafts(body.drafts);
      const ids = drafts.filter((d) => d.taskId).map((d) => d.taskId);
      return propose('dump', {
        title: `Review ${drafts.length} items from your update`,
        drafts,
        baseline: state.tasks.filter((task) => ids.includes(task.id)),
        sourceMode: body.sourceMode === 'model' ? 'model' : 'deterministic',
      });
    }
    case 'propose_intake': {
      const drafts = reviewedDrafts(body.drafts ?? [], true);
      if (!Array.isArray(body.facts) || body.facts.length > 10)
        throw new AppError(
          'invalid_facts',
          400,
          'Review up to 10 extracted facts.',
        );
      const facts: FactDraft[] = body.facts.map((raw: unknown) => {
        if (!raw || typeof raw !== 'object')
          throw new AppError(
            'invalid_fact',
            400,
            'Review each extracted fact.',
          );
        const item = raw as Record<string, unknown>;
        const confidence = String(item.confidence);
        if (!['high', 'medium', 'low'].includes(confidence))
          throw new AppError(
            'invalid_confidence',
            400,
            'Choose a valid confidence for every fact.',
          );
        return {
          kind: text(item.kind, 'fact type', 80),
          value: text(item.value, 'fact value', 500),
          source: text(item.source, 'source excerpt', 500),
          confidence: confidence as FactDraft['confidence'],
        };
      });
      if (!drafts.length && !facts.length)
        throw new AppError(
          'empty_intake',
          400,
          'Choose at least one task or fact to review.',
        );
      return propose('dump', {
        title: `Review ${drafts.length + facts.length} extracted items`,
        drafts,
        facts,
        baseline: [],
        sourceMode: 'model',
      });
    }
    case 'reject_proposal': {
      await commit(db, [
        guard(
          db,
          "SELECT 1 FROM planning_proposals WHERE id=? AND recipient_id=? AND status='pending'",
          [text(body.id, 'proposal'), recipientId],
        ),
        db
          .prepare("UPDATE planning_proposals SET status='rejected' WHERE id=?")
          .bind(body.id),
        ...audit('Proposal declined', 'No responsibilities were changed.'),
      ]);
      break;
    }
    case 'apply_proposal': {
      const proposal = state.proposals.find(
        (p) => p.id === body.id && p.status === 'pending',
      );
      if (!proposal)
        throw new AppError(
          'missing_proposal',
          409,
          'This proposal is no longer pending.',
        );
      const guards = [
        guard(
          db,
          "SELECT 1 FROM planning_proposals WHERE id=? AND recipient_id=? AND status='pending'",
          [proposal.id, recipientId],
        ),
      ];
      for (const before of proposal.payload.baseline) {
        const task = taskFor(before.id);
        if (
          taskSignature(before) !== taskSignature(task) ||
          task.status !== before.status
        )
          throw new AppError(
            'stale_proposal',
            409,
            'A responsibility changed. Prepare a fresh proposal.',
          );
        const issues = taskFactIssues(task, state.memories);
        if (issues.length)
          throw new AppError('fact_review_required', 409, issues.join(' '));
        guards.push(assertTask(db, task));
      }
      const changes: D1PreparedStatement[] = [];
      if (
        proposal.payload.preferenceEvidence &&
        JSON.stringify(proposal.payload.preferenceEvidence) !==
          JSON.stringify(state.anticipation.preference)
      )
        throw new AppError(
          'preference_changed',
          409,
          'The verified preference changed. Prepare a fresh suggestion.',
        );
      const generated = proposal.payload.generated;
      if (generated) {
        changes.push(
          db
            .prepare('INSERT INTO generated_batches VALUES (?,?,?)')
            .bind(recipientId, generated.key, now),
        );
        if (generated.routineId) {
          guards.push(
            guard(
              db,
              'SELECT 1 FROM care_routines WHERE id=? AND recipient_id=? AND updated_at=?',
              [generated.routineId, recipientId, generated.revision],
            ),
          );
          changes.push(
            db
              .prepare(
                'UPDATE care_routines SET next_at=?,updated_at=? WHERE id=? AND recipient_id=?',
              )
              .bind(
                generated.nextAt,
                crypto.randomUUID(),
                generated.routineId,
                recipientId,
              ),
          );
        }
      }
      if (proposal.kind === 'relief') {
        const { start, end } = proposal.payload;
        if (!start || !end || Date.parse(end) <= Date.now())
          throw new AppError(
            'expired_break',
            409,
            'This break has ended. Prepare a new plan.',
          );
        const projected = state.tasks.map((task) => ({
          ...task,
          planning: { ...task.planning },
        }));
        for (const item of proposal.payload.coverage ?? []) {
          if (!item.memberId) continue;
          const task = taskFor(item.taskId);
          memberFor(item.memberId);
          if (
            Date.parse(task.due_at) <= Date.now() ||
            !availableFor(task, item.memberId, state.availability, projected)
          )
            throw new AppError(
              'coverage_changed',
              409,
              'Caregiver availability changed. Prepare a new break plan.',
            );
          projected.find((t) => t.id === task.id)!.planning.owner_member_id =
            item.memberId;
          changes.push(
            db
              .prepare(
                "UPDATE coverage_offers SET status='stale' WHERE task_id=? AND status='pending'",
              )
              .bind(task.id),
            db
              .prepare('INSERT INTO coverage_offers VALUES (?,?,?,?,?,?,?,?)')
              .bind(
                crypto.randomUUID(),
                recipientId,
                proposal.id,
                task.id,
                item.memberId,
                'pending',
                taskSignature(task),
                now,
              ),
          );
        }
        if (!changes.length)
          throw new AppError(
            'no_coverage',
            409,
            'No replacement caregivers are available yet. Add availability and prepare a new plan.',
          );
      } else if (proposal.kind === 'simulation') {
        if (proposal.payload.rootTaskId) {
          const rootChange = proposal.payload.changes?.find(
            (change) => change.taskId === proposal.payload.rootTaskId,
          );
          if (!rootChange)
            throw new AppError(
              'invalid_simulation',
              409,
              'Prepare a new simulation.',
            );
          const refreshed = simulateMove(
            state.tasks,
            state.availability,
            rootChange.taskId,
            rootChange.dueAt,
            recipient.timezone,
            false,
          );
          if (
            JSON.stringify(refreshed.changes) !==
            JSON.stringify(proposal.payload.changes)
          )
            throw new AppError(
              'dependencies_changed',
              409,
              'Linked responsibilities changed. Run the simulation again.',
            );
        }
        const projected = state.tasks.map((task) => ({
          ...task,
          due_at:
            proposal.payload.changes?.find(
              (change) => change.taskId === task.id,
            )?.dueAt ?? task.due_at,
        }));
        for (const item of proposal.payload.changes ?? []) {
          const task = taskFor(item.taskId),
            moved = projected.find((t) => t.id === task.id)!;
          if (
            task.calendarLinked ||
            Date.parse(item.dueAt) <= Date.now() ||
            !availableFor(
              moved,
              task.planning.owner_member_id,
              state.availability,
              projected,
            )
          )
            throw new AppError(
              'schedule_changed',
              409,
              'Calendar or caregiver availability changed. Run the simulation again.',
            );
          changes.push(
            db
              .prepare(
                "UPDATE tasks SET due_at=?,status='scheduled' WHERE id=?",
              )
              .bind(item.dueAt, task.id),
          );
        }
      } else {
        for (const item of proposal.payload.drafts ?? []) {
          if (Date.parse(item.dueAt) <= Date.now())
            throw new AppError(
              'past_date',
              409,
              'The proposed time has passed. Prepare a new draft.',
            );
          if (item.kind === 'reschedule') {
            const task = taskFor(item.taskId);
            if (task.calendarLinked)
              throw new AppError(
                'linked_calendar_task',
                409,
                'Use Calendar to reschedule this appointment.',
              );
            changes.push(
              db
                .prepare(
                  "UPDATE tasks SET due_at=?,status='scheduled' WHERE id=?",
                )
                .bind(item.dueAt, task.id),
            );
          } else {
            const id = crypto.randomUUID();
            if (proposal.payload.preparationFor) {
              const appointment = taskFor(proposal.payload.preparationFor);
              changes.push(
                saveDetails(db, {
                  ...appointment,
                  id,
                  title: item.title,
                  owner: 'Unassigned',
                  due_at: item.dueAt,
                  category: item.category,
                  status: 'open',
                  accepted: false,
                  calendarLinked: false,
                  planning: {
                    task_id: id,
                    recipient_id: recipientId,
                    owner_member_id: '',
                    duration_minutes: 20,
                    depends_on: appointment.id,
                    backup_member_id: '',
                    requirements: [],
                    fact_ids: [],
                    accepted_signature: '',
                  },
                }),
              );
            }
            changes.push(
              db
                .prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?)')
                .bind(
                  id,
                  item.title,
                  'Unassigned',
                  item.dueAt,
                  'open',
                  item.category,
                  null,
                ),
              scope('task', id),
            );
          }
        }
        for (const fact of proposal.payload.facts ?? []) {
          const id = crypto.randomUUID();
          changes.push(
            db
              .prepare('INSERT INTO memories VALUES (?,?,?,?,?,?,?)')
              .bind(
                id,
                fact.kind,
                fact.value,
                fact.source,
                fact.confidence,
                'review_due',
                now,
              ),
            scope('memory', id),
          );
        }
      }
      const appliedTaskIds = new Set(
        proposal.payload.changes?.map((change) => change.taskId) ?? [],
      );
      const superseded =
        proposal.kind === 'simulation'
          ? state.proposals.filter(
              (other) =>
                other.id !== proposal.id &&
                other.status === 'pending' &&
                other.kind === 'simulation' &&
                other.payload.changes?.some((change) =>
                  appliedTaskIds.has(change.taskId),
                ),
            )
          : [];
      await commit(db, [
        ...guards,
        ...changes,
        ...superseded.map((other) =>
          db
            .prepare(
              "UPDATE planning_proposals SET status='rejected' WHERE id=? AND recipient_id=? AND status='pending'",
            )
            .bind(other.id, recipientId),
        ),
        db
          .prepare("UPDATE planning_proposals SET status='applied' WHERE id=?")
          .bind(proposal.id),
        ...audit(
          proposal.kind === 'relief'
            ? 'Coverage requests ready for acceptance'
            : 'Reviewed plan applied',
          proposal.payload.title,
        ),
      ]);
      break;
    }
    case 'accept_offer':
    case 'decline_offer':
    case 'claim_task':
    case 'accept_task': {
      const offer = body.action.endsWith('_offer')
        ? state.offers.find(
            (o) =>
              o.id === body.id &&
              o.member_id === member.memberId &&
              o.status === 'pending',
          )
        : undefined;
      if (body.action.endsWith('_offer') && !offer)
        throw new AppError(
          'missing_offer',
          409,
          'No current coverage request for you.',
        );
      const task = taskFor(offer?.task_id ?? body.taskId);
      const guards = [assertTask(db, task)];
      if (offer)
        guards.push(
          guard(
            db,
            "SELECT 1 FROM coverage_offers WHERE id=? AND member_id=? AND status='pending'",
            [offer.id, member.memberId],
          ),
        );
      if (body.action === 'decline_offer') {
        await commit(db, [
          ...guards,
          db
            .prepare("UPDATE coverage_offers SET status='declined' WHERE id=?")
            .bind(offer!.id),
          ...audit('Coverage request declined', task.title),
        ]);
        break;
      }
      if (
        !offer &&
        task.owner !== 'Unassigned' &&
        task.planning.owner_member_id !== member.memberId
      )
        throw new AppError(
          'already_assigned',
          409,
          'This responsibility belongs to another caregiver. Ask them for a coverage request.',
        );
      const factIssues = taskFactIssues(task, state.memories);
      if (factIssues.length)
        throw new AppError('fact_review_required', 409, factIssues.join(' '));
      if (
        Date.parse(task.due_at) <= Date.now() ||
        !availableFor(task, member.memberId, state.availability, state.tasks)
      )
        throw new AppError(
          'unavailable',
          409,
          'Add matching availability and task capabilities before accepting this responsibility.',
        );
      if (offer && offer.signature !== taskSignature(task))
        throw new AppError(
          'stale_offer',
          409,
          'This responsibility changed. Ask for a new coverage request.',
        );
      const updated: PlannedTask = {
        ...task,
        owner: member.displayName,
        planning: { ...task.planning, owner_member_id: member.memberId },
      };
      updated.planning.accepted_signature = taskSignature(updated);
      await commit(db, [
        ...guards,
        db
          .prepare("UPDATE tasks SET owner=?,status='assigned' WHERE id=?")
          .bind(member.displayName, task.id),
        saveDetails(db, updated),
        db
          .prepare(
            "UPDATE coverage_offers SET status=CASE WHEN id=? THEN 'accepted' ELSE 'stale' END WHERE task_id=? AND status='pending'",
          )
          .bind(offer?.id ?? '', task.id),
        ...audit(
          'Responsibility accepted',
          `${member.displayName} accepted ${task.title}`,
        ),
      ]);
      break;
    }
    case 'describe_fact': {
      const memory = state.memories.find((m) => m.id === body.memoryId);
      if (!memory)
        throw new AppError('missing_fact', 404, 'Care fact not found.');
      const subject = text(body.subject, 'subject', 100),
        attribute = text(body.attribute, 'attribute', 100),
        validUntil = body.validUntil ? instant(body.validUntil) : '';
      await commit(db, [
        db
          .prepare(
            'INSERT INTO memory_facts VALUES (?,?,?,?,?,?) ON CONFLICT(memory_id) DO UPDATE SET subject=excluded.subject,attribute=excluded.attribute,valid_until=excluded.valid_until',
          )
          .bind(memory.id, recipientId, subject, attribute, validUntil, ''),
        ...audit('Care fact context updated', `${subject} / ${attribute}`),
      ]);
      break;
    }
    case 'resolve_conflict': {
      const conflict = state.conflicts.find((c) => c.key === body.key);
      const chosen = conflict?.records.find((m) => m.id === body.memoryId);
      if (!conflict || !chosen)
        throw new AppError(
          'missing_conflict',
          409,
          'This conflict changed. Refresh the care facts.',
        );
      const source = text(body.source, 'verification source', 200);
      const statements: D1PreparedStatement[] = [];
      for (const memory of conflict.records) {
        statements.push(
          guard(
            db,
            'SELECT 1 FROM memories WHERE id=? AND value=? AND updated_at=? AND status=?',
            [memory.id, memory.value, memory.updated_at, memory.status],
          ),
        );
        if (memory.id === chosen.id)
          statements.push(
            db
              .prepare(
                "UPDATE memories SET status='verified',source=?,updated_at=? WHERE id=?",
              )
              .bind(source, now, memory.id),
          );
        else
          statements.push(
            db
              .prepare(
                "UPDATE memories SET status='archived',updated_at=? WHERE id=?",
              )
              .bind(now, memory.id),
            db
              .prepare(
                'UPDATE memory_facts SET superseded_by=? WHERE memory_id=?',
              )
              .bind(chosen.id, memory.id),
          );
      }
      await commit(db, [
        ...statements,
        ...audit(
          'Conflicting care facts resolved',
          JSON.stringify({
            subject: conflict.subject,
            attribute: conflict.attribute,
            verificationSource: source,
            chosenId: chosen.id,
            previousRecords: conflict.records.map(
              ({ id, value, source: originalSource }) => ({
                id,
                value,
                source: originalSource,
              }),
            ),
          }),
        ),
      ]);
      break;
    }
    default:
      throw new AppError(
        'unknown_action',
        400,
        'Unknown care-planning action.',
      );
  }
  return {};
}
