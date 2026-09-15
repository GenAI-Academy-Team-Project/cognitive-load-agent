import { localInput, localToInstant } from './calendar-time';
import type { CareCircleMember } from './types';
import type {
  Availability,
  CoverageItem,
  DraftItem,
  FactConflict,
  HandoverChange,
  PlannedTask,
  PlanningMemory,
  Simulation,
  SnapshotEntry,
} from './planning-types';

export const isOpen = (task: PlannedTask) =>
  task.status !== 'complete' && task.status !== 'archived';
export function taskSignature(task: PlannedTask) {
  return JSON.stringify([
    task.id,
    task.title,
    task.owner,
    task.due_at,
    task.category,
    task.planning.owner_member_id,
    task.planning.duration_minutes,
    task.planning.depends_on,
    task.planning.requirements,
    task.planning.fact_ids ?? [],
  ]);
}
export function overlaps(
  start: string,
  end: string,
  otherStart: string,
  otherEnd: string,
) {
  return (
    Date.parse(start) < Date.parse(otherEnd) &&
    Date.parse(end) > Date.parse(otherStart)
  );
}
export const taskEnd = (task: PlannedTask) =>
  new Date(
    Date.parse(task.due_at) + task.planning.duration_minutes * 60000,
  ).toISOString();

export function availableFor(
  task: PlannedTask,
  memberId: string,
  windows: Availability[],
  tasks: PlannedTask[],
) {
  const window = windows.find(
    (item) =>
      item.member_id === memberId &&
      Date.parse(item.start_at) <= Date.parse(task.due_at) &&
      Date.parse(item.end_at) >= Date.parse(taskEnd(task)) &&
      item.categories.includes(task.category) &&
      task.planning.requirements.every((requirement) =>
        item.capabilities.includes(requirement),
      ),
  );
  return (
    Boolean(window) &&
    !tasks.some(
      (other) =>
        other.id !== task.id &&
        isOpen(other) &&
        other.planning.owner_member_id === memberId &&
        overlaps(task.due_at, taskEnd(task), other.due_at, taskEnd(other)),
    )
  );
}

export function reliefPlan(
  tasks: PlannedTask[],
  members: CareCircleMember[],
  windows: Availability[],
  memberId: string,
  start: string,
  end: string,
): CoverageItem[] {
  const projected = tasks.map((task) => ({
    ...task,
    planning: { ...task.planning },
  }));
  return tasks
    .filter(
      (task) =>
        isOpen(task) &&
        task.planning.owner_member_id === memberId &&
        overlaps(start, end, task.due_at, taskEnd(task)),
    )
    .map((task) => {
      const candidates = members.filter(
        (member) =>
          member.id !== memberId &&
          member.status === 'active' &&
          member.role !== 'viewer' &&
          availableFor(task, member.id, windows, projected),
      );
      candidates.sort(
        (a, b) =>
          Number(b.id === task.planning.backup_member_id) -
            Number(a.id === task.planning.backup_member_id) ||
          projected.filter(
            (t) => isOpen(t) && t.planning.owner_member_id === a.id,
          ).length -
            projected.filter(
              (t) => isOpen(t) && t.planning.owner_member_id === b.id,
            ).length ||
          a.id.localeCompare(b.id),
      );
      const candidate = candidates[0];
      if (candidate)
        projected.find(
          (item) => item.id === task.id,
        )!.planning.owner_member_id = candidate.id;
      return {
        taskId: task.id,
        memberId: candidate?.id ?? '',
        reason: candidate
          ? `${candidate.display_name} has matching availability and task requirements${candidate.id === task.planning.backup_member_id ? ' and is your preferred backup' : ''}. Acceptance is still needed.`
          : 'No available caregiver matches this task. Add availability or arrange coverage with your care circle.',
      };
    });
}

export function simulateMove(
  tasks: PlannedTask[],
  windows: Availability[],
  taskId: string,
  dueAt: string,
  timeZone: string,
  alternatives = true,
): Simulation {
  const root = tasks.find((task) => task.id === taskId && isOpen(task));
  if (!root) throw new Error('Choose an open responsibility.');
  const shift = Date.parse(dueAt) - Date.parse(root.due_at);
  const affected = new Set([root.id]);
  for (let i = 0; i < tasks.length; i++)
    for (const task of tasks)
      if (isOpen(task) && affected.has(task.planning.depends_on))
        affected.add(task.id);
  const changes = tasks
    .filter((task) => affected.has(task.id))
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      dueAt: new Date(Date.parse(task.due_at) + shift).toISOString(),
      before: task.due_at,
      after: new Date(Date.parse(task.due_at) + shift).toISOString(),
    }));
  const projected = tasks.map((task) => ({
    ...task,
    due_at:
      changes.find((change) => change.taskId === task.id)?.dueAt ?? task.due_at,
  }));
  const conflicts: string[] = [];
  for (const task of projected.filter((item) => affected.has(item.id))) {
    if (task.calendarLinked)
      conflicts.push(
        `${task.title}: connected appointment — apply this change in Calendar so guests are updated.`,
      );
    if (!task.planning.owner_member_id)
      conflicts.push(`${task.title}: no caregiver is assigned.`);
    else if (
      !availableFor(task, task.planning.owner_member_id, windows, projected)
    )
      conflicts.push(
        `${task.title}: caregiver availability, task requirements, or another responsibility conflicts with this time.`,
      );
  }
  const options: Simulation['alternatives'] = [];
  if (alternatives && conflicts.length && !root.calendarLinked) {
    for (const minutes of [30, -30, 60, -60, 120, 180, 1440]) {
      const candidate = new Date(
        Date.parse(dueAt) + minutes * 60000,
      ).toISOString();
      if (
        Date.parse(candidate) > Date.now() &&
        !simulateMove(tasks, windows, taskId, candidate, timeZone, false)
          .conflicts.length
      )
        options.push({
          label: new Intl.DateTimeFormat('en-CA', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone,
          }).format(new Date(candidate)),
          dueAt: candidate,
        });
      if (options.length === 2) break;
    }
  }
  return { changes, conflicts: [...new Set(conflicts)], alternatives: options };
}

