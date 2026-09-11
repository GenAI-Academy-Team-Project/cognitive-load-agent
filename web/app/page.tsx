'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity, AlertTriangle, BrainCircuit, CalendarDays, Check, CheckCircle2,
  ChevronRight, CircleUserRound, ClipboardCheck, Clock3, HeartPulse,
  LayoutDashboard, ListChecks, LoaderCircle, MemoryStick, Pill, Plus,
  Archive, LockKeyhole, Pencil, Route, ShieldCheck, Sparkles, UserPlus, Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import type { CareTask, DashboardState, MemoryRecord, Risk } from '@/lib/types';

type View = 'Overview' | 'Responsibilities' | 'Timeline' | 'Memory' | 'Care circle' | 'Evaluations';

const navItems: { label: View; icon: typeof Activity }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Responsibilities', icon: ClipboardCheck },
  { label: 'Timeline', icon: CalendarDays },
  { label: 'Memory', icon: MemoryStick },
  { label: 'Care circle', icon: Users },
  { label: 'Evaluations', icon: BrainCircuit },
];

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-CA', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Toronto',
  }).format(new Date(value));

export default function Home() {
  const [view, setView] = useState<View>('Overview');
  const [state, setState] = useState<DashboardState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [taskDialog, setTaskDialog] = useState<CareTask | 'new' | null>(null);
  const [memoryDialog, setMemoryDialog] = useState<MemoryRecord | 'new' | null>(null);
  const [memberOpen, setMemberOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/state')
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load care state');
        return response.json() as Promise<DashboardState>;
      })
      .then((nextState) => { if (active) setState(nextState); })
      .catch(() => { if (active) setMessage('The care plan could not be loaded.'); });
    return () => { active = false; };
  }, []);

  async function act(action: string, payload: Record<string, string> = {}, success: string) {
    setBusy(action);
    try {
      const response = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json() as DashboardState | { error: string };
      if (!response.ok) throw new Error('error' in result ? result.error : 'Action failed');
      setState(result as DashboardState);
      setMessage(success);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That action could not be completed.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const openTasks = state?.tasks.filter((task) => task.status !== 'complete').length ?? 0;
  const resolvedRisks = state?.risks.filter((risk) => risk.status === 'resolved').length ?? 0;
  const coverage = useMemo(() => {
    if (!state?.tasks.length) return 0;
    const covered = state.tasks.filter((task) => task.owner !== 'Unassigned').length;
    return Math.round((covered / state.tasks.length) * 100);
  }, [state]);

  const pendingApproval = state?.approvals.find((approval) => approval.status === 'pending');
  const writeAllowed = state ? state.currentUser.role !== 'viewer' : false;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen max-w-[1540px] lg:grid-cols-[252px_1fr]">
        <aside className="hidden border-r border-sidebar-border bg-sidebar px-5 py-6 lg:flex lg:flex-col">
          <Brand />
          <nav className="mt-9 space-y-1" aria-label="Primary navigation">
            {navItems.map(({ label, icon: Icon }) => (
              <button key={label} onClick={() => setView(label)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${view === label ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'}`}>
                <Icon className="size-[18px]" />{label}
              </button>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-sidebar-border bg-white/65 p-4">
            <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Care coverage</span><span className="text-xs font-semibold text-primary">{coverage}%</span></div>
            <Progress value={coverage} className="[&_[data-slot=progress-indicator]]:bg-primary" />
            <p className="mt-3 text-sm font-medium">{state ? `${state.tasks.length - openTasks} of ${state.tasks.length} tasks settled` : 'Loading care plan'}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Shared responsibilities stay visible and accountable.</p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="flex min-h-[76px] items-center justify-between border-b bg-background/95 px-5 py-3 backdrop-blur md:px-8">
            <div className="lg:hidden"><Brand /></div>
            <div className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex"><Activity className="size-4 text-primary" />Care plan monitoring is active</div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => act('run_check', {}, 'Care plan checked and evaluation trace saved.')} disabled={!!busy || !writeAllowed}>
                {busy === 'run_check' ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Run care check
              </Button>
              {state && <div className="hidden text-right sm:block"><p className="text-xs font-medium">{state.currentUser.displayName}</p><p className="text-[10px] capitalize text-muted-foreground">{state.currentUser.role}</p></div>}
              <span className="grid size-9 place-items-center rounded-full bg-[#d9eadf] text-sm font-semibold text-[#315944]" aria-label="Signed-in account">{state?.currentUser.displayName.slice(0, 2).toUpperCase() ?? '—'}</span>
            </div>
          </header>

          <div className="border-b px-4 py-2 lg:hidden">
            <div className="flex gap-1 overflow-x-auto">
              {navItems.map(({ label, icon: Icon }) => <button key={label} onClick={() => setView(label)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${view === label ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}><Icon className="size-4" />{label}</button>)}
            </div>
          </div>

          <div className="px-5 py-7 md:px-8 md:py-9">
            {!state ? <LoadingState /> : (
              <>
                {view === 'Overview' && <Overview state={state} openTasks={openTasks} coverage={coverage} resolvedRisks={resolvedRisks} onAdd={() => setTaskDialog('new')} onApprove={() => setApprovalOpen(true)} onAssign={() => act('assign_ride', {}, 'Maya was assigned to the physiotherapy ride.')} busy={busy} writeAllowed={writeAllowed} />}
                {view === 'Responsibilities' && <Responsibilities tasks={state.tasks} onAdd={() => setTaskDialog('new')} onEdit={setTaskDialog} onComplete={(id) => act('complete_task', { id }, 'Responsibility marked complete.')} onArchive={(id) => act('archive_task', { id }, 'Responsibility archived.')} busy={busy} writeAllowed={writeAllowed} />}
                {view === 'Timeline' && <Timeline state={state} />}
                {view === 'Memory' && <Memory state={state} onAdd={() => setMemoryDialog('new')} onEdit={setMemoryDialog} onVerify={(id) => act('verify_memory', { id }, 'Trusted fact verified.')} onArchive={(id) => act('archive_memory', { id }, 'Trusted fact archived.')} writeAllowed={writeAllowed} busy={busy} />}
                {view === 'Care circle' && <CareCircle state={state} onInvite={() => setMemberOpen(true)} onRole={(id, role) => act('update_member', { id, role }, `Member role changed to ${role}.`)} onRemove={(id) => act('archive_member', { id }, 'Member removed from the care circle.')} busy={busy} />}
                {view === 'Evaluations' && <Evaluations state={state} />}
              </>
            )}
          </div>
        </section>
      </div>

      <ApprovalDialog open={approvalOpen} onOpenChange={setApprovalOpen} approval={pendingApproval} busy={busy} onApprove={async () => { if (!pendingApproval) return; await act('approve_plan', { id: pendingApproval.id }, 'Plan approved. Maya now owns the medication pickup.'); setApprovalOpen(false); }} />
      <TaskDialog key={taskDialog === 'new' ? 'new' : taskDialog?.id ?? 'closed'} open={taskDialog !== null} task={taskDialog === 'new' ? undefined : taskDialog ?? undefined} onOpenChange={(open) => { if (!open) setTaskDialog(null); }} busy={busy} onSave={async (payload) => { const ok = await act(taskDialog === 'new' ? 'add_task' : 'update_task', taskDialog !== 'new' && taskDialog ? { ...payload, id: taskDialog.id } : payload, taskDialog === 'new' ? 'Responsibility added to the shared plan.' : 'Responsibility updated.'); if (ok) setTaskDialog(null); }} />
      <MemoryDialog key={memoryDialog === 'new' ? 'new' : memoryDialog?.id ?? 'closed'} open={memoryDialog !== null} memory={memoryDialog === 'new' ? undefined : memoryDialog ?? undefined} onOpenChange={(open) => { if (!open) setMemoryDialog(null); }} busy={busy} onSave={async (payload) => { const ok = await act(memoryDialog === 'new' ? 'add_memory' : 'update_memory', memoryDialog !== 'new' && memoryDialog ? { ...payload, id: memoryDialog.id } : payload, memoryDialog === 'new' ? 'Trusted fact added for review.' : 'Trusted fact updated.'); if (ok) setMemoryDialog(null); }} />
      <MemberDialog open={memberOpen} onOpenChange={setMemberOpen} busy={busy} onInvite={async (payload) => { const ok = await act('invite_member', payload, 'Care-circle invitation recorded.'); if (ok) setMemberOpen(false); }} />
      {message && <button onClick={() => setMessage(null)} className="fixed right-4 bottom-4 z-50 flex max-w-sm items-center gap-3 rounded-2xl border bg-foreground px-4 py-3 text-left text-sm text-background shadow-xl"><CheckCircle2 className="size-4 shrink-0" />{message}</button>}
    </main>
  );
}

function Brand() {
  return <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground shadow-sm"><HeartPulse className="size-5" /></span><div><p className="font-heading text-base font-semibold tracking-tight">Carestead</p><p className="text-xs text-muted-foreground">Care coordination</p></div></div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><p className="mb-2 text-sm font-medium text-primary">{eyebrow}</p><h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] md:text-[38px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">{description}</p></div>{action}</div>;
}

function Overview({ state, openTasks, coverage, resolvedRisks, onAdd, onApprove, onAssign, busy, writeAllowed }: { state: DashboardState; openTasks: number; coverage: number; resolvedRisks: number; onAdd: () => void; onApprove: () => void; onAssign: () => void; busy: string | null; writeAllowed: boolean }) {
  return <>
    <PageHeading eyebrow="Shared care plan" title={`Good morning, ${state.currentUser.displayName}`} description="Carestead has combined the shared schedule, care responsibilities, and trusted facts into one reviewable plan." action={<Button size="lg" className="w-fit rounded-xl px-4" onClick={onAdd} disabled={!writeAllowed}><Plus /> Add responsibility</Button>} />
    <div className="mt-8 grid gap-4 md:grid-cols-3"><Metric label="Open responsibilities" value={String(openTasks)} note="Across the shared care plan" icon={ClipboardCheck} /><Metric label="Coverage this week" value={`${coverage}%`} note="Tasks with a named owner" icon={Users} /><Metric label="Risks resolved" value={String(resolvedRisks)} note="Recorded in this demo" icon={ShieldCheck} /></div>
    <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.8fr)]">
      <section><SectionHeading title="Needs your attention" subtitle="Prioritized by timing, dependency, and potential impact." /><div className="space-y-3">{state.risks.map((risk) => <RiskCard key={risk.id} risk={risk} onAction={!writeAllowed ? undefined : risk.id === 'risk-med' ? onApprove : risk.id === 'risk-ride' ? onAssign : undefined} busy={busy} />)}</div></section>
      <aside className="rounded-[22px] border bg-card p-5 shadow-[0_16px_45px_rgb(35_68_52/0.06)] md:p-6">
        <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e5f1e9] text-primary"><Sparkles className="size-5" /></span><div><p className="font-heading font-semibold">Agent briefing</p><p className="text-xs text-muted-foreground">Explainable care-state rules</p></div></div><Badge variant="outline" className="border-[#b9d5c3] bg-[#eff7f1] text-[#315944]">{state.events.length} events</Badge></div>
        <p className="mt-5 text-[15px] leading-6">The medication pickup is the most time-sensitive item. The agent has prepared a safe, reversible plan and is waiting for caregiver approval.</p>
        <div className="mt-5 space-y-3 border-t pt-4"><Evidence icon={Pill} text="Refill ready at the saved pharmacy" /><Evidence icon={Clock3} text="Pickup is due before 6:00 PM" /><Evidence icon={CircleUserRound} text="Maya is the usual pickup caregiver" /></div>
        <Button className="mt-5 w-full rounded-xl" onClick={onApprove} disabled={!writeAllowed || !state.approvals.some((item) => item.status === 'pending')}>Review recommended plan <ChevronRight /></Button>
        <p className="mt-3 text-center text-[11px] leading-4 text-muted-foreground">Carestead prepares actions; a caregiver approves any external or consequential step.</p>
      </aside>
    </div>
    <section className="mt-8 rounded-[22px] border bg-card p-5 md:p-6"><SectionHeading title="Upcoming care schedule" subtitle="A shared operational view for the care circle." /><div className="mt-5 grid gap-2 lg:grid-cols-4">{state.tasks.slice(0, 4).map((task) => <ScheduleCard key={task.id} task={task} />)}</div></section>
  </>;
}

function Responsibilities({ tasks, onAdd, onEdit, onComplete, onArchive, busy, writeAllowed }: { tasks: CareTask[]; onAdd: () => void; onEdit: (task: CareTask) => void; onComplete: (id: string) => void; onArchive: (id: string) => void; busy: string | null; writeAllowed: boolean }) {
  return <><PageHeading eyebrow="Shared plan" title="Responsibilities" description="Create, edit, complete, reassign, or archive every care obligation." action={<Button onClick={onAdd} disabled={!writeAllowed}><Plus /> Add responsibility</Button>} /><div className="mt-8 overflow-hidden rounded-[22px] border bg-card">{tasks.map((task, index) => <div key={task.id} className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center ${index ? 'border-t' : ''}`}><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${task.status === 'complete' ? 'bg-[#e5f1e9] text-primary' : 'bg-secondary text-muted-foreground'}`}>{task.status === 'complete' ? <Check className="size-5" /> : <ListChecks className="size-5" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading font-semibold">{task.title}</h3><StatusBadge value={task.status} /></div><p className="mt-1 text-sm text-muted-foreground">{formatDate(task.due_at)} · Owner: {task.owner} · {task.category}</p></div>{writeAllowed && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => onEdit(task)} disabled={!!busy}><Pencil /> Edit</Button>{task.status !== 'complete' && <Button variant="outline" size="sm" onClick={() => onComplete(task.id)} disabled={!!busy}><Check /> Complete</Button>}<Button variant="ghost" size="sm" onClick={() => onArchive(task.id)} disabled={!!busy} className="text-muted-foreground"><Archive /> Archive</Button></div>}</div>)}</div></>;
}

function Timeline({ state }: { state: DashboardState }) {
  return <><PageHeading eyebrow="Source activity" title="Care timeline" description="The event log shows what changed, where it came from, and when the agent considered it." /><div className="mt-8 rounded-[22px] border bg-card p-5 md:p-7"><div className="space-y-0">{state.events.map((event, index) => <div key={event.id} className="relative flex gap-4 pb-7 last:pb-0"><div className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full border bg-background text-primary"><Activity className="size-4" /></div>{index < state.events.length - 1 && <span className="absolute top-10 left-5 h-[calc(100%-40px)] w-px bg-border" />}<div className="pt-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading font-semibold">{event.title}</h3><Badge variant="outline">{event.source}</Badge></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{event.detail}</p><p className="mt-2 text-xs text-muted-foreground">{formatDate(event.occurred_at)}</p></div></div>)}</div></div></>;
}

function Memory({ state, onAdd, onEdit, onVerify, onArchive, writeAllowed, busy }: { state: DashboardState; onAdd: () => void; onEdit: (memory: MemoryRecord) => void; onVerify: (id: string) => void; onArchive: (id: string) => void; writeAllowed: boolean; busy: string | null }) {
  return <><PageHeading eyebrow="Structured memory" title="Trusted care facts" description="Review and correct the source-linked facts Carestead may reuse." action={<Button onClick={onAdd} disabled={!writeAllowed}><Plus /> Add trusted fact</Button>} /><div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{state.memories.map((memory) => <article key={memory.id} className="rounded-[20px] border bg-card p-5"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary"><MemoryStick className="size-5" /></span><StatusBadge value={memory.status} /></div><p className="mt-5 text-sm font-medium leading-6">{memory.value}</p><div className="mt-5 border-t pt-4 text-xs text-muted-foreground"><p>Source · {memory.source}</p><p className="mt-1">Confidence · {memory.confidence}</p><p className="mt-1">Updated · {formatDate(memory.updated_at)}</p></div>{writeAllowed && <div className="mt-4 flex flex-wrap gap-2">{memory.status !== 'verified' && <Button size="sm" variant="outline" onClick={() => onVerify(memory.id)} disabled={!!busy}><ShieldCheck /> Verify</Button>}<Button size="sm" variant="outline" onClick={() => onEdit(memory)} disabled={!!busy}><Pencil /> Edit</Button><Button size="sm" variant="ghost" onClick={() => onArchive(memory.id)} disabled={!!busy} className="text-muted-foreground"><Archive /> Archive</Button></div>}</article>)}</div><div className="mt-6 rounded-2xl border border-[#c8dfd0] bg-[#f8fcf9] p-5"><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-heading font-semibold">Memory policy</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Only stable facts and caregiver-confirmed preferences become long-term memory. Events remain in the timeline, uncertain facts are flagged for review, and every record keeps its source.</p></div></div></div></>;
}

function CareCircle({ state, onInvite, onRole, onRemove, busy }: { state: DashboardState; onInvite: () => void; onRole: (id: string, role: string) => void; onRemove: (id: string) => void; busy: string | null }) {
  const owner = state.currentUser.role === 'owner';
  return <><PageHeading eyebrow="Authenticated workspace" title="Care circle & permissions" description="Every signed-in person receives an explicit role. Authorization is enforced by the API, not only by hidden buttons." action={<Button onClick={onInvite} disabled={!owner}><UserPlus /> Invite member</Button>} /><div className="mt-8 overflow-hidden rounded-[22px] border bg-card">{state.careCircle.map((member, index) => <div key={member.id} className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center ${index ? 'border-t' : ''}`}><span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary font-heading font-semibold text-primary">{member.display_name.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading font-semibold">{member.display_name}</h3><StatusBadge value={member.status} />{member.email === state.currentUser.email && <Badge variant="outline" className="bg-[#eff7f1] text-primary">You</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{member.email}</p></div><div className="flex items-center gap-2"><select aria-label={`Role for ${member.display_name}`} value={member.role} onChange={(event) => onRole(member.id, event.target.value)} disabled={!owner || member.role === 'owner' || !!busy} className="h-9 rounded-lg border bg-background px-3 text-sm capitalize outline-none focus:ring-2 focus:ring-ring">{member.role === 'owner' && <option value="owner">Owner</option>}<option value="caregiver">Caregiver</option><option value="viewer">Viewer</option></select>{owner && member.role !== 'owner' && <Button variant="ghost" size="sm" onClick={() => onRemove(member.id)} disabled={!!busy} className="text-muted-foreground"><Archive /> Remove</Button>}</div></div>)}</div><div className="mt-6 grid gap-4 md:grid-cols-3"><PermissionCard title="Owner" text="Manages members and roles, and can change all care records." /><PermissionCard title="Caregiver" text="Creates and updates responsibilities, memories, approvals, and checks." /><PermissionCard title="Viewer" text="Can review the care plan and evidence but cannot change records." /></div><div className="mt-6 flex gap-3 rounded-2xl border border-[#c8dfd0] bg-[#f8fcf9] p-5"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-heading font-semibold">Identity and audit</p><p className="mt-1 text-sm leading-6 text-muted-foreground">The private Site supplies the signed-in user identity. Every mutation is checked server-side and attributed in the audit log.</p></div></div></>;
}

function PermissionCard({ title, text }: { title: string; text: string }) { return <article className="rounded-[20px] border bg-card p-5"><p className="font-heading font-semibold">{title}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></article>; }

function Evaluations({ state }: { state: DashboardState }) {
  const dimensions = [{ label: 'Retrieval', value: state.benchmark.retrieval }, { label: 'Decision', value: state.benchmark.decision }, { label: 'Policy', value: state.benchmark.policy }, { label: 'Action', value: state.benchmark.action }];
  return <><PageHeading eyebrow={`Benchmark ${state.benchmark.version}`} title="Measured agent quality" description={`${state.benchmark.scenarioCount} synthetic scenarios across ${state.benchmark.categories} categories. Scores are calculated from the checked-in benchmark, not placeholders.`} /><div className="mt-8 grid gap-4 md:grid-cols-4">{dimensions.map((item) => <div key={item.label} className="rounded-[20px] border bg-card p-5"><p className="text-sm text-muted-foreground">{item.label}</p><p className="mt-2 font-heading text-3xl font-semibold">{item.value}%</p><Progress value={item.value} className="mt-4 [&_[data-slot=progress-indicator]]:bg-primary" /></div>)}</div><div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground"><Badge variant="outline" className="bg-[#eff7f1] text-primary">{state.benchmark.passed} full passes</Badge><Badge variant="outline">{state.benchmark.failed} failures for improvement</Badge><span className="py-1">Failures remain visible instead of being hidden by aggregate scores.</span></div><div className="mt-6 overflow-hidden rounded-[22px] border bg-card">{state.traces.map((trace, index) => <article key={trace.id} className={`p-5 md:p-6 ${index ? 'border-t' : ''}`}><div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading font-semibold">{trace.trigger}</h3><Badge variant="outline" className="bg-[#eff7f1] text-primary">{trace.policy_status}</Badge></div><p className="mt-2 text-sm leading-6">{trace.decision}</p></div><span className="shrink-0 text-xs text-muted-foreground">{formatDate(trace.created_at)}</span></div><div className="mt-4 grid gap-3 rounded-xl bg-muted/55 p-4 text-xs md:grid-cols-3"><div><p className="font-semibold text-foreground">Evidence</p><p className="mt-1 leading-5 text-muted-foreground">{trace.evidence}</p></div><div><p className="font-semibold text-foreground">Tool</p><p className="mt-1 leading-5 text-muted-foreground">{trace.tool}</p></div><div><p className="font-semibold text-foreground">Outcome</p><p className="mt-1 leading-5 text-muted-foreground">{trace.outcome}</p></div></div></article>)}</div></>;
}

function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof Activity }) { return <div className="rounded-[20px] border bg-card p-5 shadow-[0_8px_30px_rgb(35_68_52/0.035)]"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-heading text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div><span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary"><Icon className="size-[19px]" /></span></div></div>; }

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="font-heading text-xl font-semibold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div>; }

function RiskCard({ risk, onAction, busy }: { risk: Risk; onAction?: () => void; busy: string | null }) {
  const styles = { high: 'border-[#e5c6bd] bg-[#fffaf8] text-[#8e3d2d]', medium: 'border-[#ead9ae] bg-[#fffdf6] text-[#7a5a12]', low: 'border-[#c8dfd0] bg-[#f8fcf9] text-[#315944]' }[risk.severity];
  const Icon = risk.kind === 'medication' ? Pill : risk.kind === 'transport' ? Route : CheckCircle2;
  return <article className={`flex flex-col gap-4 rounded-[20px] border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center ${styles}`}><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/80 shadow-sm"><Icon className="size-5" /></span><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-75">{risk.status.replace('_', ' ')}</p><h3 className="mt-1 font-heading text-[15px] font-semibold leading-5 text-foreground">{risk.title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{risk.detail}</p></div>{onAction && risk.status !== 'resolved' && <Button variant="outline" className="shrink-0 bg-white/75 text-foreground" onClick={onAction} disabled={!!busy}>{risk.kind === 'medication' ? 'Review plan' : 'Assign ride'} <ChevronRight /></Button>}</article>;
}

function ScheduleCard({ task }: { task: CareTask }) { return <div className="rounded-2xl border bg-[#fbfcfb] p-4"><div className="flex items-center justify-between gap-3"><span className="font-heading text-sm font-semibold">{formatDate(task.due_at)}</span><StatusBadge value={task.status} /></div><p className="mt-4 text-sm font-medium leading-5">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">Owner · {task.owner}</p></div>; }

function StatusBadge({ value }: { value: string }) { return <Badge variant="outline" className="bg-white text-[10px] capitalize">{value.replace('_', ' ')}</Badge>; }

function Evidence({ icon: Icon, text }: { icon: typeof Activity; text: string }) { return <div className="flex items-center gap-3 text-sm text-muted-foreground"><Icon className="size-4 shrink-0 text-primary" /><span>{text}</span></div>; }

function LoadingState() { return <div className="grid min-h-[60vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Loading the shared care plan…</p></div></div>; }

function ApprovalDialog({ open, onOpenChange, approval, onApprove, busy }: { open: boolean; onOpenChange: (open: boolean) => void; approval: DashboardState['approvals'][number] | undefined; onApprove: () => void; busy: string | null }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Review medication pickup plan</DialogTitle><DialogDescription>Carestead will only record this assignment after you approve it.</DialogDescription></DialogHeader><div className="rounded-xl border border-[#e5c6bd] bg-[#fffaf8] p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#8e3d2d]" /><div><p className="font-medium">Proposed action</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{approval?.action ?? 'This plan has already been decided.'}</p></div></div></div><div className="space-y-2 text-sm"><p><strong>Why:</strong> the refill is ready and the current supply is nearly finished.</p><p><strong>Guardrail:</strong> this demo records the plan locally; it does not send messages or contact the pharmacy.</p></div><DialogFooter showCloseButton><Button onClick={onApprove} disabled={!approval || !!busy}>{busy === 'approve_plan' ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}Approve plan</Button></DialogFooter></DialogContent></Dialog>;
}

function formValue(data: FormData, name: string) { const value = data.get(name); return typeof value === 'string' ? value : ''; }
function inputDate(value?: string) { return value ? value.slice(0, 16) : ''; }

function TaskDialog({ open, task, onOpenChange, onSave, busy }: { open: boolean; task?: CareTask; onOpenChange: (open: boolean) => void; onSave: (payload: Record<string, string>) => void; busy: string | null }) {
  function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ title: formValue(data, 'title'), owner: formValue(data, 'owner'), dueAt: formValue(data, 'dueAt'), category: formValue(data, 'category'), status: formValue(data, 'status') }); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><form onSubmit={submit}><DialogHeader><DialogTitle>{task ? 'Edit responsibility' : 'Add a responsibility'}</DialogTitle><DialogDescription>Keep the owner, timing, and operational state clear for the entire care circle.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><label htmlFor="task-title" className="grid gap-1.5 text-sm font-medium">Responsibility<Input id="task-title" name="title" defaultValue={task?.title} placeholder="e.g. Confirm specialist referral" required /></label><div className="grid gap-4 sm:grid-cols-2"><label htmlFor="task-owner" className="grid gap-1.5 text-sm font-medium">Owner<Input id="task-owner" name="owner" defaultValue={task?.owner} placeholder="Unassigned" /></label><label htmlFor="task-category" className="grid gap-1.5 text-sm font-medium">Category<Input id="task-category" name="category" defaultValue={task?.category} placeholder="Appointment" /></label></div><div className="grid gap-4 sm:grid-cols-2"><label htmlFor="task-due" className="grid gap-1.5 text-sm font-medium">Due date and time<Input id="task-due" name="dueAt" type="datetime-local" defaultValue={inputDate(task?.due_at)} required /></label><label htmlFor="task-status" className="grid gap-1.5 text-sm font-medium">Status<select id="task-status" name="status" defaultValue={task?.status ?? 'open'} className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="open">Open</option><option value="due_soon">Due soon</option><option value="assigned">Assigned</option><option value="scheduled">Scheduled</option><option value="complete">Complete</option></select></label></div></div><DialogFooter className="mt-5" showCloseButton><Button type="submit" disabled={!!busy}>{busy?.includes('task') ? <LoaderCircle className="animate-spin" /> : task ? <Pencil /> : <Plus />}{task ? 'Save changes' : 'Add to plan'}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function MemoryDialog({ open, memory, onOpenChange, onSave, busy }: { open: boolean; memory?: MemoryRecord; onOpenChange: (open: boolean) => void; onSave: (payload: Record<string, string>) => void; busy: string | null }) {
  function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ value: formValue(data, 'value'), kind: formValue(data, 'kind'), source: formValue(data, 'source'), confidence: formValue(data, 'confidence'), status: formValue(data, 'status') }); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><form onSubmit={submit}><DialogHeader><DialogTitle>{memory ? 'Edit trusted fact' : 'Add a trusted fact'}</DialogTitle><DialogDescription>Every reusable fact needs a source, confidence level, and review state.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><label htmlFor="memory-value" className="grid gap-1.5 text-sm font-medium">Fact<Input id="memory-value" name="value" defaultValue={memory?.value} placeholder="e.g. Maya usually handles pharmacy pickup" required /></label><div className="grid gap-4 sm:grid-cols-2"><label htmlFor="memory-kind" className="grid gap-1.5 text-sm font-medium">Type<Input id="memory-kind" name="kind" defaultValue={memory?.kind} placeholder="Preference" /></label><label htmlFor="memory-source" className="grid gap-1.5 text-sm font-medium">Source<Input id="memory-source" name="source" defaultValue={memory?.source} placeholder="Confirmed by caregiver" required /></label></div><div className="grid gap-4 sm:grid-cols-2"><label htmlFor="memory-confidence" className="grid gap-1.5 text-sm font-medium">Confidence<select id="memory-confidence" name="confidence" defaultValue={memory?.confidence ?? 'medium'} className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label><label htmlFor="memory-status" className="grid gap-1.5 text-sm font-medium">Status<select id="memory-status" name="status" defaultValue={memory?.status ?? 'review_due'} className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="review_due">Review due</option><option value="verified">Verified</option></select></label></div></div><DialogFooter className="mt-5" showCloseButton><Button type="submit" disabled={!!busy}>{busy?.includes('memory') ? <LoaderCircle className="animate-spin" /> : memory ? <Pencil /> : <Plus />}{memory ? 'Save changes' : 'Add for review'}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function MemberDialog({ open, onOpenChange, onInvite, busy }: { open: boolean; onOpenChange: (open: boolean) => void; onInvite: (payload: Record<string, string>) => void; busy: string | null }) {
  function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) { event.preventDefault(); const data = new FormData(event.currentTarget); onInvite({ email: formValue(data, 'email'), displayName: formValue(data, 'displayName'), role: formValue(data, 'role') }); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><form onSubmit={submit}><DialogHeader><DialogTitle>Invite a care-circle member</DialogTitle><DialogDescription>The invitation becomes active when this email signs in to the private Carestead Site.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><label htmlFor="member-name" className="grid gap-1.5 text-sm font-medium">Display name<Input id="member-name" name="displayName" placeholder="Maya" required /></label><label htmlFor="member-email" className="grid gap-1.5 text-sm font-medium">Email<Input id="member-email" name="email" type="email" placeholder="maya@example.com" required /></label><label htmlFor="member-role" className="grid gap-1.5 text-sm font-medium">Role<select id="member-role" name="role" defaultValue="caregiver" className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="caregiver">Caregiver — can update care records</option><option value="viewer">Viewer — read only</option></select></label></div><DialogFooter className="mt-5" showCloseButton><Button type="submit" disabled={!!busy}>{busy === 'invite_member' ? <LoaderCircle className="animate-spin" /> : <UserPlus />}Invite member</Button></DialogFooter></form></DialogContent></Dialog>;
}
