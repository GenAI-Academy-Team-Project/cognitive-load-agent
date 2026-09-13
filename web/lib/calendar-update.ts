import type { CalendarAction } from './calendar-types';

export function calendarUpdateDraft(action: CalendarAction) {
  if (action.status !== 'executed') return undefined;
  const p = action.payload;
  const when = (value: string) => new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: p.timeZone }).format(new Date(value));
  const title = `${p.title}: ${action.kind === 'cancel' ? 'cancelled' : action.kind === 'reschedule' ? 'rescheduled' : 'scheduled'}`.slice(0, 180);
  const changes = p.carePlan?.changes.filter(change => change.taskId !== p.taskId) || [];
  const detail = [
    `${p.title} was ${action.kind === 'cancel' ? 'cancelled' : `${action.kind === 'reschedule' ? 'rescheduled' : 'scheduled'} for ${when(p.start)} (${p.timeZone})`} in Google Calendar.`,
    ...changes.slice(0, 3).map(change => `${change.title.slice(0, 80)}: ${when(change.after)}.`),
    ...(changes.length > 3 ? [`${changes.length - 3} more linked responsibilities were updated; review the care plan.`] : []),
    changes.length ? 'Please review the updated plan and confirm you can still cover your responsibilities.' : 'Please review the updated care plan.',
  ].join('\n');
  return { title, detail: detail.slice(0, 900) };
}