export function memoryConflicts(
  memories: PlanningMemory[],
  now = Date.now(),
): FactConflict[] {
  const groups = new Map<string, PlanningMemory[]>();
  for (const memory of memories) {
    if (
      memory.status === 'archived' ||
      !memory.fact ||
      memory.fact.superseded_by ||
      (memory.fact.valid_until && Date.parse(memory.fact.valid_until) <= now)
    )
      continue;
    const key = `${memory.fact.subject.trim().toLowerCase()}::${memory.fact.attribute.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), memory]);
  }
  return [...groups]
    .filter(
      ([, records]) =>
        new Set(records.map((record) => record.value.trim().toLowerCase()))
          .size > 1,
    )
    .map(([key, records]) => ({
      key,
      subject: records[0].fact!.subject,
      attribute: records[0].fact!.attribute,
      records,
    }));
}

export function handoverDiff(
  previous: SnapshotEntry[],
  current: SnapshotEntry[],
): HandoverChange[] {
  const old = new Map(previous.map((entry) => [entry.id, entry]));
  const next = new Map(current.map((entry) => [entry.id, entry]));
  return [...new Set([...old.keys(), ...next.keys()])].flatMap((id) => {
    const before = old.get(id),
      after = next.get(id);
    return before?.detail === after?.detail && before?.label === after?.label
      ? []
      : [
          {
            id,
            label: after?.label ?? before!.label,
            kind: after?.kind ?? before!.kind,
            before: before?.detail ?? null,
            after: after?.detail ?? null,
          },
        ];
  });
}

// Local, conservative extraction: every clause remains visible and ambiguous dates need review.
export function extractDrafts(
  text: string,
  tasks: PlannedTask[],
  timeZone: string,
  now = new Date(),
): DraftItem[] {
  return text
    .split(/(?:[\n;]+|,\s*|\band\b(?=\s+(?:we|the|I|[A-Z])))/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((source) => {
      const reschedule = /\b(move[ds]?|reschedule[ds]?)\b/i.test(source);
      const candidates = tasks.filter(
        (task) => isOpen(task) && task.category === 'appointment',
      );
      const named = candidates.filter(
        (task) =>
          source.toLowerCase().includes(task.title.toLowerCase()) ||
          task.title
            .toLowerCase()
            .split(/\W+/)
            .filter((word) => word.length > 4 && word !== 'appointment')
            .some((word) => source.toLowerCase().includes(word)),
      );
      const match =
        named.length === 1
          ? named[0]
          : candidates.length === 1
            ? candidates[0]
            : undefined;
      let dueAt = '';
      const iso = source.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
      const clock = source.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
      let day = iso?.[1] ?? '';
      if (!day) {
        const today = localInput(now.toISOString(), timeZone).slice(0, 10);
        const date = new Date(`${today}T12:00:00Z`);
        const weekdays = [
          'sunday',
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
        ];
        const weekday = weekdays.findIndex((name) =>
          source.toLowerCase().includes(name),
        );
        const offset = /\btomorrow\b/i.test(source)
          ? 1
          : /\btoday\b/i.test(source)
            ? 0
            : weekday >= 0
              ? (weekday - date.getUTCDay() + 7) % 7 || 7
              : null;
        if (offset !== null) {
          date.setUTCDate(date.getUTCDate() + offset);
          day = date.toISOString().slice(0, 10);
        }
      }
      if (day && clock && Number(clock[1]) >= 1 && Number(clock[1]) <= 12) {
        try {
          dueAt = localToInstant(
            `${day}T${String((Number(clock[1]) % 12) + (clock[3].toLowerCase() === 'pm' ? 12 : 0)).padStart(2, '0')}:${clock[2] ?? '00'}`,
            timeZone,
          );
        } catch {
          /* Review must supply a valid, unambiguous time. */
        }
      }
      const category = /ride|driv|transport/i.test(source)
        ? 'transport'
        : /pickup|pharmacy|refill/i.test(source)
          ? 'medication'
          : 'general';
      return {
        kind: reschedule ? 'reschedule' : 'create',
        taskId: reschedule ? (match?.id ?? '') : '',
        title: reschedule && match ? match.title : source.slice(0, 200),
        dueAt,
        category,
        source,
        question: [
          reschedule && !match ? 'Choose the appointment this refers to.' : '',
          !dueAt ? 'Confirm the exact date and time.' : '',
          /can.t|cannot|unavailable/i.test(source)
            ? 'Confirm replacement coverage; no caregiver has been assigned.'
            : '',
        ]
          .filter(Boolean)
          .join(' '),
        confidence:
          dueAt && (!reschedule || match) ? ('high' as const) : ('low' as const),
      };
    });
}

export function taskFactIssues(task: PlannedTask, memories: PlanningMemory[], now = Date.now()): string[] {
  const disputed = new Set(memoryConflicts(memories, now).flatMap((conflict) => conflict.records.map((record) => record.id)));
  return (task.planning.fact_ids ?? []).flatMap((id) => {
    const memory = memories.find((record) => record.id === id);
    const invalid = !memory || memory.status !== 'verified' || memory.fact?.superseded_by || disputed.has(id) || (memory.fact?.valid_until && Date.parse(memory.fact.valid_until) <= now);
    return invalid ? [`${task.title}: verify the required care fact “${memory?.value ?? 'archived or missing fact'}” before scheduling or accepting coverage.`] : [];
  });
}
