'use client';

import { PaginatedList } from './paginated-list';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  Clock3,
  Coffee,
  GitBranch,
  HeartHandshake,
  LoaderCircle,
  Mic,
  NotebookPen,
  X,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { localInput, localToInstant } from '@/lib/calendar-time';
import { availableFor, isOpen, taskSignature, taskFactIssues } from '@/lib/planning-engine';
import {
  taskCategories,
  type DraftItem,
  type PlannedTask,
  type PlanningProposal,
  type PlanningState,
  type Simulation,
} from '@/lib/planning-types';
import type { DashboardState } from '@/lib/types';
import { WeekAhead, CareRoutines, AppointmentPreparation, AttentionDigest } from './care-ahead';

type Props = { dashboard: DashboardState; onChanged: () => void };
type Result = {
  state: PlanningState;
  simulation?: Simulation;
  drafts?: DraftItem[];
};
type Action = (
  action: string,
  payload?: Record<string, unknown>,
) => Promise<Result | null>;
const field = 'grid gap-2 text-sm font-medium';
const selectStyle =
  'min-h-10 min-w-0 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring';
const panel = 'care-organizer-panel min-w-0 rounded-2xl border p-5 md:p-6';
const when = (iso: string, zone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: zone,
  }).format(new Date(iso));
const formText = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};
const future = (minutes: number) =>
  new Date(
    Math.ceil(Date.now() / 60000) * 60000 + minutes * 60000,
  ).toISOString();

function usePlanning({ dashboard, onChanged }: Props) {
  const [state, setState] = useState<PlanningState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const recipientId = dashboard.selectedRecipient.id;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/planning?recipientId=${encodeURIComponent(recipientId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as Result & { error?: string };
        if (!response.ok) throw new Error(result.error);
        setState(result.state);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason.message || 'Unable to load planning.');
      });
    return () => controller.abort();
  }, [recipientId, dashboard]);
  const act: Action = async (action, payload = {}) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, action, recipientId }),
      });
      const result = (await response.json()) as Result & { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'Unable to complete this action.');
      setState(result.state);
      if (!['extract', 'simulate'].includes(action)) {
        setMessage(
          action === 'acknowledge'
            ? 'Handover acknowledged.'
            : action.startsWith('propose_') || action === 'preview_relief'
              ? 'Proposal ready for review below. No responsibilities changed.'
            : 'Saved to the care plan.',
        );
        onChanged();
      }
      return result as Result;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to complete this action.',
      );
      return null;
    } finally {
      setBusy(false);
    }
  };
  return {
    state,
    act,
    busy,
    error,
    setError,
    message,
    writable:
      dashboard.currentUser.role !== 'viewer' &&
      dashboard.consent.status === 'active',
  };
}
function Notice({ error, message }: { error: string; message: string }) {
  return (
    <>
      {error && (
        <p
          role="alert"
          className="my-4 rounded-xl border border-destructive bg-background p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {message && (
        <output className="my-4 block text-sm text-primary">{message}</output>
      )}
    </>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed p-5 text-sm leading-6 text-muted-foreground">
      {children}
    </p>
  );
}
function DateField({
  label,
  value,
  onChange,
  zone,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  zone: string;
}) {
  return (
    <label className={field}>
      {label}
      <Input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
      <span className="text-xs font-normal text-muted-foreground">{zone}</span>
    </label>
  );
}

