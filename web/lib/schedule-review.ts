import type { PlannedTask, Simulation } from './planning-types';

export function scheduleReview(tasks: PlannedTask[], taskId: string, timeZone: string, preview?: Simulation | null) {
  const selected = tasks.find(task => task.id === taskId);
  if (!selected) return [];
  const day = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const projected = tasks.filter(task => !['complete', 'archived'].includes(task.status)).map(task => ({
    ...task, start: preview?.changes.find(change => change.taskId === task.id)?.after || task.due_at,
  }));
  const target = projected.find(task => task.id === taskId);
  if (!target) return [];
  return projected.filter(task => day(task.start) === day(target.start)).map(task => {
    const start = Date.parse(task.start);
    const end = start + task.planning.duration_minutes * 60000;
    const overlaps = projected.filter(other => other.id !== task.id && Boolean(task.planning.owner_member_id) && other.planning.owner_member_id === task.planning.owner_member_id && Date.parse(other.start) < end && Date.parse(other.start) + other.planning.duration_minutes * 60000 > start);
    return { id: task.id, title: task.title, owner: task.owner, start: task.start, end: new Date(end).toISOString(), overlaps: overlaps.map(other => other.title), selected: task.id === taskId, changed: task.start !== task.due_at };
  }).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
