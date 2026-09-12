'use client';

import { PaginatedList } from './paginated-list';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Copy,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { localInput, localToInstant } from '@/lib/calendar-time';
import {
  coverageSuggestion,
  preferredMove,
  preparationKey,
  weekForecast,
} from '@/lib/anticipation-engine';
import { isOpen } from '@/lib/planning-engine';
import type { PlanningState } from '@/lib/planning-types';
import type { DashboardState } from '@/lib/types';
import type { CareRoutine } from '@/lib/anticipation-types';

type Props = {
  state: PlanningState;
  dashboard: DashboardState;
  disabled: boolean;
  act: (action: string, payload?: Record<string, unknown>) => Promise<unknown>;
  navigate: (tab: string) => void;
};
const panel = 'care-organizer-panel min-w-0 rounded-2xl border p-5 md:p-6';
const field = 'grid gap-2 text-sm font-medium';
const select =
  'min-h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring';
const when = (iso: string, zone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: zone,
  }).format(new Date(iso));
const value = (data: FormData, key: string) => {
  const entry = data.get(key);
  return typeof entry === 'string' ? entry : '';
};

export function WeekAhead(props: Props) {
  const { state, dashboard, disabled, act, navigate } = props;
  const zone = dashboard.selectedRecipient.timezone;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const days = weekForecast(state, zone, now);
  const [selected, setSelected] = useState(0);
  const day = days[selected];
  const overdue = state.tasks.filter(
    (task) => isOpen(task) && Date.parse(task.due_at) < now.getTime(),
  );
  const needsAttention = days.filter(
    (item) =>
      item.overloaded ||
      item.collisions.length ||
      item.unconfirmed.length ||
      item.routines.length ||
      item.preferenceConflicts.length,
  );
  return (
    <div className="space-y-6">
      <section data-care-tone="sky" className={panel}>
        <p className="text-sm font-medium text-primary">Your next seven days</p>
        <h2 className="mt-2 font-heading text-2xl font-semibold">
          {needsAttention.length
            ? `${needsAttention.length} ${needsAttention.length === 1 ? 'day needs' : 'days need'} a little planning.`
            : 'Make room for the week ahead.'}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Your care time for {dashboard.selectedRecipient.display_name},
          alongside the circle’s coverage. Estimates use recorded
          responsibilities and durations; personal calendars and other care
          recipients are not included.
        </p>
        <div
          className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7"
          aria-label="Seven-day care forecast"
        >
          {days.map((item, index) => (
            <button
              key={item.date}
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
              className={`min-w-0 rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-ring ${selected === index ? 'border-primary bg-secondary text-secondary-foreground ring-2 ring-primary' : 'bg-card'}`}
            >
              <span className="block text-sm font-medium">
                {new Intl.DateTimeFormat('en-CA', {
                  weekday: 'short',
                  day: 'numeric',
                  timeZone: zone,
                }).format(new Date(item.date))}
              </span>
              <span className="mt-3 block font-heading text-2xl font-semibold">
                {item.minutes}
                <span className="ml-1 text-xs font-normal">min</span>
              </span>
              <span
                className="my-3 block h-1.5 overflow-hidden rounded-full bg-secondary"
                aria-hidden="true"
              >
                <span
                  className={`block h-full ${item.overloaded ? 'bg-amber-700' : 'bg-primary'}`}
                  style={{
                    width: `${Math.min(100, (item.minutes / state.anticipation.settings.daily_minutes) * 100)}%`,
                  }}
                />
              </span>
              <span className="block text-xs leading-5">
                {item.overloaded
                  ? 'Over your limit'
                  : `of ${state.anticipation.settings.daily_minutes} min`}
              </span>
              <span className="block text-xs leading-5">
                {item.unconfirmed.length} unconfirmed
              </span>
              {item.routines.length > 0 && <span className="block text-xs leading-5">{item.routines.length} routines to review</span>}
            </button>
          ))}
        </div>
        {state.anticipation.routines.some(routine => Date.parse(routine.next_at) < now.getTime()) && <p className="mt-4 text-sm"><button className="font-medium underline underline-offset-4" onClick={() => navigate('routines')}>Review overdue routines</button> and confirm their next dates.</p>}
        {overdue.length > 0 && (
          <p className="mt-4 text-sm font-medium text-[var(--care-amber-ink)]">
            Also review {overdue.length} overdue{' '}
            {overdue.length === 1 ? 'responsibility' : 'responsibilities'}.{' '}
            <button
              onClick={() => navigate('tasks')}
              className="underline underline-offset-4"
            >
              Open task planning
            </button>
          </p>
        )}
      </section>
      <section data-care-tone="peach" className={panel} aria-label="Selected day details">
        {day.routines.length > 0 && <div className="mb-5 space-y-3"><p className="text-sm text-muted-foreground">These routines still need approval. Their time is not included in your assigned workload.</p>{day.routines.map(routine => <article key={routine.id} className="rounded-xl border p-3"><h3 className="text-sm font-semibold">{routine.title}</h3><p className="mt-1 text-xs">{when(routine.next_at, zone)}</p><Button className="mt-3" variant="outline" disabled={disabled} onClick={() => act('propose_routine', { id: routine.id })}>Review next occurrence</Button></article>)}</div>}
        <h3 className="font-heading text-xl font-semibold">
          {new Intl.DateTimeFormat('en-CA', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            timeZone: zone,
          }).format(new Date(day.date))}
        </h3>
        {day.overloaded && (
          <p className="mt-3 text-sm text-[var(--care-amber-ink)]">
            Your planned care exceeds your daily limit by{' '}
            {day.minutes - state.anticipation.settings.daily_minutes} minutes.
            Review coverage below or use “I need a break”.
          </p>
        )}
        {day.collisions.length > 0 && (
          <p className="mt-3 text-sm text-[var(--care-amber-ink)]">
            {day.collisions.length} of your responsibilities overlap. Review
            their times in “What if?”.
          </p>
        )}
        {!day.tasks.length && !day.routines.length && (
          <p className="mt-4 text-sm text-muted-foreground">
            No upcoming responsibilities are recorded for this day. Add care
            tasks to make the forecast useful.
          </p>
        )}
        <div className="mt-4 divide-y">
          {day.tasks.map((task) => {
            const candidate =
              !task.accepted ||
              (day.overloaded &&
                task.planning.owner_member_id === state.memberId)
                ? coverageSuggestion(state, task)
                : undefined;
            const preferenceConflict = day.preferenceConflicts.some(
              (item) => item.id === task.id,
            );
            const alternative = preferenceConflict
              ? preferredMove(state, task, zone, now)
              : null;
            return (
              <article key={task.id} className="space-y-3 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold">{task.title}</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {when(task.due_at, zone)} ·{' '}
                      {task.planning.duration_minutes} min · {task.owner}
                    </p>
                  </div>
                  <span className="text-xs font-medium">
                    {task.accepted
                      ? 'Coverage accepted'
                      : 'Coverage not confirmed'}
                  </span>
                </div>
                {candidate && (
                  <div className="rounded-xl bg-secondary/50 p-3">
                    <p className="text-sm">
                      {candidate.display_name} has matching availability and
                      capabilities
                      {candidate.id === task.planning.backup_member_id
                        ? ' and is the preferred backup'
                        : ''}
                      . They will need to accept.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-3"
                      disabled={disabled}
                      onClick={() =>
                        act('propose_forecast_coverage', {
                          taskId: task.id,
                          memberId: candidate.id,
                        })
                      }
                    >
                      Review coverage request <ArrowRight />
                    </Button>
                  </div>
                )}
                {!task.accepted && !candidate && (
                  <p className="text-sm text-muted-foreground">
                    No alternative caregiver matches the recorded availability.
                    Confirm the current owner or add availability in Task
                    planning.
                  </p>
                )}
                {preferenceConflict && (
                  <div className="rounded-xl border p-3">
                    <p className="text-sm">
                      Outside the preferred visit hours (
                      {state.anticipation.preference!.start_hour}:00–
                      {state.anticipation.preference!.end_hour}:00).
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Verified source:{' '}
                      {state.anticipation.preference!.memory_value}
                    </p>
                    {alternative ? (
                      <Button
                        variant="outline"
                        className="mt-3"
                        disabled={disabled}
                        onClick={() =>
                          act('propose_preferred_move', {
                            taskId: task.id,
                            dueAt: alternative,
                          })
                        }
                      >
                        Review {when(alternative, zone)}
                      </Button>
                    ) : (
                      <p className="mt-2 text-xs">
                        {task.calendarLinked
                          ? 'Review this linked appointment in Calendar so guests receive any approved change.'
                          : 'No conflict-free time was found in the preferred window. Use “What if?” to explore another day.'}
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <PlanningPreferences {...props} />
    </div>
  );
}

function PlanningPreferences({ state, disabled, act }: Props) {
  const { settings, preference, preferenceNeedsReview, verifiedMemories } =
    state.anticipation;
  return (
    <details data-care-tone="plum" className={panel}>
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <SlidersHorizontal className="size-4" /> Make this plan fit your family
      </summary>
      <div className="mt-5 grid gap-8 lg:grid-cols-2">
        <form
          key={JSON.stringify(settings)}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void act('save_attention', {
              dailyMinutes: Number(value(data, 'minutes')),
              digestHour: Number(value(data, 'hour')),
              focusMode: data.get('focus') === 'on',
            });
          }}
        >
          <h3 className="font-heading text-lg font-semibold">
            Your time and attention
          </h3>
          <label className={field} htmlFor="ahead-minutes">
            Daily care limit for this person (minutes)
            <Input
              id="ahead-minutes"
              name="minutes"
              type="number"
              min={15}
              max={1440}
              defaultValue={settings.daily_minutes}
              required
            />
          </label>
          <label className={field} htmlFor="ahead-hour">
            In-app digest hour (0–23, care recipient’s time zone)
            <Input
              id="ahead-hour"
              name="hour"
              type="number"
              min={0}
              max={23}
              defaultValue={settings.digest_hour}
              required
            />
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              name="focus"
              type="checkbox"
              defaultChecked={settings.focus_mode}
              className="mt-1"
            />{' '}
            Keep routine updates folded until my digest hour. Decisions remain
            visible.
          </label>
          <Button type="submit" disabled={disabled}>
            Save my preferences
          </Button>
        </form>
        <form
          key={JSON.stringify(preference)}
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void act('save_care_preference', {
              memoryId: value(data, 'memory'),
              startHour: Number(value(data, 'start')),
              endHour: Number(value(data, 'end')),
            });
          }}
        >
          <h3 className="font-heading text-lg font-semibold">
            Preferred visit hours · shared with your circle
          </h3>
          <p className="text-sm leading-6 text-muted-foreground">
            Choose the trusted fact that describes the preference, then confirm
            the hours it means. Suggestions will use this window.
          </p>
          {preferenceNeedsReview && (
            <output className="block text-sm text-[var(--care-amber-ink)]">
              The source fact changed or needs review. This preference is paused
              until you confirm a current source.
            </output>
          )}
          <label className={field}>
            Verified preference source
            <select
              className={select}
              name="memory"
              defaultValue={preference?.memory_id ?? ''}
            >
              <option value="">No preferred window</option>
              {verifiedMemories.map((memory) => (
                <option key={memory.id} value={memory.id}>
                  {memory.value}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={field} htmlFor="ahead-start">
              From hour
              <Input
                id="ahead-start"
                name="start"
                type="number"
                min={0}
                max={23}
                defaultValue={preference?.start_hour ?? 12}
                required
              />
            </label>
            <label className={field} htmlFor="ahead-end">
              Until hour
              <Input
                id="ahead-end"
                name="end"
                type="number"
                min={1}
                max={24}
                defaultValue={preference?.end_hour ?? 17}
                required
              />
            </label>
          </div>
          <Button type="submit" disabled={disabled}>
            Confirm visit preference
          </Button>
        </form>
      </div>
    </details>
  );
}

export function CareRoutines({ state, dashboard, act, disabled }: Props) {
  const zone = dashboard.selectedRecipient.timezone;
  const [editing, setEditing] = useState<CareRoutine | null>(null);
  const [error, setError] = useState('');
  const [reset, setReset] = useState(0);
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div data-care-tone="plum" className={panel}>
        <h2 className="font-heading text-2xl font-semibold">
          The things that come around again.
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Save a repeating responsibility once. Review each next occurrence
          here; approving it creates an unassigned task and advances the
          routine. Times follow {zone}.
        </p>
        <form
          key={`${editing?.id ?? 'new'}:${reset}`}
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            const data = new FormData(event.currentTarget);
            try {
              const result = await act('save_routine', {
                id: editing?.id,
                title: value(data, 'title'),
                category: value(data, 'category'),
                everyDays: Number(value(data, 'days')),
                nextAt: localToInstant(value(data, 'next'), zone),
              });
              if (result) {
                setEditing(null);
                setReset((count) => count + 1);
              }
            } catch (reason) {
              setError((reason as Error).message);
            }
          }}
        >
          <label className={field} htmlFor="ahead-title">
            Responsibility
            <Input
              id="ahead-title"
              name="title"
              maxLength={200}
              defaultValue={editing?.title ?? ''}
              placeholder="Restock household supplies"
              required
            />
          </label>
          <label className={field}>
            Category
            <select
              name="category"
              className={select}
              defaultValue={editing?.category ?? 'household'}
            >
              {[
                'general',
                'transport',
                'appointment',
                'medication',
                'household',
                'checkin',
                'mobility',
              ].map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={field} htmlFor="ahead-days">
              Repeat every (days)
              <Input
                id="ahead-days"
                type="number"
                name="days"
                min={1}
                max={365}
                defaultValue={editing?.every_days ?? 7}
                required
              />
            </label>
            <label className={field} htmlFor="ahead-next">
              Next date and time
              <Input
                id="ahead-next"
                type="datetime-local"
                name="next"
                defaultValue={editing ? localInput(editing.next_at, zone) : ''}
                required
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={disabled}>
              {editing ? 'Save routine changes' : 'Save routine'}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
              >
                Cancel edit
              </Button>
            )}
          </div>
        </form>
      </div>
      <div className="space-y-4">
        {!state.anticipation.routines.length && (
          <p data-care-tone="sky" className={`${panel} text-sm text-muted-foreground`}>
            Add a routine to stop rebuilding the same responsibility each week.
          </p>
        )}
        <PaginatedList label="Care routines" records={state.anticipation.routines} resetKey={dashboard.selectedRecipient.id}>{state.anticipation.routines.map((routine) => (
          <article key={routine.id} data-care-tone="sky" className={panel}>
            <h3 className="font-heading text-lg font-semibold">
              {routine.title}
            </h3>
            <p className="mt-2 text-sm">
              Every {routine.every_days} days · next{' '}
              {when(routine.next_at, zone)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={disabled}
                onClick={() => act('propose_routine', { id: routine.id })}
              >
                Review next occurrence
              </Button>
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => setEditing(routine)}
              >
                Edit routine
              </Button>
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => act('remove_routine', { id: routine.id })}
              >
                Stop repeating
              </Button>
            </div>
          </article>
        ))}</PaginatedList>
      </div>
    </section>
  );
}

export function AppointmentPreparation({
  state,
  dashboard,
  act,
  disabled,
}: Props) {
  const zone = dashboard.selectedRecipient.timezone;
  const appointments = state.tasks.filter(
    (task) => task.category === 'appointment',
  );
  const [taskId, setTaskId] = useState('');
  const task =
    appointments.find((item) => item.id === taskId) ??
    appointments.find(isOpen) ??
    appointments[0];
  const note = state.anticipation.notes.find(
    (item) => item.task_id === task?.id,
  );
  const [copyStatus, setCopyStatus] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  if (!task)
    return (
      <p data-care-tone="sky" className={`${panel} text-sm`}>
        Add an appointment to your responsibilities or Calendar to prepare a
        visit brief.
      </p>
    );
  const brief = [
    `${dashboard.selectedRecipient.display_name} — ${task.title}`,
    when(task.due_at, zone),
    `Caregiver: ${task.owner}; ${task.accepted ? 'coverage accepted' : 'coverage not confirmed'}`,
    'Questions to ask:',
    note?.questions || 'No questions saved yet.',
    'Caregiver-recorded activity from the last 14 days (review for relevance):',
    ...state.anticipation.events.map(
      (event) =>
        `${when(event.occurred_at, zone)}: ${event.title} — ${event.detail} [${event.source}]`,
    ),
    'Verified care facts (review for relevance):',
    ...state.anticipation.verifiedMemories.map(
      (memory) => `${memory.value} [${memory.source}; record ${memory.id}]`,
    ),
    'Open follow-ups and responsibilities:',
    ...state.tasks
      .filter(
        (item) =>
          isOpen(item) &&
          item.id !== task.id &&
          (item.planning.depends_on === task.id || item.category === 'general'),
      )
      .map(
        (item) =>
          `${item.title} — ${when(item.due_at, zone)} [record ${item.id}]`,
      ),
    'Your saved follow-up notes:',
    note?.follow_up || 'No follow-up notes saved yet.',
    'Care coordination brief. Review before sharing; this is not clinical guidance.',
  ].join('\n');
  return (
    <div className="space-y-6">
      <section data-care-tone="sky" className={panel}>
        <h2 className="font-heading text-2xl font-semibold">
          Walk in with your questions ready.
        </h2>
        <label className={`${field} mt-5 max-w-xl`}>
          Appointment
          <select
            className={select}
            value={task.id}
            onChange={(event) => {
              setTaskId(event.target.value);
              setCopyStatus('');
            }}
          >
            {appointments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {when(item.due_at, zone)}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-3 text-sm text-muted-foreground">
          Prepare transport, questions, paperwork, and a follow-up reminder.
          Review the suggested tasks below before approving them; dates already
          passed are omitted.
        </p>
        <Button
          className="mt-4"
          disabled={
            disabled ||
            !isOpen(task) ||
            state.anticipation.generatedKeys.includes(preparationKey(task))
          }
          onClick={() => act('propose_preparation', { taskId: task.id })}
        >
          <CalendarDays />
          {state.anticipation.generatedKeys.includes(preparationKey(task))
            ? 'Preparation tasks created'
            : 'Review preparation checklist'}
        </Button>
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <section data-care-tone="plum" className={panel}>
          <h3 className="font-heading text-xl font-semibold">
            Your questions and follow-up
          </h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            These notes are shown to your account. They are included in the
            recipient owner’s data export.
          </p>
          <form
            key={`${task.id}:${JSON.stringify(note)}`}
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void act('save_appointment_notes', {
                taskId: task.id,
                questions: value(data, 'questions'),
                followUp: value(data, 'followup'),
              });
            }}
          >
            <label className={field} htmlFor="ahead-questions">
              Questions to ask
              <Textarea
                id="ahead-questions"
                name="questions"
                rows={5}
                maxLength={4000}
                defaultValue={note?.questions ?? ''}
                placeholder="What should we bring to the next visit?"
              />
            </label>
            <label className={field} htmlFor="ahead-followup">
              Follow-up actions recorded after the visit
              <Textarea
                id="ahead-followup"
                name="followup"
                rows={4}
                maxLength={4000}
                defaultValue={note?.follow_up ?? ''}
                placeholder="Call the clinic to arrange the next appointment."
              />
            </label>
            <Button type="submit" disabled={disabled}>
              Save appointment notes
            </Button>
          </form>
          {note?.follow_up && (
            <div className="mt-6 space-y-3 border-t pt-4">
              <label className={field} htmlFor="ahead-followup-due">
                Follow-up responsibility due ({zone})
                <Input
                  type="datetime-local"
                  id="ahead-followup-due"
                  value={followUpDate}
                  onChange={(event) => setFollowUpDate(event.target.value)}
                />
              </label>
              <Button
                variant="outline"
                disabled={disabled || !followUpDate}
                onClick={async () => {
                  try {
                    await act('propose_dump', {
                      drafts: [
                        {
                          kind: 'create',
                          title: `Follow up: ${task.title}`.slice(0, 200),
                          taskId: '',
                          category: 'general',
                          dueAt: localToInstant(followUpDate, zone),
                          source: note.follow_up,
                          question: '',
                        },
                      ],
                    });
                  } catch (reason) {
                    setCopyStatus((reason as Error).message);
                  }
                }}
              >
                Review follow-up responsibility
              </Button>
              <p className="text-xs text-muted-foreground">
                This shares the saved follow-up text with the care circle in the
                review proposal.
              </p>
            </div>
          )}
        </section>
        <section data-care-tone="peach" className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-heading text-xl font-semibold">Visit brief</h3>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(brief);
                  setCopyStatus('Brief copied. Review it before sharing.');
                } catch {
                  setCopyStatus(
                    'Copy was unavailable. Select the brief text to copy it.',
                  );
                }
              }}
            >
              <Copy /> Copy saved brief
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Built from saved notes and source records. Review which details
            belong in this visit.
          </p>
          <textarea
            readOnly
            rows={20}
            value={brief}
            aria-label="Saved visit brief"
            className="mt-5 max-h-[36rem] w-full resize-y overflow-auto rounded-lg bg-transparent font-sans text-sm leading-6 focus-visible:outline-2 focus-visible:outline-ring"
          />
        </section>
      </div>
      {copyStatus && (
        <output className="block text-sm">
          {copyStatus}
        </output>
      )}
    </div>
  );
}

