import type { PlannedTask, Simulation } from '@/lib/planning-types';
import { scheduleReview } from '@/lib/schedule-review';

export function ConflictSchedule({ tasks, taskId, timeZone, preview }: { tasks: PlannedTask[]; taskId: string; timeZone: string; preview?: Simulation | null }) {
  const changed = preview?.changes.some(change => change.before !== change.after);
  const clock = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  return <section aria-label="Conflict calendar" className="mt-5 rounded-xl border bg-background p-4">
    <h3 className="font-heading text-lg font-semibold">Review the day’s schedule</h3>
    <p className="mt-1 text-xs text-muted-foreground">{timeZone} · Overlaps are highlighted for the same assigned caregiver. Availability and care requirements are checked in the preview.</p>
    <div className={`mt-4 grid gap-5 ${changed ? 'lg:grid-cols-2' : ''}`}>
      {[{ label: 'Current schedule', value: null }, ...(changed ? [{ label: 'Proposed schedule — not applied', value: preview }] : [])].map(column => {
        const rows = scheduleReview(tasks, taskId, timeZone, column.value);
        return <div key={column.label}><h4 className="text-sm font-semibold">{column.label}</h4>{rows[0] && <p className="mt-1 text-xs text-muted-foreground">{new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'full' }).format(new Date(rows[0].start))}</p>}<ol className="mt-3 space-y-2">{rows.map(row => <li key={row.id} className={`grid gap-2 rounded-lg border-l-4 p-3 sm:grid-cols-[7rem_1fr] ${row.overlaps.length ? 'border-destructive bg-destructive/5' : row.selected || row.changed ? 'border-primary bg-secondary' : 'border-muted bg-card'}`}>
          <p className="text-xs font-semibold tabular-nums">{clock(row.start)}<br />{clock(row.end)}</p><div><p className="text-sm font-medium">{row.title}{row.selected ? ' · Selected' : ''}</p><p className="mt-1 text-xs text-muted-foreground">{row.owner}{row.changed ? ' · Proposed move' : ''}</p>{row.overlaps.length > 0 && <p className="mt-2 text-xs text-destructive">Overlaps: {row.overlaps.join(', ')}</p>}</div>
        </li>)}</ol></div>;
      })}
    </div>
  </section>;
}
