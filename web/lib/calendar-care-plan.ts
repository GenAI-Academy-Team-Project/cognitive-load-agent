import { AppError } from './guardrails';
import { loadPlanning } from './planning-service';
import { simulateMove, taskSignature, taskFactIssues } from './planning-engine';
import type { CalendarCarePlan } from './calendar-types';

// Calendar owns the root event write. Existing planning rules own the local ripple effect.
export async function calendarCarePlan(db: D1Database, recipientId: string, memberId: string, taskId: string, start: string, end: string, zone: string): Promise<CalendarCarePlan> {
  const state = await loadPlanning(db, recipientId, memberId);
  const root = state.tasks.find(task => task.id === taskId && !['complete', 'archived'].includes(task.status));
  if (!root) throw new AppError('task_changed', 409, 'The appointment responsibility is no longer active. Review the care plan.');
  const tasks = state.tasks.map(task => task.id === taskId ? { ...task, calendarLinked: false, planning: { ...task.planning, duration_minutes: (Date.parse(end) - Date.parse(start)) / 60000 } } : task);
  const simulation = simulateMove(tasks, state.availability, taskId, start, zone, false);
  const changes = simulation.changes.map(change => {
    const task = state.tasks.find(item => item.id === change.taskId)!;
    return { taskId: task.id, title: task.title, owner: task.owner, before: task.due_at, after: change.after, signature: taskSignature(task), status: task.status };
  }).sort((a, b) => a.taskId.localeCompare(b.taskId));
  // Standalone calendar appointments retain the existing flow: shared availability
  // is mandatory for bundled coordination, not a new prerequisite for all events.
  const conflicts = changes.length > 1 ? [...simulation.conflicts] : [];
  for (const change of changes) {
    const task = state.tasks.find(item => item.id === change.taskId)!;
    conflicts.push(...taskFactIssues(task, state.memories));
    if (Date.parse(change.after) <= Date.now()) conflicts.push(`${task.title}: choose a future time for this responsibility.`);
  }
  return { changes, conflicts: [...new Set(conflicts)] };
}

export function assertCalendarCarePlan(reviewed: CalendarCarePlan | undefined, current: CalendarCarePlan) {
  // Older pending proposals must be reviewed again if linked tasks now exist.
  if (!reviewed) {
    if (current.changes.length > 1) throw new AppError('care_plan_changed', 409, 'Linked responsibilities need review. Edit this proposal to preview them before approving.');
  } else if (JSON.stringify(reviewed.changes) !== JSON.stringify(current.changes)) {
    throw new AppError('care_plan_changed', 409, 'The care plan changed since this preview. Review the proposal again before applying it.');
  }
  if (current.conflicts.length) throw new AppError('care_plan_conflict', 409, current.conflicts.join(' '));
}
