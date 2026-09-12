import { localInput, localToInstant } from './calendar-time';
import {
  availableFor,
  isOpen,
  overlaps,
  simulateMove,
  taskEnd,
  taskSignature,
} from './planning-engine';
import type { PlanningState, PlannedTask, DraftItem } from './planning-types';
import type { CarePreference, CareRoutine } from './anticipation-types';

export function nextLocalDate(instant: string, days: number, zone: string) {
  const local = localInput(instant, zone);
  const date = new Date(`${local.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return localToInstant(
    `${date.toISOString().slice(0, 10)}T${local.slice(11, 16)}`,
    zone,
  );
}
export function matchesPreference(
  task: PlannedTask,
  preference: CarePreference | null,
  zone: string,
) {
  if (!preference || task.category !== 'appointment') return true;
  const start = localInput(task.due_at, zone),
    end = localInput(taskEnd(task), zone);
  const minutes = (value: string) =>
    Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
  return (
    start.slice(0, 10) === end.slice(0, 10) &&
    minutes(start) >= preference.start_hour * 60 &&
    minutes(end) <= preference.end_hour * 60
  );
}
export function weekForecast(
  state: PlanningState,
  zone: string,
  now = new Date(),
) {
  const today = localInput(now.toISOString(), zone).slice(0, 10);
  const start = localToInstant(`${today}T00:00`, zone);
  const open = state.tasks.filter(isOpen);
  return Array.from({ length: 7 }, (_, index) => {
    const dayStart = nextLocalDate(start, index, zone),
      dayEnd = nextLocalDate(start, index + 1, zone);
    const from = Math.max(Date.parse(dayStart), now.getTime()),
      until = Date.parse(dayEnd);
    const tasks = open.filter(
      (task) =>
        Date.parse(task.due_at) < until && Date.parse(taskEnd(task)) > from,
    );
    const mine = tasks.filter(
      (task) => task.planning.owner_member_id === state.memberId,
    );
    const minutes = Math.round(
      mine.reduce(
        (sum, task) =>
          sum +
          Math.max(
            0,
            Math.min(Date.parse(taskEnd(task)), until) -
              Math.max(Date.parse(task.due_at), from),
          ) /
            60000,
        0,
      ),
    );
    const collisions = mine.filter((task) =>
      open.some(
        (other) =>
          other.id !== task.id &&
          other.planning.owner_member_id === state.memberId &&
          overlaps(task.due_at, taskEnd(task), other.due_at, taskEnd(other)),
      ),
    );
    const unconfirmed = tasks.filter((task) => !task.accepted);
    const preferenceConflicts = tasks.filter(
      (task) => !matchesPreference(task, state.anticipation.preference, zone),
    );
    return {
      date: dayStart,
      tasks,
      minutes,
      overloaded: minutes > state.anticipation.settings.daily_minutes,
      collisions,
      unconfirmed,
      preferenceConflicts,
    };
  });
}

export function preferredMove(
  state: PlanningState,
  task: PlannedTask,
  zone: string,
  now = new Date(),
) {
  if (task.calendarLinked || !state.anticipation.preference) return null;
  const preference = state.anticipation.preference;
  const date = localInput(task.due_at, zone).slice(0, 10);
  for (let hour = preference.start_hour; hour < preference.end_hour; hour++) {
    let dueAt: string;
    try {
      dueAt = localToInstant(
        `${date}T${String(hour).padStart(2, '0')}:00`,
        zone,
      );
    } catch {
      continue;
    }
    const moved = { ...task, due_at: dueAt };
    if (
      Date.parse(dueAt) <= now.getTime() ||
      !matchesPreference(moved, preference, zone)
    )
      continue;
    if (
      !simulateMove(
        state.tasks,
        state.availability,
        task.id,
        dueAt,
        zone,
        false,
      ).conflicts.length
    )
      return dueAt;
  }
  return null;
}

export function coverageSuggestion(state: PlanningState, task: PlannedTask) {
  return state.members
    .filter(
      (member) =>
        member.role !== 'viewer' &&
        member.status === 'active' &&
        member.id !== task.planning.owner_member_id &&
        availableFor(task, member.id, state.availability, state.tasks),
    )
    .sort(
      (a, b) =>
        Number(b.id === task.planning.backup_member_id) -
          Number(a.id === task.planning.backup_member_id) ||
        state.tasks
          .filter((t) => isOpen(t) && t.planning.owner_member_id === a.id)
          .reduce((sum, t) => sum + t.planning.duration_minutes, 0) -
          state.tasks
            .filter((t) => isOpen(t) && t.planning.owner_member_id === b.id)
            .reduce((sum, t) => sum + t.planning.duration_minutes, 0) ||
        a.id.localeCompare(b.id),
    )[0];
}

export const preparationKey = (task: PlannedTask) =>
  `appointment:${task.id}:${taskSignature(task)}`;
export const routineKey = (routine: CareRoutine) =>
  `routine:${routine.id}:${routine.next_at}`;
export function preparationDrafts(
  task: PlannedTask,
  zone: string,
  now = new Date(),
): DraftItem[] {
  const items = [
    {
      title: `Confirm transport for ${task.title}`,
      category: 'transport',
      days: -2,
    },
    {
      title: `Gather questions and paperwork for ${task.title}`,
      category: 'general',
      days: -1,
    },
    {
      title: `Record follow-up actions from ${task.title}`,
      category: 'general',
      days: 1,
    },
  ];
  return items
    .map((item) => ({
      kind: 'create' as const,
      taskId: '',
      title: item.title.slice(0, 200),
      category: item.category,
      dueAt: nextLocalDate(task.due_at, item.days, zone),
      source: `Preparation checklist for ${task.title} (${task.due_at}). Confirm what applies to this visit.`,
      question: '',
    }))
    .filter((item) => Date.parse(item.dueAt) > now.getTime());
}
