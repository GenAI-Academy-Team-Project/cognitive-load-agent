// Calendar-day buckets follow the recipient's timezone, including across DST.
export function handoverTaskFilters(
  task: { due_at: string; owner: string },
  caregiverName: string,
  timezone: string,
  now: number,
) {
  const due = Date.parse(task.due_at);
  const day = (instant: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric',
    }).formatToParts(instant);
    const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
    return Date.UTC(value('year'), value('month') - 1, value('day')) / 86_400_000;
  };
  const days = Number.isFinite(due) ? day(due) - day(now) : NaN;
  return {
    due_window: !Number.isFinite(due) ? 'No due date' : due < now ? 'Overdue'
      : days === 0 ? 'Today' : days <= 7 ? 'Next 7 days (after today)' : 'Later',
    assignment: !task.owner.trim() || task.owner === 'Unassigned' ? 'Unassigned'
      : task.owner === caregiverName ? 'Assigned to me' : 'Assigned to someone else',
  };
}