export function AttentionDigest({ state, dashboard, navigate }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [showNow, setShowNow] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const { settings } = state.anticipation;
  const ready =
    Number(
      localInput(now.toISOString(), dashboard.selectedRecipient.timezone).slice(
        11,
        13,
      ),
    ) >= settings.digest_hour;
  const urgent = dashboard.notifications.filter(
    (item) =>
      item.delivery_state !== 'suppressed' &&
      !item.read_at &&
      (item.kind === 'risk' ||
        item.kind === 'approval' ||
        item.delivery_state === 'needs_approval'),
  );
  const routine = dashboard.notifications.filter(
    (item) =>
      item.delivery_state === 'delivered' &&
      !item.read_at &&
      item.kind !== 'risk' &&
      item.kind !== 'approval',
  );
  const offers = state.offers.filter(
    (item) => item.member_id === state.memberId && item.status === 'pending',
  );
  const proposals = state.proposals.filter((item) => item.status === 'pending');
  const showDigest = showNow || ready || !settings.focus_mode;
  return (
    <div className="space-y-6">
      <section data-care-tone="amber" className={panel}>
        <p className="text-sm font-medium text-primary">
          Your attention, protected
        </p>
        <h2 className="mt-2 font-heading text-2xl font-semibold">
          Start with what needs a decision.
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Coverage requests for you, shared plans awaiting review, and unread
          care alerts stay visible. Routine updates are collected below.
        </p>
        {!!offers.length && (
          <p className="mt-4 text-sm">
            {offers.length} coverage{' '}
            {offers.length === 1 ? 'request is' : 'requests are'} waiting for
            your acceptance. Review them below.
          </p>
        )}
        {!!proposals.length && (
          <p className="mt-3 text-sm">
            {proposals.length} shared{' '}
            {proposals.length === 1 ? 'plan needs' : 'plans need'} caregiver
            review. Open the proposal cards below.
          </p>
        )}
        {!urgent.length && !offers.length && !proposals.length && (
          <p className="mt-5 flex items-center gap-2 text-sm">
            <Check className="size-4" /> No unread alerts or pending decisions
            are recorded.
          </p>
        )}
        <div className="mt-4 divide-y">
          {urgent.map((item) => (
            <article key={item.id} className="py-3">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {item.detail}
              </p>
              {item.delivery_state === 'needs_approval' && (
                <p className="mt-1 text-xs">
                  Held for approval; the action has not been released.
                </p>
              )}
            </article>
          ))}
        </div>
      </section>
      <section data-care-tone="sky" className={panel}>
        <h3 className="font-heading text-xl font-semibold">
          Your routine update digest
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {routine.length} unread updates · opens in-app at{' '}
          {String(settings.digest_hour).padStart(2, '0')}:00 (
          {dashboard.selectedRecipient.timezone}). This does not send email or
          push notifications.
        </p>
        {!showDigest ? (
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => setShowNow(true)}
          >
            View updates now
          </Button>
        ) : (
          <div className="mt-4 divide-y">
            {routine.length ? (
              routine.map((item) => (
                <article key={item.id} className="py-3">
                  <h4 className="text-sm font-semibold">{item.title}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.detail}
                  </p>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No routine updates are waiting.
              </p>
            )}
          </div>
        )}
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate('week')}
        >
          Adjust time and attention preferences
        </Button>
      </section>
    </div>
  );
}