export function CarePlanning(props: Props) {
  const { dashboard } = props;
  const { state, act, busy, error, setError, message, writable } =
    usePlanning(props);
  const [tab, setTab] = useState('week');
  const [renderTime] = useState(() => Date.now());
  const zone = dashboard.selectedRecipient.timezone;
  const [start, setStart] = useState(() => localInput(future(60), zone));
  const [end, setEnd] = useState(() => localInput(future(240), zone));
  const [taskId, setTaskId] = useState('');
  const [newTime, setNewTime] = useState(() => localInput(future(1440), zone));
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [minutes, setMinutes] = useState(20);
  const tabs = [
    { id: 'week', title: 'Your week ahead', icon: Clock3 },
    { id: 'routines', title: 'Recurring care', icon: Check },
    { id: 'visits', title: 'Visit preparation', icon: NotebookPen },
    { id: 'attention', title: 'My attention', icon: HeartHandshake },
    { id: 'break', title: 'I need a break', icon: Coffee },
    { id: 'simulate', title: 'What if?', icon: GitBranch },
    { id: 'dump', title: 'Organize an update', icon: NotebookPen },
    { id: 'help', title: 'I can help', icon: HeartHandshake },
    { id: 'tasks', title: 'Task planning', icon: Clock3 },
  ];
  const run = async (action: string, payload: Record<string, unknown>) => {
    try {
      return await act(action, payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Check the dates.');
      return null;
    }
  };
  async function breakPlan() {
    try {
      await run('preview_relief', {
        start: localToInstant(start, zone),
        end: localToInstant(end, zone),
      });
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  async function move(propose = false) {
    try {
      const result = await run(propose ? 'propose_simulation' : 'simulate', {
        taskId,
        dueAt: localToInstant(newTime, zone),
      });
      if (result?.simulation) setSimulation(result.simulation);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <div className="care-organizer space-y-6" data-organizer-tone={["break", "help"].includes(tab) ? "peach" : ["dump", "routines"].includes(tab) ? "plum" : tab === "attention" ? "amber" : "sky"}>
      <div className="care-page-heading">
        <p className="text-sm font-medium text-primary">
          A little room to breathe
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          A little less to remember.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          See what’s coming, prepare the next steps, and share the care.
          Every change stays reviewable.
        </p>
      </div>
      <fieldset className="care-organizer-tools flex flex-wrap gap-2 rounded-2xl border p-3" aria-label="Planning tools">
        {tabs.map(({ id, title, icon: Icon }) => (
          <Button
            key={id}
            variant={tab === id ? 'default' : 'outline'}
              className="transition-none"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon />
            {title}
          </Button>
        ))}
      </fieldset>
      <Notice error={error} message={message} />
      {message.startsWith('Proposal ready') && <a className="inline-block text-sm font-medium text-primary underline underline-offset-4" href="#reviewable-plans">Go to your proposal</a>}
      {!writable && (
        <Empty>
          {dashboard.consent.status !== 'active'
            ? 'Care planning is paused while consent is withdrawn.'
            : 'You can review plans. A caregiver can prepare and approve changes.'}
        </Empty>
      )}
      {!state ? (
        <output className="text-sm">Loading care planning…</output>
      ) : (
        <>
          {tab === 'week' && <WeekAhead state={state} dashboard={dashboard} disabled={busy || !writable} act={act} navigate={setTab} />}
          {tab === 'routines' && <CareRoutines state={state} dashboard={dashboard} disabled={busy || !writable} act={act} navigate={setTab} />}
          {tab === 'visits' && <AppointmentPreparation state={state} dashboard={dashboard} disabled={busy || !writable} act={act} navigate={setTab} />}
          {tab === 'attention' && <AttentionDigest state={state} dashboard={dashboard} disabled={busy || !writable} act={act} navigate={setTab} />}
          {tab === 'break' && (
            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <div data-care-tone="peach" className={panel}>
                <Coffee className="size-8 text-primary" />
                <h2 className="mt-5 font-heading text-2xl font-semibold">
                  When do you need a break?
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  We’ll match your responsibilities with the availability your
                  care circle has shared. Your current assignments remain in
                  place until a replacement accepts.
                </p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <DateField
                    label="Break starts"
                    value={start}
                    onChange={setStart}
                    zone={zone}
                  />
                  <DateField
                    label="Break ends"
                    value={end}
                    onChange={setEnd}
                    zone={zone}
                  />
                </div>
                <Button
                  className="mt-5"
                  disabled={!writable || busy}
                  onClick={breakPlan}
                >
                  Prepare my coverage plan <ArrowRight />
                </Button>
              </div>
              <div data-care-tone="sky" className={panel}>
                <h2 className="font-heading text-xl font-semibold">
                  Coverage you can count on
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Only accepted responsibilities count as confirmed. Changed
                  times or task requirements need a fresh acceptance.
                </p>
                <div className="mt-5 space-y-3">
                  {state.tasks
                    .filter(
                      (task) =>
                        isOpen(task) &&
                        task.planning.owner_member_id === state.memberId,
                    )
                    .map((task) => (
                      <div
                        key={task.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
                      >
                        <div>
                          <p className="text-sm font-medium">{task.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {when(task.due_at, zone)}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {task.accepted ? 'Accepted' : 'Needs acceptance'}
                        </Badge>
                      </div>
                    ))}
                  {!state.tasks.some(
                    (task) =>
                      isOpen(task) &&
                      task.planning.owner_member_id === state.memberId,
                  ) && (
                    <Empty>
                      Choose your responsibilities in Task planning to start a
                      coverage plan.
                    </Empty>
                  )}
                </div>
              </div>
            </section>
          )}
          {tab === 'simulate' && (
            <section data-care-tone="sky" className={panel}>
              <h2 className="font-heading text-2xl font-semibold">
                Try a different time
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Linked responsibilities move together. The preview checks shared
                availability and overlapping work within this care plan.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className={field}>
                  Responsibility to move
                  <select
                    className={selectStyle}
                    value={taskId}
                    onChange={(e) => {
                      setTaskId(e.target.value);
                      setSimulation(null);
                    }}
                  >
                    <option value="">Choose a responsibility</option>
                    {state.tasks.filter(isOpen).map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </label>
                <DateField
                  label="Try this time"
                  value={newTime}
                  onChange={(value) => {
                    setNewTime(value);
                    setSimulation(null);
                  }}
                  zone={zone}
                />
              </div>
              <Button
                className="mt-4"
                disabled={busy || !writable || !taskId}
                onClick={() => move()}
              >
                Preview the ripple effect
              </Button>
              {simulation && (
                <div className="mt-6 space-y-5">
                  <ol className="border-l-2 border-primary/30 pl-5">
                    {simulation.changes.map((change) => (
                      <li key={change.taskId} className="relative pb-5">
                        <span className="absolute top-1 -left-[27px] size-3 rounded-full bg-primary" />
                        <p className="font-medium">{change.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {when(change.before, zone)}{' '}
                          <ArrowRight className="inline size-3" />{' '}
                          {when(change.after, zone)}
                        </p>
                      </li>
                    ))}
                  </ol>
                  {simulation.conflicts.length ? (
                    <div className="space-y-2">
                      <h3 className="font-medium">Resolve before applying</h3>
                      {simulation.conflicts.map((conflict) => (
                        <p key={conflict} className="text-sm text-destructive">
                          {conflict}
                        </p>
                      ))}
                      {simulation.alternatives.map((option) => (
                        <Button
                          key={option.dueAt}
                          variant="outline"
                          onClick={() => {
                            setNewTime(localInput(option.dueAt, zone));
                            setSimulation(null);
                          }}
                        >
                          Try {option.label}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-primary">
                      No conflicts found in the shared availability and
                      responsibilities.
                    </p>
                  )}
                  <Button
                    disabled={
                      busy || !writable || !!simulation.conflicts.length
                    }
                    onClick={() => move(true)}
                  >
                    Prepare changes for approval
                  </Button>
                </div>
              )}
            </section>
          )}
          {tab === 'dump' && (
            <BrainDump
              state={state}
              zone={zone}
              act={act}
              disabled={!writable || busy}
              onError={setError}
            />
          )}
          {tab === 'help' && (
            <div className="grid gap-6 xl:grid-cols-2">
              <AvailabilityEditor
                state={state}
                zone={zone}
                act={act}
                disabled={!writable || busy}
                onError={setError}
              />
              <section data-care-tone="peach" className={panel}>
                <HeartHandshake className="size-7 text-primary" />
                <h2 className="mt-3 font-heading text-2xl font-semibold">
                  One small thing helps.
                </h2>
                <label className={`${field} mt-4`}>
                  Time I can contribute
                  <select
                    className={selectStyle}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                  >
                    {[10, 20, 30, 60].map((n) => (
                      <option key={n} value={n}>
                        {n} minutes
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mt-3 text-sm text-muted-foreground">
                  These unassigned tasks fit your shared availability,
                  capabilities, and time budget.
                </p>
                <div className="mt-4 space-y-3">
                  {state.tasks
                    .filter(
                      (task) =>
                        isOpen(task) &&
                        !task.planning.owner_member_id &&
                        task.owner === 'Unassigned' &&
                        task.planning.duration_minutes <= minutes &&
                        !taskFactIssues(task, state.memories, renderTime).length &&
                        Date.parse(task.due_at) > renderTime &&
                        availableFor(
                          task,
                          state.memberId,
                          state.availability,
                          state.tasks,
                        ),
                    )
                    .map((task) => (
                      <div className="rounded-xl border p-4" key={task.id}>
                        <p className="font-medium">{task.title}</p>
                        <p className="my-2 text-xs text-muted-foreground">
                          {task.planning.duration_minutes} minutes ·{' '}
                          {when(task.due_at, zone)}
                        </p>
                        <Button
                          disabled={busy || !writable}
                          onClick={() => act('claim_task', { taskId: task.id })}
                        >
                          I’ll take this
                        </Button>
                      </div>
                    ))}
                  <p className="text-xs leading-5 text-muted-foreground">
                    No matching task? Share another time window or ask your care
                    circle to add a small responsibility.
                  </p>
                </div>
              </section>
            </div>
          )}
          {tab === 'tasks' && (
            <section className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Set the duration, caregiver, and dependencies that make coverage
                and simulations useful. Default durations are estimates; review
                them here.
              </p>
              <PaginatedList label="Task planning" records={state.tasks.filter(isOpen)} resetKey={dashboard.selectedRecipient.id}>{state.tasks.filter(isOpen).map((task) => (
                <TaskPlanning
                  key={`${task.id}:${taskSignature(task)}:${task.accepted}`}
                  task={task}
                  state={state}
                  act={act}
                  disabled={!writable || busy}
                />
              ))}</PaginatedList>
              {!state.tasks.some(isOpen) && (
                <Empty>Add a responsibility to begin planning.</Empty>
              )}
            </section>
          )}
          <section className="space-y-4">
            <h2 className="font-heading text-xl font-semibold">
              Requests waiting for you
            </h2>
            <PaginatedList label="Coverage requests" records={state.offers
              .filter(
                (offer) =>
                  offer.member_id === state.memberId &&
                  offer.status === 'pending',
              )} resetKey={dashboard.selectedRecipient.id}>{state.offers
              .filter(
                (offer) =>
                  offer.member_id === state.memberId &&
                  offer.status === 'pending',
              )
              .map((offer) => (
                <div
                  key={offer.id}
                  className={`${panel} flex flex-wrap items-center justify-between gap-4`}
                >
                  <div>
                    <p className="font-medium">
                      {
                        state.tasks.find((task) => task.id === offer.task_id)
                          ?.title
                      }
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      A caregiver has asked you to cover this responsibility.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={!writable || busy}
                      onClick={() => act('decline_offer', { id: offer.id })}
                    >
                      Decline
                    </Button>
                    <Button
                      disabled={!writable || busy}
                      onClick={() => act('accept_offer', { id: offer.id })}
                    >
                      Accept coverage
                    </Button>
                  </div>
                </div>
              ))}</PaginatedList>
            {!state.offers.some(
              (offer) =>
                offer.member_id === state.memberId &&
                offer.status === 'pending',
            ) && <Empty>No coverage requests are waiting for you.</Empty>}
          </section>
          <section className="space-y-4" id="reviewable-plans">
            <h2 className="font-heading text-xl font-semibold">
              Reviewable plans
            </h2>
            <PaginatedList label="Reviewable plans" records={state.proposals} resetKey={dashboard.selectedRecipient.id}>{state.proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                state={state}
                zone={zone}
                act={act}
                disabled={!writable || busy}
              />
            ))}</PaginatedList>
            {!state.proposals.length && (
              <Empty>
                Your coverage plans, simulations, and organized updates will
                appear here for review.
              </Empty>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function TaskPlanning({
  task,
  state,
  act,
  disabled,
}: {
  task: PlannedTask;
  state: PlanningState;
  act: Action;
  disabled: boolean;
}) {
  const caregivers = state.members.filter((member) => member.role !== 'viewer');
  return (
    <form
      data-care-tone={task.category === "medication" ? "plum" : ["transport", "appointment", "mobility"].includes(task.category) ? "sky" : "peach"}
      className={panel}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void act('save_task_details', {
          taskId: task.id,
          ownerMemberId: data.get('owner'),
          durationMinutes: Number(data.get('duration')),
          dependsOn: data.get('dependency'),
          backupMemberId: data.get('backup'),
          factIds: data.getAll('factIds'),
          requirements: formText(data, 'requirements')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        });
      }}
    >
      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="font-heading text-lg font-semibold">{task.title}</h3>
        <Badge variant="outline">
          {task.accepted ? 'Accepted' : 'Needs acceptance'}
        </Badge>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className={field}>
          Caregiver
          <select
            className={selectStyle}
            name="owner"
            defaultValue={task.planning.owner_member_id}
          >
            <option value="">Unassigned</option>
            {caregivers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name} ({m.email})
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`duration-${task.id}`} className={field}>
          Duration in minutes
          <Input
            id={`duration-${task.id}`}
            name="duration"
            type="number"
            min={5}
            max={480}
            defaultValue={task.planning.duration_minutes}
            required
          />
        </label>
        <label className={field}>
          Moves with
          <select
            className={selectStyle}
            name="dependency"
            defaultValue={task.planning.depends_on}
          >
            <option value="">Independent task</option>
            {state.tasks
              .filter((t) => t.id !== task.id && isOpen(t))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
        </label>
        <label className={field}>
          Preferred backup
          <select
            className={selectStyle}
            name="backup"
            defaultValue={task.planning.backup_member_id}
          >
            <option value="">No preference</option>
            {caregivers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label htmlFor={`requirements-${task.id}`} className={`${field} mt-4`}>
        Required capabilities, separated by commas
        <Input
          id={`requirements-${task.id}`}
          name="requirements"
          defaultValue={task.planning.requirements.join(', ')}
          placeholder="e.g. accessible vehicle"
        />
      </label>
      {!!state.memories.length && <fieldset className="mt-4"><legend className="text-sm font-medium">Care facts this task depends on</legend><div className="mt-2 space-y-2">{state.memories.map((memory) => <label key={memory.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" name="factIds" value={memory.id} defaultChecked={task.planning.fact_ids?.includes(memory.id)} />{memory.value}</label>)}</div></fieldset>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" variant="outline" disabled={disabled}>
          Save task planning
        </Button>
        {task.planning.owner_member_id === state.memberId && !task.accepted && (
          <Button
            type="button"
            disabled={disabled}
            onClick={() => act('accept_task', { taskId: task.id })}
          >
            Accept responsibility
          </Button>
        )}
      </div>
    </form>
  );
}

function AvailabilityEditor({
  state,
  zone,
  act,
  disabled,
  onError,
}: {
  state: PlanningState;
  zone: string;
  act: Action;
  disabled: boolean;
  onError: (error: string) => void;
}) {
  const [start, setStart] = useState(() => localInput(future(60), zone));
  const [end, setEnd] = useState(() => localInput(future(120), zone));
  return (
    <section data-care-tone="sky" className={panel}>
      <h2 className="font-heading text-2xl font-semibold">
        When can you help?
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Share a window with this care circle. Choose the types of tasks you can
        take and any capabilities you can offer.
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          try {
            void act('save_availability', {
              start: localToInstant(start, zone),
              end: localToInstant(end, zone),
              categories: data.getAll('categories'),
              capabilities: formText(data, 'capabilities')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            });
          } catch (reason) {
            onError((reason as Error).message);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField
            label="Available from"
            value={start}
            onChange={setStart}
            zone={zone}
          />
          <DateField
            label="Available until"
            value={end}
            onChange={setEnd}
            zone={zone}
          />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            Tasks I can help with
          </legend>
          <div className="flex flex-wrap gap-3">
            {taskCategories.map((category) => (
              <label
                key={category}
                className="flex items-center gap-2 text-sm capitalize"
              >
                <input
                  className="size-4 accent-primary"
                  name="categories"
                  type="checkbox"
                  value={category}
                  defaultChecked
                />
                {category}
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor={'availability-capabilities'} className={field}>
          Capabilities, separated by commas
          <Input
            id={'availability-capabilities'}
            name="capabilities"
            placeholder="e.g. accessible vehicle"
          />
        </label>
        <Button type="submit" disabled={disabled}>
          Share my availability
        </Button>
      </form>
      <div className="mt-5 space-y-3">
        {state.availability.map((window) => (
          <div
            key={window.id}
            className="flex items-start justify-between gap-3 border-t pt-3"
          >
            <div>
              <p className="text-sm font-medium">
                {state.members.find((m) => m.id === window.member_id)
                  ?.display_name ?? 'Caregiver'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {when(window.start_at, zone)} – {when(window.end_at, zone)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {window.categories.join(', ')}
              </p>
            </div>
            {window.member_id === state.memberId && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove availability"
                disabled={disabled}
                onClick={() => act('remove_availability', { id: window.id })}
              >
                <X />
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

type Recognition = {
  start: () => void;
  stop: () => void;
  lang: string;
  onresult:
    | ((event: {
        results: { [key: number]: { [key: number]: { transcript: string } } };
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
function BrainDump({
  state,
  zone,
  act,
  disabled,
  onError,
}: {
  state: PlanningState;
  zone: string;
  act: Action;
  disabled: boolean;
  onError: (message: string) => void;
}) {
  const [message, setMessage] = useState(''),
    [drafts, setDrafts] = useState<DraftItem[]>([]),
    [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  useEffect(
    () => () => {
      if (recognition.current) {
        recognition.current.onresult = null;
        recognition.current.onend = null;
        recognition.current.stop();
      }
    },
    [],
  );
  useEffect(() => {
    if (disabled && recognition.current) recognition.current.stop();
  }, [disabled]);
  function voice() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const voiceWindow = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Constructor =
      voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if (!Constructor) {
      onError(
        'Voice input is unavailable in this browser. Type or paste your update below.',
      );
      return;
    }
    const instance = new Constructor();
    instance.lang = 'en-CA';
    instance.onresult = (event) => {
      setMessage(
        (current) =>
          `${current}${current ? '\n' : ''}${event.results[0][0].transcript}`,
      );
      setDrafts([]);
    };
    instance.onend = () => setListening(false);
    instance.onerror = () => {
      setListening(false);
      onError(
        'Voice input stopped. Check microphone permission or type your update.',
      );
    };
    recognition.current = instance;
    try {
      instance.start();
      setListening(true);
    } catch {
      onError('Microphone unavailable. Type or paste your update.');
    }
  }
  function change(index: number, patch: Partial<DraftItem>) {
    setDrafts((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  return (
    <section data-care-tone="plum" className={panel}>
      <h2 className="font-heading text-2xl font-semibold">
        Get it out of your head.
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Speak, type, or paste an update. Review each proposed responsibility and
        confirm missing details before adding it to the plan.
      </p>
      <label htmlFor={'care-update'} className={`${field} mt-5`}>
        Your care update
        <Textarea
          id={'care-update'}
          className="min-h-32"
          maxLength={4000}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setDrafts([]);
          }}
          placeholder="The physiotherapy appointment moved to Friday at 3 PM; Alex can’t drive; confirm pharmacy pickup tomorrow at 10 AM."
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={disabled || !message.trim()}
          onClick={async () => {
            const result = await act('extract', { message });
            if (result?.drafts) setDrafts(result.drafts);
          }}
        >
          Organize my update
        </Button>
        <Button variant="outline" disabled={disabled} onClick={voice}>
          <Mic />
          {listening ? 'Stop recording' : 'Speak an update'}
        </Button>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Drafts are extracted locally by rules. No raw audio is stored. Your
        browser’s speech service may process audio when voice input is used.
      </p>
      {!!drafts.length && (
        <div className="mt-6 space-y-4">
          {drafts.map((draft, index) => (
            <article key={index} className="space-y-3 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <blockquote className="border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
                  {draft.source}
                </blockquote>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove draft ${index + 1}`}
                  onClick={() =>
                    setDrafts((items) => items.filter((_, i) => i !== index))
                  }
                >
                  <X />
                </Button>
              </div>
              {draft.question && (
                <p className="text-sm font-medium text-primary">
                  {draft.question}
                </p>
              )}
              <label className={field}>
                Action
                <select
                  className={selectStyle}
                  value={draft.kind}
                  onChange={(e) =>
                    change(index, {
                      kind: e.target.value as DraftItem['kind'],
                      taskId: '',
                    })
                  }
                >
                  <option value="create">Create a responsibility</option>
                  <option value="reschedule">
                    Reschedule a responsibility
                  </option>
                </select>
              </label>
              {draft.kind === 'reschedule' ? (
                <label className={field}>
                  Which responsibility?
                  <select
                    className={selectStyle}
                    value={draft.taskId}
                    onChange={(e) =>
                      change(index, {
                        taskId: e.target.value,
                        title:
                          state.tasks.find((t) => t.id === e.target.value)
                            ?.title ?? '',
                      })
                    }
                  >
                    <option value="">Choose one</option>
                    {state.tasks.filter(isOpen).map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                        {task.calendarLinked ? ' — use Calendar' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label htmlFor={`draft-title-${index}`} className={field}>
                  Responsibility title
                  <Input
                    id={`draft-title-${index}`}
                    value={draft.title}
                    maxLength={200}
                    onChange={(e) => change(index, { title: e.target.value })}
                  />
                </label>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={field}>
                  Confirmed date and time
                  <Input
                    type="datetime-local"
                    aria-label={`Draft ${index + 1} date and time`}
                    defaultValue={
                      draft.dueAt ? localInput(draft.dueAt, zone) : ''
                    }
                    onChange={(e) => {
                      try {
                        change(index, {
                          dueAt: e.target.value
                            ? localToInstant(e.target.value, zone)
                            : '',
                        });
                      } catch (reason) {
                        change(index, { dueAt: '' });
                        onError((reason as Error).message);
                      }
                    }}
                  />
                  <span className="text-xs text-muted-foreground">{zone}</span>
                </label>
                <label className={field}>
                  Category
                  <select
                    className={selectStyle}
                    value={draft.category}
                    onChange={(e) =>
                      change(index, { category: e.target.value })
                    }
                  >
                    {taskCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </article>
          ))}
          <Button
            disabled={
              disabled ||
              drafts.some(
                (draft) =>
                  !draft.dueAt ||
                  !draft.title.trim() ||
                  (draft.kind === 'reschedule' && !draft.taskId),
              )
            }
            onClick={async () => {
              const result = await act('propose_dump', { drafts });
              if (result) {
                setDrafts([]);
                setMessage('');
              }
            }}
          >
            Prepare reviewed items for approval
          </Button>
        </div>
      )}
    </section>
  );
}

function ProposalCard({
  proposal,
  state,
  zone,
  act,
  disabled,
}: {
  proposal: PlanningProposal;
  state: PlanningState;
  zone: string;
  act: Action;
  disabled: boolean;
}) {
  const payload = proposal.payload;
  return (
    <article data-care-tone={proposal.status === "pending" ? "amber" : "sky"} className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-lg font-semibold">{payload.title}</h3>
        <Badge variant="outline">
          {proposal.status === 'applied' && proposal.kind === 'relief'
            ? 'Coverage requested'
            : proposal.status}
        </Badge>
      </div>
      {payload.start && payload.end && (
        <p className="mt-2 text-sm text-muted-foreground">
          {when(payload.start, zone)} – {when(payload.end, zone)}
        </p>
      )}
      <div className="mt-4 space-y-3">
        {payload.preferenceEvidence && <p className="text-sm text-muted-foreground">Preferred hours: {payload.preferenceEvidence.start_hour}:00–{payload.preferenceEvidence.end_hour}:00. Verified source: {payload.preferenceEvidence.memory_value}</p>}
        {payload.coverage?.map((item) => {
          const task = state.tasks.find((task) => task.id === item.taskId),
            offer = state.offers.find(
              (offer) =>
                offer.proposal_id === proposal.id &&
                offer.task_id === item.taskId,
            );
          const currentAcceptance =
            offer?.status === 'accepted' &&
            task?.accepted &&
            task.planning.owner_member_id === item.memberId;
          return (
            <div key={item.taskId} className="rounded-xl bg-muted/50 p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="text-sm font-medium">
                  {task?.title ??
                    payload.baseline.find((task) => task.id === item.taskId)
                      ?.title}
                </p>
                <Badge variant="outline">
                  {currentAcceptance
                    ? 'Confirmed coverage'
                    : offer?.status === 'accepted'
                      ? 'Changed — review again'
                      : (offer?.status ??
                        (item.memberId ? 'Proposed' : 'Needs help'))}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {item.reason}
              </p>
            </div>
          );
        })}
        {payload.changes?.map((change) => (
          <div
            key={change.taskId}
            className="border-l-2 border-primary/30 pl-3"
          >
            <p className="text-sm font-medium">{change.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {when(change.before, zone)} → {when(change.after, zone)}
            </p>
          </div>
        ))}
        {payload.drafts?.map((draft, index) => (
          <div key={index} className="rounded-xl bg-muted/50 p-4">
            <p className="text-sm font-medium">
              {draft.kind === 'create' ? 'Add' : 'Reschedule'}: {draft.title}
            </p>
            <p className="mt-1 text-xs">{when(draft.dueAt, zone)}</p>
            <blockquote className="mt-2 text-xs text-muted-foreground">
              Source: {draft.source}
            </blockquote>
          </div>
        ))}
      </div>
      {payload.handover && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">
            Handover prepared with this request
          </summary>
          <p className="my-3 text-xs text-muted-foreground">
            Snapshot at {when(proposal.created_at, zone)}. Check the live
            Handover for subsequent changes.
          </p>
          <ul className="space-y-2">
            {payload.handover
              .filter(
                (entry) =>
                  entry.kind === 'Profile' ||
                  entry.kind === 'Support contact' ||
                  entry.kind === 'Review priority',
              )
              .map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.label}:</strong> {entry.detail}
                </li>
              ))}
          </ul>
        </details>
      )}
      {proposal.status === 'pending' && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            disabled={disabled}
            onClick={() => act('apply_proposal', { id: proposal.id })}
          >
            <Check />
            {proposal.kind === 'relief'
              ? 'Approve coverage requests'
              : 'Approve and apply'}
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => act('reject_proposal', { id: proposal.id })}
          >
            Decline plan
          </Button>
        </div>
      )}
    </article>
  );
}

export function SinceAway(props: Props) {
  const { state, act, busy, error, message } = usePlanning(props);
  if (!state) return null;
  return (
    <section data-care-tone="sky" className={`${panel} mb-6 border-primary/30`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">
            Your personal handover
          </p>
          <h2 className="mt-1 font-heading text-2xl font-semibold">
            {state.handover.acknowledgedAt
              ? `${state.handover.changes.length} ${state.handover.changes.length === 1 ? 'change' : 'changes'} since you were away`
              : 'Start with the current picture'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {state.handover.acknowledgedAt
              ? `Last acknowledged ${when(state.handover.acknowledgedAt, props.dashboard.selectedRecipient.timezone)}. Changes below compare the current plan with what you last acknowledged.`
              : 'Review the live handover below, then acknowledge it. Your next visit will highlight what changed.'}
          </p>
        </div>
        <Button
          disabled={busy || props.dashboard.consent.status !== 'active'}
          onClick={() =>
            act('acknowledge', {
              snapshot: JSON.stringify(state.handover.snapshot),
            })
          }
        >
          {busy ? <LoaderCircle className="animate-spin" /> : <Check />}I’ve
          reviewed this handover
        </Button>
      </div>
      <Notice error={error} message={message} />
      <div className="mt-4 space-y-3">
        {state.handover.changes.map((change) => (
          <article key={change.id} className="rounded-xl bg-muted/60 p-4">
            <p className="text-xs font-medium text-primary">
              {change.kind} ·{' '}
              {change.before === null
                ? 'Added'
                : change.after === null
                  ? 'Removed'
                  : 'Changed'}
            </p>
            <h3 className="mt-1 text-sm font-semibold">{change.label}</h3>
            {change.before && (
              <p className="mt-2 text-sm text-muted-foreground">
                <strong>Before:</strong> {change.before}
              </p>
            )}
            {change.after && (
              <p className="mt-1 text-sm">
                <strong>Now:</strong> {change.after}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function MemoryConflicts(props: Props) {
  const [renderTime] = useState(() => Date.now());
  const { state, act, busy, error, setError, message, writable } =
    usePlanning(props);
  if (!state) return null;
  const zone = props.dashboard.selectedRecipient.timezone;
  return (
    <section data-care-tone="plum" className={`${panel} mb-6`}>
      <h2 className="font-heading text-xl font-semibold">
        Keep care facts in agreement
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Give related facts the same subject and attribute, such as “Northside
        Pharmacy” and “Closing time”. Different current values are held for
        verification.
      </p>
      <Notice error={error} message={message} />
      <div className="mt-4 space-y-4">
        {state.conflicts.map((conflict) => (
          <form
            className="rounded-xl border border-destructive/40 p-4"
            key={conflict.key}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void act('resolve_conflict', {
                key: conflict.key,
                memoryId: data.get('memoryId'),
                source: data.get('source'),
              });
            }}
          >
            <h3 className="font-semibold">
              {conflict.subject} · {conflict.attribute}
            </h3>
            <fieldset className="mt-3 space-y-3">
              <legend className="mb-2 text-sm">
                Which value have you verified?
              </legend>
              {conflict.records.map((memory) => (
                <label
                  key={memory.id}
                  className="flex items-start gap-3 text-sm"
                >
                  <input
                    className="mt-1"
                    type="radio"
                    name="memoryId"
                    value={memory.id}
                    required
                  />
                  <span>
                    {memory.value}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {memory.source} · {when(memory.updated_at, zone)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label
              htmlFor={`verify-${conflict.key}`}
              className={`${field} mt-4`}
            >
              How did you verify it?
              <Input
                id={`verify-${conflict.key}`}
                name="source"
                placeholder="e.g. Confirmed by phone with pharmacy today"
                maxLength={200}
                required
              />
            </label>
            <p className="mt-3 text-xs text-muted-foreground">
              The selected fact becomes verified. Other conflicting values are
              archived and linked to their replacement.
            </p>
            <Button className="mt-3" disabled={!writable || busy}>
              Confirm verified value
            </Button>
          </form>
        ))}
        {!state.conflicts.length && (
          <p className="text-sm text-primary">
            No conflicts found among the structured, current facts.
          </p>
        )}
      </div>
      <details className="mt-5">
        <summary className="cursor-pointer text-sm font-medium">
          Describe facts and review expiry dates
        </summary>
        <div className="mt-4 space-y-4">
          {state.memories.map((memory) => (
            <form
              key={memory.id}
              className="rounded-xl border p-4"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                try {
                  void act('describe_fact', {
                    memoryId: memory.id,
                    subject: data.get('subject'),
                    attribute: data.get('attribute'),
                    validUntil: data.get('validUntil')
                      ? localToInstant(formText(data, 'validUntil'), zone)
                      : '',
                  });
                } catch (reason) {
                  setError((reason as Error).message);
                }
              }}
            >
              <p className="text-sm font-medium">{memory.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Source: {memory.source}
                {memory.fact?.valid_until &&
                Date.parse(memory.fact.valid_until) <= renderTime
                  ? ' · Expired — verify before using'
                  : ''}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label htmlFor={`subject-${memory.id}`} className={field}>
                  Subject
                  <Input
                    id={`subject-${memory.id}`}
                    name="subject"
                    defaultValue={memory.fact?.subject}
                    required
                    maxLength={100}
                  />
                </label>
                <label htmlFor={`attribute-${memory.id}`} className={field}>
                  Attribute
                  <Input
                    id={`attribute-${memory.id}`}
                    name="attribute"
                    defaultValue={memory.fact?.attribute}
                    required
                    maxLength={100}
                  />
                </label>
                <label className={field}>
                  Valid until ({zone})
                  <Input
                    name="validUntil"
                    type="datetime-local"
                    defaultValue={
                      memory.fact?.valid_until
                        ? localInput(memory.fact.valid_until, zone)
                        : ''
                    }
                  />
                </label>
              </div>
              <Button
                className="mt-3"
                variant="outline"
                disabled={!writable || busy}
              >
                Save fact context
              </Button>
            </form>
          ))}
        </div>
      </details>
    </section>
  );
}
