import { AppError } from './guardrails';
import { simulateMove, taskFactIssues } from './planning-engine';
import type { PlanningState } from './planning-types';

export function previewMove(state: PlanningState, taskId: string, dueAt: string, zone: string) {
  if (!Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) <= Date.now()) throw new AppError('past_date', 400, 'Choose a valid future time.');
  const simulation = simulateMove(state.tasks, state.availability, taskId, dueAt, zone);
  simulation.conflicts.push(...simulation.changes.flatMap(change => taskFactIssues(state.tasks.find(task => task.id === change.taskId)!, state.memories)));
  if (simulation.changes.some(change => Date.parse(change.dueAt) <= Date.now())) simulation.conflicts.push('A dependent responsibility would move into the past.');
  return simulation;
}
