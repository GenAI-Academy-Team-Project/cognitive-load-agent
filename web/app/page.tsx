'use client';

import { CategorySelect } from '@/components/category-select';
import { PlanUpgradeDialog } from '@/components/plan-upgrade-dialog';
import { CreateRecipientDialog } from '@/components/create-recipient-dialog';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity, AlertTriangle, BrainCircuit, CalendarDays, Check, CheckCircle2,
  ChevronRight, CircleUserRound, ClipboardCheck, Clock3, HeartPulse,
  LayoutDashboard, ListChecks, LoaderCircle, MemoryStick, Pill, Plus, PanelsTopLeft,
  Archive, BookOpen, Copy, LockKeyhole, Pencil, Route, Save, ShieldCheck,
  Sparkles, UserPlus, Users, FileText, Mail, Phone, Siren,
  Bell, Download, Trash2,
} from 'lucide-react';

import { PaginatedList, ListRemovalContext } from '@/components/paginated-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { NotificationComposer } from '@/components/notification-composer';
import { NotificationSettings } from '@/components/notification-settings';
import { CareChat } from '@/components/care-chat';
import { CarePlanning, SinceAway, MemoryConflicts } from '@/components/care-planning';
import { localInput, localToInstant } from '@/lib/calendar-time';
import { handoverTaskFilters } from '@/lib/handover-filters';
import { IntegrationSettings } from '@/components/integration-settings';
import { AccountMenus } from '@/components/account-menus';
import { CareCalendar } from '@/components/care-calendar';
import type { CareTask, DashboardState, MemoryRecord, Risk, SupportContact } from '@/lib/types';

type View = 'Integrations' | 'Care Organizer' | 'Overview' | 'Handover' | 'Notifications' | 'Care plan' | 'Responsibilities' | 'Calendar' | 'Timeline' | 'Memory' | 'Care circle' | 'Privacy & data' | 'Evaluations';

const navItems: { view: View; label: string; icon: typeof Activity; group?: 'Demo' }[] = [
  { view: 'Overview', label: 'Overview', icon: LayoutDashboard },
  { view: 'Care plan', label: 'Care Plan', icon: BookOpen },
  { view: 'Care Organizer', label: 'Care Organizer', icon: PanelsTopLeft },
  { view: 'Care circle', label: 'Care Circle', icon: Users },
  { view: 'Handover', label: 'Care Hand Over', icon: FileText },
  { view: 'Responsibilities', label: 'Responsibilities', icon: ClipboardCheck },
  { view: 'Timeline', label: 'Activity Log', icon: ListChecks },
  { view: 'Evaluations', label: 'Evaluations', icon: BrainCircuit, group: 'Demo' },
];

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-CA', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Toronto',
  }).format(new Date(value));

export default function Home() {
  const [demoOpen, setDemoOpen] = useState(false);
  const [integrationRevision, setIntegrationRevision] = useState(0);
  const [view, setView] = useState<View>('Overview');
  const [state, setState] = useState<DashboardState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [taskDialog, setTaskDialog] = useState<CareTask | 'new' | null>(null);
  const [memoryDialog, setMemoryDialog] = useState<MemoryRecord | 'new' | null>(null);
  const [memberOpen, setMemberOpen] = useState(false);
  const [invitationUrl, setInvitationUrl] = useState('');
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | undefined>();
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [contactDialog, setContactDialog] = useState<SupportContact | 'new' | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    if (['Care planning', 'Care organizer'].includes(params.get('view') || '')) params.set('view', 'Care Organizer');
    fetch(`/api/state${params.get('recipientId') ? `?recipientId=${encodeURIComponent(params.get('recipientId')!)}` : ''}`)
      .then((response) => {
        if (response.status === 401) { window.location.replace('/sign-in'); throw new Error('Sign in to continue.'); }
        if (!response.ok) throw new Error('Unable to load care state');
        return response.json() as Promise<DashboardState>;
      })
      .then((nextState) => { if (active) { setState(nextState); if (!nextState.currentUser.isGuest && [...navItems.map((item) => item.view), 'Calendar', 'Notifications', 'Memory', 'Privacy & data', 'Integrations'].includes(params.get('view') || '')) { setView(params.get('view') as View); if (params.get('view') === 'Evaluations') setDemoOpen(true); } } })
      .catch(() => { if (active) setMessage('The care plan could not be loaded.'); });
    return () => { active = false; };
  }, []);

  async function act(action: string, payload: Record<string, unknown> = {}, success: string) {
    setBusy(action);
    try {
      const response = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, recipientId: state?.selectedRecipient.id, ...payload }),
      });
      if (response.status === 401) { window.location.replace('/sign-in'); return false; }
      const result = await response.json() as (DashboardState & { invitationUrl?: string | null }) | { error: string };
      if (!response.ok) throw new Error('error' in result ? result.error : 'Action failed');
      if ('invitationUrl' in result && result.invitationUrl) setInvitationUrl(new URL(result.invitationUrl, window.location.origin).href);
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

  async function signOut() {
    setBusy('sign_out');
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST' });
      if (!response.ok) throw new Error('Unable to sign out. Try again.');
      window.location.replace('/sign-in');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to sign out.'); setBusy(null); }
  }

  async function selectRecipient(recipientId: string) {
    setBusy('switch_recipient');
    try {
      const response = await fetch(`/api/state?recipientId=${encodeURIComponent(recipientId)}`);
      const result = await response.json() as DashboardState | { error: string };
      if (!response.ok) throw new Error('error' in result ? result.error : 'Unable to switch care recipient');
      setState(result as DashboardState);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to switch care recipient.'); }
    finally { setBusy(null); }
  }

  async function copyHandover() {
    if (!state) return;
    const openRisks = state.risks.filter((risk) => risk.status !== 'resolved');
    const reviewTasks = state.tasks.filter(task => !['complete','archived'].includes(task.status)).sort((a,b) => Date.parse(a.due_at)-Date.parse(b.due_at));
    const lines = [
      `${state.profile.preferred_name || state.selectedRecipient.display_name} — caregiver handover`,
      state.profile.pronouns ? `Pronouns: ${state.profile.pronouns}` : '',
      `Care context: ${state.profile.care_context || 'Not yet recorded'}`,
      `Latest update: ${state.events[0] ? `${state.events[0].title} — ${state.events[0].detail}` : 'No recent events'}`,
      `Open risks: ${openRisks.length ? openRisks.map((risk) => `${risk.severity}: ${risk.title}`).join('; ') : 'None'}`,
      `Review next: ${reviewTasks.length ? reviewTasks.map((task) => `${task.title} (${task.owner})`).join('; ') : 'No open responsibilities'}`,
      `Key contacts: ${state.supportContacts.length ? state.supportContacts.map((contact) => `${contact.name}, ${contact.relationship}${contact.phone ? `, ${contact.phone}` : ''}`).join('; ') : 'None recorded'}`,
      state.profile.communication_notes ? `Communication: ${state.profile.communication_notes}` : '',
      state.profile.mobility_notes ? `Mobility: ${state.profile.mobility_notes}` : '',
      state.profile.emergency_plan ? `Urgent plan: ${state.profile.emergency_plan}` : '',
    ].filter(Boolean);
    try { await navigator.clipboard.writeText(lines.join('\n')); setMessage('Handover brief copied.'); } catch { setMessage('The handover brief could not be copied.'); }
  }

  async function downloadExport() {
    if (!state) return;
    setBusy('export');
    try {
      const response = await fetch(`/api/export?recipientId=${encodeURIComponent(state.selectedRecipient.id)}`);
      if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error || 'Export failed'); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${state.selectedRecipient.display_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-carestead-export.json`; link.click(); URL.revokeObjectURL(url); setMessage('Encrypted transport export prepared on this device.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The export could not be prepared.'); }
    finally { setBusy(null); }
  }

  const openTasks = state?.tasks.filter((task) => !['complete', 'archived'].includes(task.status)).length ?? 0;
  const resolvedRisks = state?.risks.filter((risk) => risk.status === 'resolved').length ?? 0;
  const coverage = useMemo(() => {
    if (!state?.tasks.length) return 0;
    return state.confirmedCoverage ?? 0;
  }, [state]);

  const guest = state?.currentUser.isGuest === true;
  const visibleNavItems = guest ? navItems.filter((item) => ['Overview', 'Responsibilities', 'Timeline', 'Care plan', 'Evaluations'].includes(item.view)) : navItems;
  const pendingApproval = state?.approvals.find((approval) => approval.status === 'pending');
  const writeAllowed = state ? state.currentUser.role !== 'viewer' && state.consent.status === 'active' : false;

  return (
          <ListRemovalContext.Provider value={Object.fromEntries([
            ['Care risks', 'risks', true], ['Plan templates', 'templates', true], ['Your responsibilities', 'tasks', false], ['Available responsibilities', 'tasks', false], ['Upcoming care schedule', 'tasks', false], ['Fact details', 'memories', false], ['Care team', 'careCircle', false], ['Urgent updates', 'notifications', true], ['Routine updates', 'notifications', true], ['Notifications', 'notifications', true], ['Activity log', 'events', true], ['Evaluations', 'traces', true],
            ['Care routines', 'routines', false], ['Availability', 'availability', false], ['Delivery history', 'deliveries', true], ['Confirmed calendar actions', 'calendarHistory', true], ['Reviewable plans', 'proposals', true], ['Coverage requests', 'offers', true], ['Chat history', 'chat', true], ['Care circle', 'careCircle', false], ['Responsibilities', 'tasks', false], ['Task planning', 'tasks', false], ['Trusted facts', 'memories', false], ['Support contacts', 'supportContacts', false],
          ].map(([label, list, personal]) => [String(label), {
            hiddenIds: state?.listDismissals?.filter(item => item.entity_type === list).map(item => item.entity_id),
            canRemove: (record: Record<string, unknown>) => list === 'availability' ? record.member_id === state?.careCircle.find(member => member.email === state.currentUser.email)?.id : list === 'careCircle' ? record.role !== 'owner' && record.email !== state?.currentUser.email : list === 'offers' ? record.status !== 'pending' : list === 'chat' ? !record.action || ['executed', 'rejected'].includes(String((record.action as { status: string }).status)) : true,
            disabled: !!busy || guest || ((!personal || list === 'proposals') && !writeAllowed) || (list === 'careCircle' && state?.currentUser.role !== 'owner'),
            individual: !['Responsibilities', 'Trusted facts', 'Support contacts', 'Care circle', 'Care routines', 'Availability'].includes(String(label)),
            description: list === 'proposals' ? 'Discard pending plans and remove completed plans from your view. Existing responsibilities remain.' : list === 'routines' ? 'Stop repeating these routines. Existing responsibilities remain.' : list === 'availability' ? 'Remove your availability windows from the shared schedule.' : list === 'careCircle' ? 'Remove non-owner members’ access to this care recipient.' : personal ? 'Remove items from your view. Shared records and pending approvals are retained.' : 'Remove items by archiving them from the shared care plan.',
            remove: (ids: string[]) => act('remove_list_items', { list: String(list), ids }, 'Items removed.'),
          }]))}>
    <main className="min-h-screen bg-background text-foreground"><a href="#care-content" className="care-skip-link">Skip to care content</a>
      <div className="mx-auto grid min-h-screen max-w-[1540px] lg:grid-cols-[252px_1fr]">
        <aside className="care-sidebar hidden border-r border-sidebar-border bg-sidebar px-5 py-6 lg:flex lg:flex-col">
          <Brand />
          <nav className="mt-9 space-y-1" aria-label="Primary navigation">
            {visibleNavItems.map(({ view: target, label, icon: Icon, group }) => (
              <div key={target}>
                {group && <button onClick={() => setDemoOpen((open) => !open)} aria-expanded={demoOpen} aria-controls="demo-submenu" className="mt-3 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent/60">{group}<ChevronRight aria-hidden="true" className={`size-4 transition-transform ${demoOpen ? 'rotate-90' : ''}`} /></button>}
                <div id={group ? 'demo-submenu' : undefined} hidden={!!group && !demoOpen} className={group ? 'ml-5 border-l border-sidebar-border pl-2' : undefined}>
                  <button onClick={() => setView(target)} aria-current={view === target ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${view === target ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'}`}><Icon aria-hidden="true" className="size-[18px]" />{label}</button>
                </div>
              </div>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-sidebar-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Care coverage</span><span className="text-xs font-semibold text-primary">{coverage}%</span></div>
            <Progress aria-label="Care coverage percentage" value={coverage} className="[&_[data-slot=progress-indicator]]:bg-primary" />
            <p className="mt-3 text-sm font-medium">{state ? `${state.tasks.length - openTasks} of ${state.tasks.length} tasks settled` : 'Loading care plan'}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Shared responsibilities stay visible and accountable.</p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="flex min-h-[76px] flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-5 py-3 backdrop-blur md:px-8">
            <div className="lg:hidden"><Brand /></div>
            <div className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex"><Activity className="size-4 text-primary" />{guest ? 'Sample care plan' : 'Care plan monitoring is active'}</div>
            <div className="flex min-w-0 w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
              {state && <select aria-label="Care recipient" value={state.selectedRecipient.id} onChange={(event) => selectRecipient(event.target.value)} disabled={!!busy} className="h-9 max-w-[170px] rounded-lg border bg-background px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-ring">{state.recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.display_name}</option>)}</select>}
              <Button variant="outline" onClick={() => act('run_check', {}, 'Care plan checked and evaluation trace saved.')} disabled={!!busy || !writeAllowed}>
                {busy === 'run_check' ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Run care check
              </Button>
              {state && !guest && <Button variant="ghost" size="icon" aria-label={`Notifications, ${state.notifications.filter((item) => !item.read_at).length} unread`} title="Notifications" aria-pressed={view === 'Notifications'} onClick={() => setView('Notifications')} className="relative"><Bell />{state.notifications.some((item) => !item.read_at) && <span className="absolute top-1 right-1 size-2 rounded-full bg-[#b6533d]" />}</Button>}
              {state && !guest && <Button variant="ghost" size="icon" aria-label="Calendar" title="Calendar" aria-pressed={view === 'Calendar'} onClick={() => setView('Calendar')}><CalendarDays /></Button>}
              {state && <AccountMenus user={state.currentUser} recipientName={state.selectedRecipient.display_name} view={view} onNavigate={setView} onSignOut={signOut} onProfileUpdated={(displayName) => setState((current) => current ? { ...current, currentUser: { ...current.currentUser, displayName }, careCircle: current.careCircle.map((member) => member.email === current.currentUser.email ? { ...member, display_name: displayName } : member) } : current)} busy={!!busy} />}
            </div>
          </header>

          <div className="border-b px-4 py-2 lg:hidden">
            <div className="flex gap-1 overflow-x-auto">
              {visibleNavItems.map(({ view: target, label, icon: Icon, group }) => (
                <div key={target} className="flex shrink-0 items-center">
                  {group && <button onClick={() => setDemoOpen((open) => !open)} aria-expanded={demoOpen} aria-controls="demo-submenu-mobile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground">{group}<ChevronRight aria-hidden="true" className={`size-4 transition-transform ${demoOpen ? 'rotate-90' : ''}`} /></button>}
                  <div id={group ? 'demo-submenu-mobile' : undefined} hidden={!!group && !demoOpen}>
                    <button onClick={() => setView(target)} aria-current={view === target ? 'page' : undefined} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${view === target ? 'bg-secondary text-primary' : 'text-muted-foreground'}`}><Icon aria-hidden="true" className="size-4" />{label}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div id="care-content" tabIndex={-1} className="px-5 py-7 md:px-8 md:py-9">
            {guest && <output className="block mb-6 rounded-xl border bg-secondary p-4 text-sm">Guest preview — this read-only plan contains fictional sample data. Open Profile settings and log out to sign in or create an account.</output>}
            {!state ? <LoadingState /> : (
              <>
                {view === 'Integrations' && <IntegrationSettings recipientId={state.selectedRecipient.id} recipientName={state.selectedRecipient.display_name} onChanged={() => setIntegrationRevision((value) => value + 1)} />}
                {view === 'Overview' && <Overview state={state} openTasks={openTasks} coverage={coverage} resolvedRisks={resolvedRisks} onAdd={() => setTaskDialog('new')} onApprove={() => setApprovalOpen(true)} onAssign={() => setView('Care Organizer')} busy={busy} writeAllowed={writeAllowed} />}
                {view === 'Care Organizer' && <CarePlanning key={state.selectedRecipient.id} dashboard={state} onChanged={() => selectRecipient(state.selectedRecipient.id)} />}
                {view === 'Handover' && <HandoverView key={state.selectedRecipient.id} onChanged={() => selectRecipient(state.selectedRecipient.id)} state={state} onEditProfile={() => setProfileOpen(true)} onAddContact={() => setContactDialog('new')} onEditContact={setContactDialog} onArchiveContact={(id) => act('archive_support_contact', { id }, 'Support contact archived.')} onCopy={copyHandover} busy={busy} />}
                {view === 'Notifications' && <NotificationsView onChanged={() => selectRecipient(state.selectedRecipient.id)} state={state} onRead={(id) => act('mark_notification_read', { id }, 'Notification marked as read.')} onReview={() => setApprovalOpen(true)} busy={busy} />}
                {view === 'Care plan' && <CarePlanView state={state} onCreate={(templateKey) => { setSelectedTemplateKey(templateKey); setRecipientOpen(true); }} onSave={() => setTemplateOpen(true)} onClone={() => setCloneOpen(true)} onUpgrade={() => setUpgradeOpen(true)} busy={busy} />}
                {view === 'Responsibilities' && <Responsibilities key={state.selectedRecipient.id} tasks={state.tasks} onAdd={() => setTaskDialog('new')} onEdit={setTaskDialog} onComplete={(id) => act('complete_task', { id }, 'Responsibility marked complete.')} onArchive={(id) => act('archive_task', { id }, 'Responsibility archived.')} busy={busy} writeAllowed={writeAllowed} />}
                {view === 'Timeline' && <Timeline state={state} />}
                {view === 'Calendar' && <CareCalendar key={state.selectedRecipient.id} state={state} onCompleted={() => selectRecipient(state.selectedRecipient.id)} />}
                {view === 'Memory' && <Memory beforeFacts={<MemoryConflicts key={state.selectedRecipient.id} dashboard={state} onChanged={() => selectRecipient(state.selectedRecipient.id)} />} state={state} onAdd={() => setMemoryDialog('new')} onEdit={setMemoryDialog} onVerify={(id) => act('verify_memory', { id }, 'Trusted fact verified.')} onArchive={(id) => act('archive_memory', { id }, 'Trusted fact archived.')} writeAllowed={writeAllowed} busy={busy} />}
                {view === 'Care circle' && <CareCircle state={state} onRenew={(id) => act('renew_invitation', { id }, 'New invitation link created.')} onInvite={() => setMemberOpen(true)} onRole={(id, role) => act('update_member', { id, role }, `Member role changed to ${role === 'viewer' ? 'Guest' : role}.`)} onRemove={(id) => act('archive_member', { id }, 'Member removed from the care circle.')} busy={busy} />}
                {view === 'Privacy & data' && <PrivacyView state={state} onConsent={() => setConsentOpen(true)} onExport={downloadExport} onDelete={() => setDeleteOpen(true)} busy={busy} />}
                {view === 'Evaluations' && <Evaluations state={state} />}
              </>
            )}
          </div>
          <footer className="border-t px-5 py-5 text-center text-xs leading-5 text-muted-foreground md:px-8">Carestead supports care coordination only. It does not diagnose, prescribe, replace clinical judgment, or replace emergency services.</footer>
        </section>
      </div>

      {state && upgradeOpen && <PlanUpgradeDialog key={state.selectedRecipient.id} recipientId={state.selectedRecipient.id} open={upgradeOpen} onOpenChange={setUpgradeOpen} busy={!!busy} onApply={(upgradeReview) => act('upgrade_plan', { upgradeReview }, 'The latest template version was applied without overwriting personal changes.')} />}
      <ApprovalDialog open={approvalOpen} onOpenChange={setApprovalOpen} approval={pendingApproval} busy={busy} onApprove={async () => { if (!pendingApproval) return; await act('approve_plan', { id: pendingApproval.id }, 'Plan reviewed. Choose and confirm coverage in Care Organizer.'); setApprovalOpen(false); }} />
      <TaskDialog canCreateCategory={writeAllowed} categories={state?.tasks.map((task) => task.category) ?? []} members={state?.careCircle ?? []} zone={state?.selectedRecipient.timezone ?? 'America/Toronto'} key={taskDialog === 'new' ? 'task-new' : `task-${taskDialog?.id ?? 'closed'}`} open={taskDialog !== null} task={taskDialog === 'new' ? undefined : taskDialog ?? undefined} onOpenChange={(open) => { if (!open) setTaskDialog(null); }} busy={busy} onSave={async (payload) => { const ok = await act(taskDialog === 'new' ? 'add_task' : 'update_task', taskDialog !== 'new' && taskDialog ? { ...payload, id: taskDialog.id } : payload, taskDialog === 'new' ? 'Responsibility added to the shared plan.' : 'Responsibility updated.'); if (ok) setTaskDialog(null); }} />
      <MemoryDialog key={memoryDialog === 'new' ? 'memory-new' : `memory-${memoryDialog?.id ?? 'closed'}`} open={memoryDialog !== null} memory={memoryDialog === 'new' ? undefined : memoryDialog ?? undefined} onOpenChange={(open) => { if (!open) setMemoryDialog(null); }} busy={busy} onSave={async (payload) => { const ok = await act(memoryDialog === 'new' ? 'add_memory' : 'update_memory', memoryDialog !== 'new' && memoryDialog ? { ...payload, id: memoryDialog.id } : payload, memoryDialog === 'new' ? 'Trusted fact added for review.' : 'Trusted fact updated.'); if (ok) setMemoryDialog(null); }} />
      <Dialog open={!!invitationUrl} onOpenChange={(open) => { if (!open) setInvitationUrl(''); }}><DialogContent><DialogHeader><DialogTitle>Share the invitation</DialogTitle><DialogDescription>Send this link privately to the invited person. They must use the email address you invited. It expires in seven days and can be used once.</DialogDescription></DialogHeader><label htmlFor="invitation-link" className="text-sm font-medium">Invitation link</label><Input id="invitation-link" readOnly value={invitationUrl} onFocus={(event) => event.target.select()} /><DialogFooter showCloseButton><Button onClick={async () => { try { await navigator.clipboard.writeText(invitationUrl); setMessage('Invitation link copied.'); } catch { setMessage('Select and copy the invitation link.'); } }}>Copy link</Button></DialogFooter></DialogContent></Dialog>
      <MemberDialog open={memberOpen} onOpenChange={setMemberOpen} busy={busy} onInvite={async (payload) => { const ok = await act('invite_member', payload, 'Care-circle invitation recorded.'); if (ok) setMemberOpen(false); }} />
      <CreateRecipientDialog key={`${recipientOpen}-${selectedTemplateKey}`} initialTemplateKey={selectedTemplateKey} canCreateCategory={writeAllowed} categories={state?.tasks.map((task) => task.category) ?? []} open={recipientOpen} onOpenChange={setRecipientOpen} templates={state?.templates ?? []} busy={busy} onCreate={async (payload) => { const ok = await act('create_recipient', payload, 'A new care recipient and plan were created.'); if (ok) { setRecipientOpen(false); setView('Care plan'); } }} />
      <SaveTemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} busy={busy} onSave={async (payload) => { const ok = await act('save_plan_template', payload, 'A de-identified reusable template was saved.'); if (ok) setTemplateOpen(false); }} />
      <ClonePlanDialog open={cloneOpen} onOpenChange={setCloneOpen} busy={busy} onClone={async (payload) => { const ok = await act('clone_plan', payload, 'The plan structure was cloned for a new person.'); if (ok) { setCloneOpen(false); setView('Care plan'); } }} />
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} profile={state?.profile} busy={busy} onSave={async (payload) => { const ok = await act('update_profile', payload, 'The handover profile was updated.'); if (ok) setProfileOpen(false); }} />
      <SupportContactDialog key={contactDialog === 'new' ? 'contact-new' : `contact-${contactDialog?.id ?? 'closed'}`} open={contactDialog !== null} contact={contactDialog === 'new' ? undefined : contactDialog ?? undefined} onOpenChange={(open) => { if (!open) setContactDialog(null); }} busy={busy} onSave={async (payload) => { const ok = await act(contactDialog === 'new' ? 'add_support_contact' : 'update_support_contact', contactDialog !== 'new' && contactDialog ? { ...payload, id: contactDialog.id } : payload, contactDialog === 'new' ? 'Support contact added.' : 'Support contact updated.'); if (ok) setContactDialog(null); }} />
      <ConsentDialog open={consentOpen} onOpenChange={setConsentOpen} consent={state?.consent} busy={busy} onSave={async (payload) => { const ok = await act('update_consent', payload, payload.consentStatus === 'active' ? 'Consent and retention settings saved.' : 'Consent withdrawn; care actions are now paused.'); if (ok) setConsentOpen(false); }} />
      <DeleteRecipientDialog open={deleteOpen} onOpenChange={setDeleteOpen} recipientName={state?.selectedRecipient.display_name ?? ''} busy={busy} onDelete={async (payload) => { const ok = await act('delete_recipient', payload, 'Recipient data was permanently deleted.'); if (ok) { setDeleteOpen(false); setView('Overview'); } }} />
      {state && !guest && <CareChat key={integrationRevision} recipientId={state.selectedRecipient.id} recipientName={state.profile.preferred_name || state.selectedRecipient.display_name} canWrite={writeAllowed} onActionCompleted={() => selectRecipient(state.selectedRecipient.id)} />}
      {message && <button onClick={() => setMessage(null)} className="fixed right-4 bottom-20 z-50 flex max-w-sm items-center gap-3 rounded-2xl border bg-foreground px-4 py-3 text-left text-sm text-background shadow-xl"><CheckCircle2 className="size-4 shrink-0" />{message}</button>}
    </main>
    </ListRemovalContext.Provider>
  );
}

function Brand() {
  return <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground shadow-sm"><HeartPulse className="size-5" /></span><div><p className="font-heading text-base font-semibold tracking-tight">Carestead</p><p className="text-xs text-muted-foreground">Care coordination</p></div></div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="care-page-heading flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><p className="mb-2 text-sm font-medium text-primary">{eyebrow}</p><h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] md:text-[38px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">{description}</p></div>{action}</div>;
}

function Overview({ state, openTasks, coverage, resolvedRisks, onAdd, onApprove, onAssign, busy, writeAllowed }: { state: DashboardState; openTasks: number; coverage: number; resolvedRisks: number; onAdd: () => void; onApprove: () => void; onAssign: () => void; busy: string | null; writeAllowed: boolean }) {
  const dueTasks = state.tasks.filter(task => !['complete', 'archived'].includes(task.status)).sort((a,b) => Date.parse(a.due_at)-Date.parse(b.due_at));
  const nextTask = dueTasks[0];
  const pending = state.approvals.find(item => item.status === 'pending');
  const activeRisk = state.risks.find(item => item.status !== 'resolved');
  return <>
    <PageHeading eyebrow={`${state.selectedRecipient.display_name}'s care plan`} title={`Good morning, ${state.currentUser.displayName}`} description={`Carestead has combined ${state.selectedRecipient.display_name}'s schedule, responsibilities, and trusted facts into one reviewable plan.`} action={<Button size="lg" className="w-fit rounded-xl px-4" onClick={onAdd} disabled={!writeAllowed}><Plus /> Add responsibility</Button>} />
    <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3"><Metric tone="sky" label="Open responsibilities" value={String(openTasks)} note="Across the shared care plan" icon={ClipboardCheck} /><Metric tone="peach" label="Confirmed coverage" value={`${coverage}%`} note="Open tasks accepted by their caregiver" icon={Users} /><Metric tone="plum" label="Risks resolved" value={String(resolvedRisks)} note="Across this care plan" icon={ShieldCheck} /></div>
    <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.8fr)]">
      <section><SectionHeading title="Needs your attention" subtitle="Prioritized by timing, dependency, and potential impact." /><div className="space-y-3"><PaginatedList label="Care risks" records={state.risks} resetKey={state.selectedRecipient.id}>{state.risks.map((risk) => <RiskCard key={risk.id} risk={risk} onAction={!writeAllowed ? undefined : risk.id === 'risk-med' ? onApprove : risk.id === 'risk-ride' ? onAssign : undefined} busy={busy} />)}</PaginatedList></div></section>
      <aside data-care-tone="plum" className="care-brief rounded-[22px] border p-5 shadow-[0_16px_45px_rgb(35_68_52/0.06)] md:p-6">
        <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary"><Sparkles className="size-5" /></span><div><p className="font-heading font-semibold">Care brief</p><p className="text-xs text-muted-foreground">What needs attention and suggested next steps</p></div></div><Badge variant="outline" className="border-[#b9d5c3] bg-[var(--care-success)] text-[var(--care-success-ink)]">{state.events.length} events</Badge></div>
        <p className="mt-5 text-[15px] leading-6">{pending?.action || activeRisk?.detail || (nextTask ? `Next responsibility: ${nextTask.title}.` : "No open responsibilities or pending reviews in this care plan.")}</p>
        <div className="mt-5 space-y-3 border-t pt-4">{activeRisk && <Evidence icon={AlertTriangle} text={activeRisk.title} />}{nextTask && <><Evidence icon={Clock3} text={`Due ${formatDate(nextTask.due_at)}`} /><Evidence icon={CircleUserRound} text={`Owner: ${nextTask.owner}`} /></>}{!pending && !activeRisk && !nextTask && <Evidence icon={CheckCircle2} text="Nothing outstanding in the recorded plan" />}</div>
        <Button className="mt-5 w-full rounded-xl" onClick={onApprove} disabled={!writeAllowed || !state.approvals.some((item) => item.status === 'pending')}>Review recommended plan <ChevronRight /></Button>
        <p className="mt-3 text-center text-[11px] leading-4 text-muted-foreground">Carestead prepares actions; a caregiver approves any external or consequential step.</p>
      </aside>
    </div>
    <section data-care-tone="sky" className="mt-8 rounded-[22px] border p-5 md:p-6"><SectionHeading title="Upcoming care schedule" subtitle="A shared operational view for the care circle." /><div className="mt-5 grid gap-2 lg:grid-cols-4"><PaginatedList label="Upcoming care schedule" records={dueTasks} resetKey={state.selectedRecipient.id}>{dueTasks.map((task) => <ScheduleCard key={task.id} task={task} />)}</PaginatedList></div></section>
  </>;
}

function HandoverView({ state, onChanged, onEditProfile, onAddContact, onEditContact, onArchiveContact, onCopy, busy }: { state: DashboardState; onChanged: () => void; onEditProfile: () => void; onAddContact: () => void; onEditContact: (contact: SupportContact) => void; onArchiveContact: (id: string) => void; onCopy: () => void; busy: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const writeAllowed = state.currentUser.role !== 'viewer';
  const openRisks = state.risks.filter((risk) => risk.status !== 'resolved');
  const pendingApprovals = state.approvals.filter((approval) => approval.status === 'pending');
  const factsToReview = state.memories.filter((memory) => memory.status === 'review_due');
  const openTasks = state.tasks.filter(task => !['complete','archived'].includes(task.status)).sort((a,b) => Date.parse(a.due_at)-Date.parse(b.due_at));
  const reviewCount = openRisks.length + pendingApprovals.length + factsToReview.length;
  const profileName = state.profile.preferred_name || state.selectedRecipient.display_name;
  return <><PageHeading eyebrow="Caregiver handover" title={`${profileName}, at a glance`} description="What changed, what needs attention, and who can help." action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onCopy}><Copy /> Copy brief</Button><Button onClick={onEditProfile} disabled={!writeAllowed}><Pencil /> Edit profile</Button></div>} />
    <div className="mt-5 grid items-start gap-4 lg:grid-cols-2">
        <article className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="flex items-center gap-4"><span className="grid size-14 place-items-center rounded-2xl bg-[var(--care-success)] font-heading text-lg font-semibold text-[var(--care-success-ink)]">{profileName.slice(0, 2).toUpperCase()}</span><div><h2 className="font-heading text-xl font-semibold">{profileName}</h2><p className="mt-1 text-sm text-muted-foreground">{state.profile.pronouns || 'Pronouns not recorded'} · {state.profile.home_base || state.selectedRecipient.timezone}</p></div></div><Badge variant="outline" className="w-fit bg-[var(--care-success)] text-primary">{state.currentPlan.name}</Badge></div>
          <p className="mt-5 text-[15px] leading-7">{state.profile.care_context || 'Add a short care context so a new caregiver can understand the person and their support needs quickly.'}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2"><ProfileNote label="How to communicate" text={state.profile.communication_notes} /><ProfileNote label="Mobility & access" text={state.profile.mobility_notes} /></div>
          {state.profile.emergency_plan && <div className="mt-4 flex gap-3 rounded-xl border border-[#e5c6bd] bg-[var(--care-rose)] p-4"><Siren className="mt-0.5 size-5 shrink-0 text-[var(--care-rose-ink)]" /><div><p className="text-sm font-semibold">If something is urgent</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{state.profile.emergency_plan}</p></div></div>}
        </article>
        <SinceAway dashboard={state} onChanged={onChanged} />
    </div>

        <section className="care-latest mt-4 min-w-0"><div className="flex flex-wrap items-start justify-between gap-4"><SectionHeading title="Latest state" subtitle="The newest signal and what needs attention now." /><Badge variant="outline" className={reviewCount ? 'border-[#ead9ae] bg-[var(--care-amber)] text-[var(--care-amber-ink)]' : 'bg-[var(--care-success)] text-primary'}>{reviewCount} to review</Badge></div>
          <div data-care-tone="sky" className="mt-5 rounded-2xl border p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Most recent update</p>{state.events[0] ? <><p className="mt-2 font-heading font-semibold">{state.events[0].title}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{state.events[0].detail}</p><p className="mt-2 text-xs text-muted-foreground">{formatDate(state.events[0].occurred_at)} · {state.events[0].source}</p></> : <p className="mt-2 text-sm text-muted-foreground">No recent events have been recorded.</p>}</div>
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-3"><ReviewColumn tone="rose" icon={AlertTriangle} total={openRisks.length} title="Open risks" empty="No open risks" items={openRisks.map((risk) => ({ id: risk.id, title: risk.title, note: `${risk.severity} · ${risk.status.replace('_', ' ')}` }))} /><ReviewColumn tone="sky" icon={Clock3} total={openTasks.length} title="Due next" empty="No open tasks" filterFields={[["due_window", "Due time"], ["assignment", "Assignment"]]} items={openTasks.map((task) => ({ ...handoverTaskFilters(task, state.currentUser.displayName, state.selectedRecipient.timezone, now), id: task.id, title: task.title, note: `${task.owner} · ${formatDate(task.due_at)}` }))} /><ReviewColumn tone="plum" icon={ShieldCheck} total={pendingApprovals.length + factsToReview.length} title="Verify" empty="Nothing to verify" items={[...pendingApprovals.map((approval) => ({ id: approval.id, title: approval.action, note: 'Approval pending' })), ...factsToReview.map((memory) => ({ id: memory.id, title: memory.value, note: 'Trusted fact review' }))]} /></div>
        </section>

      <aside className="mt-4 grid items-start gap-4 lg:grid-cols-2" aria-label="Handover directories">
        <details className="min-w-0 rounded-2xl border bg-card p-4"><summary className="cursor-pointer font-heading text-lg font-semibold">Key contacts &amp; support <span className="text-sm font-normal text-muted-foreground">({state.supportContacts.length})</span></summary><div className="mt-3 flex items-start justify-between gap-4"><p className="text-sm text-muted-foreground">People, providers, and services.</p><Button size="sm" variant="outline" onClick={onAddContact} disabled={!writeAllowed}><Plus /> Add</Button></div><div className="mt-5 space-y-3"><PaginatedList label="Support contacts" collapsibleFilters records={state.supportContacts} resetKey={state.selectedRecipient.id}>{state.supportContacts.length ? state.supportContacts.map((contact) => <article key={contact.id} className="rounded-2xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-heading font-semibold">{contact.name}</p>{contact.priority !== 'standard' && <Badge variant="outline" className={contact.priority === 'primary' ? 'bg-[var(--care-success)] text-primary' : ''}>{contact.priority}</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{contact.relationship}{contact.organization ? ` · ${contact.organization}` : ''}</p></div>{writeAllowed && <div className="flex"><Button size="icon-sm" variant="ghost" onClick={() => onEditContact(contact)} aria-label={`Edit ${contact.name}`}><Pencil /></Button><Button size="icon-sm" variant="ghost" onClick={() => onArchiveContact(contact.id)} disabled={!!busy} aria-label={`Archive ${contact.name}`}><Archive /></Button></div>}</div>{contact.notes && <p className="mt-3 text-sm leading-6 text-muted-foreground">{contact.notes}</p>}<div className="mt-3 flex flex-wrap gap-3 text-xs">{contact.phone && <a className="flex items-center gap-1.5 text-primary hover:underline" href={`tel:${contact.phone}`}><Phone className="size-3.5" />{contact.phone}</a>}{contact.email && <a className="flex items-center gap-1.5 text-primary hover:underline" href={`mailto:${contact.email}`}><Mail className="size-3.5" />{contact.email}</a>}</div></article>) : <EmptyNote text="No support contacts recorded yet." />}</PaginatedList></div></details>
        <details className="min-w-0 rounded-2xl border bg-card p-4"><summary className="cursor-pointer font-heading text-lg font-semibold">Care team with access <span className="text-sm font-normal text-muted-foreground">({state.careCircle.length})</span></summary><div className="mt-4 space-y-3"><PaginatedList label="Care team" collapsibleFilters records={state.careCircle} resetKey={state.selectedRecipient.id}>{state.careCircle.map((member) => <div key={member.id} className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold text-primary">{member.display_name.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.display_name}</p><p className="truncate text-xs text-muted-foreground">{member.email}</p></div><Badge variant="outline" className="capitalize">{member.role === 'viewer' ? 'Guest' : member.role}</Badge></div>)}</PaginatedList></div></details>
      </aside>
    <p className="mt-5 text-xs leading-5 text-muted-foreground">This operational handover summarizes caregiver-entered information. It is not a medical record or substitute for emergency or clinical guidance.</p>
  </>;
}

function ProfileNote({ label, text }: { label: string; text: string }) { return <div className="rounded-xl border bg-card p-4"><p className="text-xs font-semibold text-foreground">{label}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{text || 'Not yet recorded'}</p></div>; }
function ReviewColumn({ title, items, empty, tone, icon: Icon, total, filterFields }: { title: string; items: { id: string; title: string; note: string; due_window?: string; assignment?: string }[]; filterFields?: readonly (readonly [string, string])[]; empty: string; tone: "rose" | "sky" | "plum"; icon: typeof Activity; total: number }) {
  return <section className="min-w-0" aria-label={title}>
    <h3 className="mb-3 flex flex-wrap items-center gap-2 font-heading text-sm font-semibold">
      <span data-care-tone={tone} className="care-category-icon grid size-8 shrink-0 place-items-center rounded-lg border"><Icon aria-hidden="true" className="size-4" /></span>
      {title}<span className="text-xs font-medium text-muted-foreground">({total})</span>
    </h3>
    {items.length ? <div className="space-y-3"><PaginatedList label={title} records={items} filterFields={filterFields} hideSingleValueFilters collapsibleFilters pageSize={3}>{items.map((item) => <div key={item.id} data-care-tone={tone} className="rounded-xl border border-l-[3px] p-3"><p className="text-sm font-semibold leading-6">{item.title}</p><p className="care-category-icon mt-2 text-xs font-medium capitalize leading-5">{item.note}</p></div>)}</PaginatedList></div> : <p className="flex items-start gap-2 rounded-xl border p-3 text-sm text-muted-foreground"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{empty}</p>}
    {total > items.length && <p className="mt-2 text-xs text-muted-foreground">Showing {items.length} of {total}</p>}
  </section>;
}
function EmptyNote({ text }: { text: string }) { return <div className="bg-[var(--care-inset)] rounded-xl border border-dashed p-3 text-sm text-muted-foreground">{text}</div>; }

const notificationAppearance = {
  approval: { label: 'Approval request', Icon: ShieldCheck, tone: 'amber' },
  risk: { label: 'Care risk', Icon: AlertTriangle, tone: 'rose' },
  reminder: { label: 'Reminder', Icon: Clock3, tone: 'sky' },
  system: { label: 'System update', Icon: Bell, tone: 'plum' },
};
function NotificationType({ kind }: { kind: keyof typeof notificationAppearance }) {
  const { label, Icon, tone } = notificationAppearance[kind] || notificationAppearance.system;
  return <Badge variant="outline" data-care-tone={tone}><Icon className="size-4" />{label}</Badge>;
}
function NotificationsView({ state, onRead, onReview, busy, onChanged }: { onChanged: () => void; state: DashboardState; onRead: (id: string) => void; onReview: () => void; busy: string | null }) {
  const unread = state.notifications.filter((item) => !item.read_at).length;
  return <><PageHeading eyebrow="Approval-aware inbox" title="Notifications" description="Consequential action notices remain held until the required caregiver approval. Every notification is recipient-scoped and auditable." /><NotificationComposer key={`compose-${state.selectedRecipient.id}`} state={state} onChanged={onChanged} /><div className="mt-8 flex flex-wrap gap-2"><Badge variant="outline" className="bg-[var(--care-success)] text-primary">{unread} unread</Badge><Badge variant="outline">{state.notifications.filter((item) => item.delivery_state === 'needs_approval').length} awaiting approval</Badge></div><div className="mt-5 min-w-0 space-y-3"><PaginatedList label="Notifications" filterFields={[["read_status", "Read status"], ["kind", "Notification type"], ["delivery_state", "Delivery status"]]} records={state.notifications.map(item => ({ ...item, read_status: item.read_at ? "read" : "unread" }))} resetKey={state.selectedRecipient.id} resultsHeading="Your notifications">{state.notifications.length ? state.notifications.map((item) => <article key={item.id} data-care-tone={(notificationAppearance[item.kind] || notificationAppearance.system).tone} className="care-notification flex min-w-0 flex-col gap-4 rounded-2xl border border-l-4 p-5 shadow-sm sm:flex-row sm:items-start"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.delivery_state === 'needs_approval' ? 'bg-[#fff4ea] text-[var(--care-rose-ink)]' : 'bg-secondary text-primary'}`}>{item.delivery_state === 'needs_approval' ? <ShieldCheck className="size-5" /> : <Bell className="size-5" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading font-semibold">{item.title}</h3><NotificationType kind={item.kind} /><Badge variant="outline" className="capitalize">{item.delivery_state.replaceAll('_', ' ')}</Badge>{!item.read_at && <Badge className="bg-primary text-primary-foreground">New</Badge>}</div><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p><p className="mt-2 text-xs text-muted-foreground">{formatDate(item.created_at)}</p></div><div className="flex shrink-0 flex-wrap gap-2">{item.delivery_state === 'needs_approval' && <Button size="sm" onClick={onReview} disabled={!!busy}>Review approval</Button>}{!item.read_at && <Button size="sm" variant="outline" onClick={() => onRead(item.id)} disabled={!!busy}><Check /> Mark read</Button>}</div></article>) : <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">No notifications for this care recipient.</div>}</PaginatedList></div><div className="mt-6 flex gap-3 rounded-2xl border border-[#c8dfd0] bg-[var(--care-success)] p-5"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-heading font-semibold">Delivery policy</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Notifications can be posted in Carestead or sent through configured email, SMS, and push channels after explicit approval. External channels require the receiving caregiver’s opt-in. Approval-required actions are never represented as completed before a caregiver approves them.</p></div></div><NotificationSettings key={`${state.selectedRecipient.id}:${state.notifications.length}`} recipientId={state.selectedRecipient.id} /></>;
}

function PrivacyView({ state, onConsent, onExport, onDelete, busy }: { state: DashboardState; onConsent: () => void; onExport: () => void; onDelete: () => void; busy: string | null }) {
  const owner = state.currentUser.role === 'owner';
  const retention = state.consent.retention_days === '0' ? 'No automatic expiry' : `${state.consent.retention_days} days`;
  return <><PageHeading eyebrow="Privacy controls" title="Consent, retention & data" description={`Control how ${state.selectedRecipient.display_name}'s information is used, retained, exported, and permanently deleted.`} action={<Button onClick={onConsent} disabled={!owner}><Pencil /> Manage consent</Button>} />
    {state.consent.status !== 'active' && <div className="mt-6 flex gap-3 rounded-2xl border border-[#e5c6bd] bg-[var(--care-rose)] p-5"><Siren className="mt-0.5 size-5 shrink-0 text-[var(--care-rose-ink)]" /><div><p className="font-heading font-semibold">Consent is withdrawn</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Care-record changes, agent checks, and new notifications are paused. The owner can restore consent or permanently delete the recipient data.</p></div></div>}
    <div className="mt-8 grid gap-5 lg:grid-cols-3"><article className="rounded-[20px] border bg-card p-5"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary"><ShieldCheck className="size-5" /></span><StatusBadge value={state.consent.status} /></div><h2 className="mt-4 font-heading font-semibold">Consent record</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{state.consent.purpose}</p><p className="mt-4 text-xs text-muted-foreground">Updated {formatDate(state.consent.updated_at)}</p></article><article className="rounded-[20px] border bg-card p-5"><span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary"><Clock3 className="size-5" /></span><h2 className="mt-4 font-heading font-semibold">Retention</h2><p className="mt-2 text-2xl font-heading font-semibold">{retention}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">The recorded retention choice is included in the audit history and data export.</p></article><article className="rounded-[20px] border bg-card p-5"><span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary"><LockKeyhole className="size-5" /></span><h2 className="mt-4 font-heading font-semibold">Request protection</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Server-side authorization, validation, throttling, request identifiers, and privacy-safe error records protect sensitive workflows.</p><p className="mt-4 text-xs text-muted-foreground">{state.monitoring.recentErrors} handled error{state.monitoring.recentErrors === 1 ? '' : 's'} in the last 24 hours. Monitoring stores error codes—not care notes or profile text.</p></article></div>
    <section className="mt-6 rounded-[22px] border bg-card p-6"><SectionHeading title="Data requests" subtitle="Exports are recipient-scoped. Deletion requires the exact recipient name and cannot be undone." /><div className="mt-5 grid gap-4 md:grid-cols-2"><div className="bg-[var(--care-inset)] rounded-2xl border p-5"><Download className="size-5 text-primary" /><p className="mt-3 font-heading font-semibold">Export all recipient data</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Download a structured JSON package containing the profile, support network, plan, responsibilities, memory, events, risks, approvals, traces, notifications, consent, and care team.</p><Button className="mt-4" variant="outline" onClick={onExport} disabled={!owner || !!busy}>{busy === 'export' ? <LoaderCircle className="animate-spin" /> : <Download />}Download export</Button></div><div className="rounded-2xl border border-[#e5c6bd] bg-[var(--care-rose)] p-5"><Trash2 className="size-5 text-[var(--care-rose-ink)]" /><p className="mt-3 font-heading font-semibold">Permanently delete recipient</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Deletes the profile, support contacts, care plan, scoped operational records, consent, notifications, and access mappings. A minimal deletion-request receipt remains for accountability.</p><Button className="mt-4 text-[var(--care-rose-ink)]" variant="outline" onClick={onDelete} disabled={!owner || !!busy}><Trash2 />Start deletion</Button></div></div></section>
  </>;
}

function CarePlanView({ state, onCreate, onSave, onClone, onUpgrade, busy }: { state: DashboardState; onCreate: (templateKey?: string) => void; onSave: () => void; onClone: () => void; onUpgrade: () => void; busy: string | null }) {
  const owner = state.currentUser.role === 'owner';
  return <><PageHeading eyebrow="Portable care model" title={`${state.selectedRecipient.display_name}'s active plan`} description="Start from a proven structure, personalize it safely, and reuse the structure for someone else without carrying over private history." action={<Button onClick={() => onCreate()} disabled={!owner || !!busy}><Plus /> New care recipient</Button>} />
    <div className={`mt-8 grid grid-cols-1 items-start gap-5 ${state.templates.length > 0 ? 'xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.6fr)]' : ''}`}>
      <article className="care-current-plan min-w-0 rounded-[22px] border bg-card p-6 shadow-[0_12px_35px_rgb(35_68_52/0.05)]">
        <div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center rounded-2xl bg-secondary text-primary"><BookOpen className="size-5" /></span><Badge variant="outline" className="bg-[var(--care-success)] text-primary">Active</Badge></div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Current plan</p><h2 className="mt-1 font-heading text-xl font-semibold">{state.currentPlan.name}</h2>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3"><PlanStat label="Version" value={`v${state.currentPlan.template_version}`} /><PlanStat label="Tasks" value={String(state.tasks.length)} /><PlanStat label="Overrides" value={String(state.currentPlan.override_count)} /></div>
        {state.currentPlan.update_available ? <div className="mt-5 rounded-xl border border-[#ead9ae] bg-[var(--care-amber)] p-4"><p className="font-medium text-[var(--care-amber-ink)]">Version {state.currentPlan.latest_version} is available</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Upgrading adds new responsibilities. Your personal edits remain intact.</p><Button size="sm" className="mt-3" onClick={onUpgrade} disabled={!owner || !!busy}>{busy === 'upgrade_plan' ? <LoaderCircle className="animate-spin" /> : <Sparkles />}Review and apply</Button></div> : <p className="mt-5 flex items-center gap-2 text-sm text-primary"><CheckCircle2 className="size-4" />This plan uses the latest template.</p>}
        <div className="mt-6 flex flex-wrap gap-2"><Button variant="outline" onClick={onSave} disabled={!owner || !!busy}><Save /> Save as template</Button><Button variant="outline" onClick={onClone} disabled={!owner || !!busy}><Copy /> Clone plan</Button></div>
      </article>
      {state.templates.length > 0 && <section><SectionHeading title="Plan templates" subtitle="Built-in starting points and de-identified templates saved by your care circle." /><div className="mt-4 grid gap-3 md:grid-cols-2"><PaginatedList label="Plan templates" records={state.templates} resetKey={state.selectedRecipient.id}>{state.templates.map((template) => <article key={template.id} data-care-tone={template.category === "medication" ? "plum" : template.category === "mobility" ? "sky" : template.category === "transition" ? "amber" : "peach"} className="rounded-[18px] border bg-card p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-heading font-semibold">{template.name}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{template.category.replace('-', ' ')} · version {template.version}</p></div><Badge variant="outline" className={template.source === 'custom' ? 'bg-[var(--care-amber)] text-[var(--care-amber-ink)]' : 'bg-[var(--care-success)] text-primary'}>{template.source === 'custom' ? 'Saved' : 'Built-in'}</Badge></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{template.description}</p><p className="mt-4 text-xs font-medium">{template.task_count} responsibilities · {template.rule_count} risk rules</p><Button className="mt-4" variant="outline" onClick={() => onCreate(template.template_key)} disabled={!owner || !!busy}><Plus />Use template</Button></article>)}</PaginatedList></div></section>}
    </div>
    <div className="mt-6 flex gap-3 rounded-2xl border border-[#c8dfd0] bg-[var(--care-success)] p-5"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-heading font-semibold">Safe portability</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Templates and clones include responsibility structure only. Trusted facts, timeline events, risks, approvals, care-check history, names, medication names, and past outcomes stay with the original person.</p></div></div>
  </>;
}

function PlanStat({ label, value }: { label: string; value: string }) { return <div data-care-tone={label === "Version" ? "plum" : label === "Tasks" ? "sky" : "peach"} className="min-w-0 rounded-xl border p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-heading text-lg font-semibold">{value}</p></div>; }

function Responsibilities({ tasks, onAdd, onEdit, onComplete, onArchive, busy, writeAllowed }: { tasks: CareTask[]; onAdd: () => void; onEdit: (task: CareTask) => void; onComplete: (id: string) => void; onArchive: (id: string) => void; busy: string | null; writeAllowed: boolean }) {
  return <><PageHeading eyebrow="Shared plan" title="Responsibilities" description="Create, edit, complete, reassign, or archive every care obligation." action={<Button onClick={onAdd} disabled={!writeAllowed}><Plus /> Add responsibility</Button>} /><div className="care-responsibilities mt-8 grid min-w-0 gap-3"><PaginatedList label="Responsibilities" resultsHeading="Your responsibilities" layout="block" records={tasks}>{tasks.map((task) => <div key={task.id} data-care-tone={task.category === "medication" ? "plum" : ["transport", "appointment", "mobility"].includes(task.category) ? "sky" : "peach"} className="flex min-w-0 flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${task.status === 'complete' ? 'bg-secondary text-primary' : 'bg-secondary text-muted-foreground'}`}>{task.status === 'complete' ? <Check className="size-5" /> : <ListChecks className="size-5" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading font-semibold">{task.title}</h3><StatusBadge value={task.status} /></div><p className="mt-1 text-sm text-muted-foreground">{formatDate(task.due_at)} · Owner: {task.owner} · {task.category}</p></div>{writeAllowed && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => onEdit(task)} disabled={!!busy}><Pencil /> Edit</Button>{task.status !== 'complete' && <Button variant="outline" size="sm" onClick={() => onComplete(task.id)} disabled={!!busy}><Check /> Complete</Button>}<Button variant="ghost" size="sm" onClick={() => onArchive(task.id)} disabled={!!busy} className="text-muted-foreground"><Archive /> Remove</Button></div>}</div>)}</PaginatedList></div></>;
}

function Timeline({ state }: { state: DashboardState }) {
  return <><PageHeading eyebrow="Source activity" title="Activity Log" description="The event log shows what changed, where it came from, and when the agent considered it." /><div className="mt-8"><div className="space-y-3"><PaginatedList label="Activity log" records={state.events} resetKey={state.selectedRecipient.id} resultsHeading="Activity">{state.events.map((event) => <div key={event.id} className="relative flex min-w-0 gap-4 rounded-2xl border bg-card p-4"><div className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full border bg-background text-primary"><Activity className="size-4" /></div><div className="min-w-0 pt-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading font-semibold">{event.title}</h3><Badge variant="outline">{event.source}</Badge></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{event.detail}</p><p className="mt-2 text-xs text-muted-foreground">{formatDate(event.occurred_at)}</p></div></div>)}</PaginatedList></div></div></>;
}

function Memory({ beforeFacts, state, onAdd, onEdit, onVerify, onArchive, writeAllowed, busy }: { beforeFacts: React.ReactNode; state: DashboardState; onAdd: () => void; onEdit: (memory: MemoryRecord) => void; onVerify: (id: string) => void; onArchive: (id: string) => void; writeAllowed: boolean; busy: string | null }) {
  return <><PageHeading eyebrow="Structured memory" title="Trusted care facts" description="Review and correct the source-linked facts Carestead may reuse." action={<Button onClick={onAdd} disabled={!writeAllowed}><Plus /> Add trusted fact</Button>} /><div className="mt-6">{beforeFacts}</div><div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><PaginatedList label="Trusted facts" records={state.memories} resetKey={state.selectedRecipient.id} resultsHeading="Saved facts">{state.memories.map((memory) => <article key={memory.id} className="rounded-[20px] border bg-card p-5"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary"><MemoryStick className="size-5" /></span><StatusBadge value={memory.status} /></div><p className="mt-5 text-sm font-medium leading-6">{memory.value}</p><div className="mt-5 border-t pt-4 text-xs text-muted-foreground"><p>Source · {memory.source}</p><p className="mt-1">Confidence · {memory.confidence}</p><p className="mt-1">Updated · {formatDate(memory.updated_at)}</p></div>{writeAllowed && <div className="mt-4 flex flex-wrap gap-2">{memory.status !== 'verified' && <Button size="sm" variant="outline" onClick={() => onVerify(memory.id)} disabled={!!busy}><ShieldCheck /> Verify</Button>}<Button size="sm" variant="outline" onClick={() => onEdit(memory)} disabled={!!busy}><Pencil /> Edit</Button><Button size="sm" variant="ghost" onClick={() => onArchive(memory.id)} disabled={!!busy} className="text-muted-foreground"><Archive /> Remove</Button></div>}</article>)}</PaginatedList></div><div className="mt-6 rounded-2xl border border-[#c8dfd0] bg-[var(--care-success)] p-5"><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-heading font-semibold">Memory policy</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Only stable facts and caregiver-confirmed preferences become long-term memory. Events remain in the timeline, uncertain facts are flagged for review, and every record keeps its source.</p></div></div></div></>;
}

function CareCircle({ state, onInvite, onRenew, onRole, onRemove, busy }: { onRenew: (id: string) => void; state: DashboardState; onInvite: () => void; onRole: (id: string, role: string) => void; onRemove: (id: string) => void; busy: string | null }) {
  const owner = state.currentUser.role === 'owner';
  return <><PageHeading eyebrow="Authenticated workspace" title="Care circle & permissions" description="Every signed-in person receives an explicit role. Authorization is enforced by the API, not only by hidden buttons." action={<Button onClick={onInvite} disabled={!owner}><UserPlus /> Invite member</Button>} /><div className="mt-8 grid min-w-0 gap-4"><PaginatedList label="Care circle" records={state.careCircle} resetKey={state.selectedRecipient.id} resultsHeading="People with access">{state.careCircle.map((member) => <div key={member.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary font-heading font-semibold text-primary">{member.display_name.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading font-semibold">{member.display_name}</h3><StatusBadge value={member.status} />{member.email === state.currentUser.email && <Badge variant="outline" className="bg-[var(--care-success)] text-primary">You</Badge>}</div><p className="mt-1 break-all text-sm text-muted-foreground">{member.email}</p></div><div className="flex flex-wrap items-center gap-2">{owner && member.status === 'invited' && <Button variant="outline" size="sm" onClick={() => onRenew(member.id)} disabled={!!busy}>New invite link</Button>}<select aria-label={`Role for ${member.display_name}`} value={member.role} onChange={(event) => onRole(member.id, event.target.value)} disabled={!owner || member.role === 'owner' || !!busy} className="h-9 rounded-lg border bg-background px-3 text-sm capitalize outline-none focus:ring-2 focus:ring-ring">{member.role === 'owner' && <option value="owner">Owner</option>}<option value="caregiver">Caregiver</option><option value="viewer">Guest</option></select>{owner && member.role !== 'owner' && <Button variant="ghost" size="sm" onClick={() => onRemove(member.id)} disabled={!!busy} className="text-muted-foreground"><Archive /> Remove</Button>}</div></div>)}</PaginatedList></div><div className="mt-6 grid gap-4 md:grid-cols-3"><PermissionCard title="Owner" text="Manages members and roles, and can change all care records." /><PermissionCard title="Caregiver" text="Creates and updates responsibilities, memories, approvals, and checks." /><PermissionCard title="Guest" text="Can review the care plan and evidence but cannot change records." /></div><div className="mt-6 flex gap-3 rounded-2xl border border-[#c8dfd0] bg-[var(--care-success)] p-5"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-primary" /><div><p className="font-heading font-semibold">Identity and audit</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Each person signs in with their own Carestead account. Every mutation is checked server-side and attributed in the audit log.</p></div></div></>;
}

function PermissionCard({ title, text }: { title: string; text: string }) { return <article data-care-tone={title === "Owner" ? "plum" : title === "Caregiver" ? "peach" : "sky"} className="rounded-[20px] border p-5"><p className="font-heading font-semibold">{title}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></article>; }

const evaluationDefinitions: Record<string, string> = {
  Retrieval: 'Can Carestead find the relevant care information, such as responsibilities, recent updates, and supporting facts?',
  Decision: 'Can Carestead choose a sensible next step based on the care situation and the information available?',
  Policy: 'Can Carestead respect consent, permissions, and the need for a caregiver’s approval?',
  Action: 'Can Carestead carry out the intended step correctly, while leaving approval-required steps for a caregiver to review?',
};
function EvaluationScoreCard({ label, value }: { label: string; value: number }) {
  const [flipped, setFlipped] = useState(false);
  return <button type="button" className="care-evaluation-card w-full text-left" aria-label={flipped ? `${label}: show score` : `${label} ${value}%: what this means`} aria-describedby={flipped ? `${label}-meaning` : undefined} aria-pressed={flipped} onClick={() => setFlipped(current => !current)}>
    <span className="care-evaluation-card-inner" data-flipped={flipped}>
      <span className="care-evaluation-card-face rounded-[20px] border bg-card p-5" aria-hidden={flipped}>
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span className="mt-2 block font-heading text-3xl font-semibold">{value}%</span>
        <span className="mt-4 block h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true"><span className="block h-full bg-primary" style={{ width: `${value}%` }} /></span>
        <span className="mt-4 block text-xs font-medium text-primary">What this means ↻</span>
      </span>
      <span className="care-evaluation-card-face care-evaluation-card-back rounded-[20px] border bg-[var(--care-inset)] p-5" aria-hidden={!flipped}>
        <span className="block font-heading font-semibold">{label}</span>
        <span id={`${label}-meaning`} className="mt-2 block text-sm leading-6">{evaluationDefinitions[label]}</span>
        <span className="mt-4 block text-xs font-medium text-primary">Back to score ↻</span>
      </span>
    </span>
  </button>;
}
function Evaluations({ state }: { state: DashboardState }) {
  const filterFields = ([['policy_status', 'Policy result'], ['tool', 'Tool used']] as const)
    .filter(([key]) => new Set(state.traces.map(trace => trace[key]).filter(Boolean)).size > 1);
  const dimensions = [{ label: 'Retrieval', value: state.benchmark.retrieval }, { label: 'Decision', value: state.benchmark.decision }, { label: 'Policy', value: state.benchmark.policy }, { label: 'Action', value: state.benchmark.action }];
  return <><PageHeading eyebrow={`Benchmark ${state.benchmark.version}`} title="Measured agent quality" description={`${state.benchmark.scenarioCount} synthetic scenarios across ${state.benchmark.categories} categories. Scores are calculated from the checked-in benchmark, not placeholders.`} /><div className="mt-8 grid gap-4 md:grid-cols-4">{dimensions.map((item) => <EvaluationScoreCard key={item.label} label={item.label} value={item.value} />)}</div><div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground"><Badge variant="outline" className="bg-[var(--care-success)] text-primary">{state.benchmark.passed} full passes</Badge><Badge variant="outline">{state.benchmark.failed} failures for improvement</Badge><span className="py-1">Failures remain visible instead of being hidden by aggregate scores.</span></div><p className="mt-5 text-sm text-muted-foreground">Filter recorded care checks and actions below. Benchmark scores above summarize the fixed scenario suite and do not change with these filters.</p><div className="mt-6 grid min-w-0 gap-4"><PaginatedList label="Evaluations" filterFields={filterFields} records={state.traces} resetKey={state.selectedRecipient.id} resultsHeading="Evaluation history">{state.traces.map((trace) => <article key={trace.id} className="min-w-0 rounded-2xl border bg-card p-5 md:p-6"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-heading font-semibold">{trace.trigger}</h3><Badge variant="outline" className="bg-[var(--care-success)] text-primary">{trace.policy_status}</Badge></div><p className="mt-2 text-sm leading-6">{trace.decision}</p></div><span className="shrink-0 text-xs text-muted-foreground">{formatDate(trace.created_at)}</span></div><div className="mt-4 grid gap-3 rounded-xl bg-muted/55 p-4 text-xs md:grid-cols-3"><div><p className="font-semibold text-foreground">Evidence</p><p className="mt-1 leading-5 text-muted-foreground">{trace.evidence}</p></div><div><p className="font-semibold text-foreground">Tool</p><p className="mt-1 leading-5 text-muted-foreground">{trace.tool}</p></div><div><p className="font-semibold text-foreground">Outcome</p><p className="mt-1 leading-5 text-muted-foreground">{trace.outcome}</p></div></div></article>)}</PaginatedList></div></>;
}

function Metric({ tone, label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof Activity; tone: string }) { return <div data-care-tone={tone} className="care-metric rounded-[20px] border bg-card p-5 shadow-[0_8px_30px_rgb(35_68_52/0.035)]"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-heading text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div><span className="grid size-10 place-items-center rounded-xl bg-secondary text-primary"><Icon className="size-[19px]" /></span></div></div>; }

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) { return <div><h2 className="font-heading text-xl font-semibold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div>; }

function RiskCard({ risk, onAction, busy }: { risk: Risk; onAction?: () => void; busy: string | null }) {
  const styles = { high: 'border-[#e5c6bd] bg-[var(--care-rose)] text-[var(--care-rose-ink)]', medium: 'border-[#ead9ae] bg-[var(--care-amber)] text-[var(--care-amber-ink)]', low: 'border-[#c8dfd0] bg-[var(--care-success)] text-[var(--care-success-ink)]' }[risk.severity];
  const Icon = risk.kind === 'medication' ? Pill : risk.kind === 'transport' ? Route : CheckCircle2;
  return <article className={`flex flex-col gap-4 rounded-[20px] border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center ${styles}`}><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-card shadow-sm"><Icon className="size-5" /></span><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-[0.12em]">{risk.status.replace('_', ' ')}</p><h3 className="mt-1 font-heading text-[15px] font-semibold leading-5 text-foreground">{risk.title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{risk.detail}</p></div>{onAction && risk.status !== 'resolved' && <Button variant="outline" className="shrink-0 bg-card text-foreground" onClick={onAction} disabled={!!busy}>{risk.kind === 'medication' ? 'Review plan' : 'Assign ride'} <ChevronRight /></Button>}</article>;
}

function ScheduleCard({ task }: { task: CareTask }) { return <div className="rounded-2xl border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-3"><span className="font-heading text-sm font-semibold">{formatDate(task.due_at)}</span><StatusBadge value={task.status} /></div><p className="mt-4 text-sm font-medium leading-5">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">Owner · {task.owner}</p></div>; }

function StatusBadge({ value }: { value: string }) { const done = ['complete','resolved','verified','active','accepted'].includes(value); const attention = ['due_soon','review_due','pending','needs_approval'].includes(value); const Icon = done ? CheckCircle2 : attention ? AlertTriangle : Clock3; return <Badge data-care-tone={done ? 'success' : attention ? 'amber' : 'sky'} variant="outline" className="care-status gap-1 text-[10px] capitalize"><Icon aria-hidden="true" className="size-3" />{value.replaceAll('_', ' ')}</Badge>; }

function Evidence({ icon: Icon, text }: { icon: typeof Activity; text: string }) { return <div className="flex items-center gap-3 text-sm text-muted-foreground"><Icon className="size-4 shrink-0 text-primary" /><span>{text}</span></div>; }

function LoadingState() { return <div className="grid min-h-[60vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Loading the shared care plan…</p></div></div>; }

function ApprovalDialog({ open, onOpenChange, approval, onApprove, busy }: { open: boolean; onOpenChange: (open: boolean) => void; approval: DashboardState['approvals'][number] | undefined; onApprove: () => void; busy: string | null }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Review medication pickup plan</DialogTitle><DialogDescription>Review this recommendation, then choose a caregiver in Care Organizer. Coverage is confirmed when they accept.</DialogDescription></DialogHeader><div className="rounded-xl border border-[#e5c6bd] bg-[var(--care-rose)] p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--care-rose-ink)]" /><div><p className="font-medium">Proposed action</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{approval?.action ?? 'This plan has already been decided.'}</p></div></div></div><div className="space-y-2 text-sm"><p><strong>Why:</strong> the refill is ready and the current supply is nearly finished.</p><p><strong>Guardrail:</strong> this demo records the plan locally; it does not send messages or contact the pharmacy.</p></div><DialogFooter showCloseButton><Button onClick={onApprove} disabled={!approval || !!busy}>{busy === 'approve_plan' ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}Approve plan</Button></DialogFooter></DialogContent></Dialog>;
}

function formValue(data: FormData, name: string) { const value = data.get(name); return typeof value === 'string' ? value : ''; }


function TaskDialog({ open, task, onOpenChange, onSave, busy, members, zone, canCreateCategory, categories }: { canCreateCategory: boolean; categories: string[]; members: DashboardState['careCircle']; zone: string; open: boolean; task?: CareTask; onOpenChange: (open: boolean) => void; onSave: (payload: Record<string, unknown>) => void; busy: string | null }) {
  const [dateError, setDateError] = useState('');
  const [category, setCategory] = useState(task?.category || 'general');
  function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) { event.preventDefault(); const data = new FormData(event.currentTarget); let dueAt: string; try { dueAt = localToInstant(formValue(data, 'dueAt'), zone); setDateError(''); } catch (error) { setDateError(error instanceof Error ? error.message : 'Check the date and time.'); return; } onSave({ title: formValue(data, 'title'), owner: formValue(data, 'owner'), dueAt, category: formValue(data, 'category'), status: formValue(data, 'status') }); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><form onSubmit={submit}><DialogHeader><DialogTitle>{task ? 'Edit responsibility' : 'Add a responsibility'}</DialogTitle><DialogDescription>Keep the owner, timing, and operational state clear for the entire care circle.</DialogDescription></DialogHeader>{dateError && <p role="alert" className="mt-3 text-sm text-destructive">{dateError}</p>}<div className="mt-5 grid gap-4"><label htmlFor="task-title" className="grid gap-1.5 text-sm font-medium">Responsibility<Input id="task-title" name="title" defaultValue={task?.title} placeholder="e.g. Confirm specialist referral" required /></label><div className="grid gap-4 sm:grid-cols-2"><label htmlFor="task-owner" className="grid gap-1.5 text-sm font-medium">Owner<select id="task-owner" name="owner" defaultValue={task?.owner ?? 'Unassigned'} className="h-9 rounded-lg border bg-background px-3 text-sm"><option value="Unassigned">Unassigned</option>{members.filter((member) => member.status === 'active' && member.role !== 'viewer').map((member) => <option key={member.id} value={member.display_name}>{member.display_name}</option>)}</select></label><CategorySelect id="task-category" value={category} onChange={setCategory} categories={categories} canCreate={canCreateCategory} disabled={!!busy} /></div><div className="grid gap-4 sm:grid-cols-2"><label htmlFor="task-due" className="grid gap-1.5 text-sm font-medium">Due date and time<Input id="task-due" name="dueAt" type="datetime-local" defaultValue={task?.due_at ? localInput(task.due_at, zone) : ''} required /></label><label htmlFor="task-status" className="grid gap-1.5 text-sm font-medium">Status<select id="task-status" name="status" defaultValue={task?.status ?? 'open'} className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="open">Open</option><option value="due_soon">Due soon</option><option value="assigned">Assigned</option><option value="scheduled">Scheduled</option><option value="complete">Complete</option></select></label></div></div><DialogFooter className="mt-5" showCloseButton><Button type="submit" disabled={!!busy}>{busy?.includes('task') ? <LoaderCircle className="animate-spin" /> : task ? <Pencil /> : <Plus />}{task ? 'Save changes' : 'Add to plan'}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function MemoryDialog({ open, memory, onOpenChange, onSave, busy }: { open: boolean; memory?: MemoryRecord; onOpenChange: (open: boolean) => void; onSave: (payload: Record<string, string>) => void; busy: string | null }) {
  function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ value: formValue(data, 'value'), kind: formValue(data, 'kind'), source: formValue(data, 'source'), confidence: formValue(data, 'confidence'), status: formValue(data, 'status') }); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><form onSubmit={submit}><DialogHeader><DialogTitle>{memory ? 'Edit trusted fact' : 'Add a trusted fact'}</DialogTitle><DialogDescription>Every reusable fact needs a source, confidence level, and review state.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><label htmlFor="memory-value" className="grid gap-1.5 text-sm font-medium">Fact<Input id="memory-value" name="value" defaultValue={memory?.value} placeholder="e.g. Maya usually handles pharmacy pickup" required /></label><div className="grid gap-4 sm:grid-cols-2"><label htmlFor="memory-kind" className="grid gap-1.5 text-sm font-medium">Type<Input id="memory-kind" name="kind" defaultValue={memory?.kind} placeholder="Preference" /></label><label htmlFor="memory-source" className="grid gap-1.5 text-sm font-medium">Source<Input id="memory-source" name="source" defaultValue={memory?.source} placeholder="Confirmed by caregiver" required /></label></div><div className="grid gap-4 sm:grid-cols-2"><label htmlFor="memory-confidence" className="grid gap-1.5 text-sm font-medium">Confidence<select id="memory-confidence" name="confidence" defaultValue={memory?.confidence ?? 'medium'} className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label><label htmlFor="memory-status" className="grid gap-1.5 text-sm font-medium">Status<select id="memory-status" name="status" defaultValue={memory?.status ?? 'review_due'} className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="review_due">Review due</option><option value="verified">Verified</option></select></label></div></div><DialogFooter className="mt-5" showCloseButton><Button type="submit" disabled={!!busy}>{busy?.includes('memory') ? <LoaderCircle className="animate-spin" /> : memory ? <Pencil /> : <Plus />}{memory ? 'Save changes' : 'Add for review'}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function MemberDialog({ open, onOpenChange, onInvite, busy }: { open: boolean; onOpenChange: (open: boolean) => void; onInvite: (payload: Record<string, string>) => void; busy: string | null }) {
  function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) { event.preventDefault(); const data = new FormData(event.currentTarget); onInvite({ email: formValue(data, 'email'), displayName: formValue(data, 'displayName'), role: formValue(data, 'role') }); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><form onSubmit={submit}><DialogHeader><DialogTitle>Invite a care-circle member</DialogTitle><DialogDescription>Choose their role, then share the invitation link with them privately. The link expires after seven days.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><label htmlFor="member-name" className="grid gap-1.5 text-sm font-medium">Display name<Input id="member-name" name="displayName" placeholder="Maya" required /></label><label htmlFor="member-email" className="grid gap-1.5 text-sm font-medium">Email<Input id="member-email" name="email" type="email" placeholder="maya@example.com" required /></label><label htmlFor="member-role" className="grid gap-1.5 text-sm font-medium">Role<select id="member-role" name="role" defaultValue="caregiver" className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="caregiver">Caregiver — can update care records</option><option value="viewer">Guest — read only</option></select></label></div><DialogFooter className="mt-5" showCloseButton><Button type="submit" disabled={!!busy}>{busy === 'invite_member' ? <LoaderCircle className="animate-spin" /> : <UserPlus />}Record invitation</Button></DialogFooter></form></DialogContent></Dialog>;
}

function SaveTemplateDialog({ open, onOpenChange, onSave, busy }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (payload: Record<string, string>) => void; busy: string | null }) {
  function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ name: formValue(data, 'name') }); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><form onSubmit={submit}><DialogHeader><DialogTitle>Save plan as a reusable template</DialogTitle><DialogDescription>Carestead copies the responsibility structure and removes person-specific names and medication details.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><label htmlFor="saved-template-name" className="grid gap-1.5 text-sm font-medium">Template name<Input id="saved-template-name" name="name" placeholder="e.g. Weekly family care routine" required /></label><div className="rounded-xl border border-[#c8dfd0] bg-[var(--care-success)] p-4 text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Not copied:</strong> memories, timeline events, risks, approvals, care-check history, outcomes, or care-circle membership.</div></div><DialogFooter className="mt-5" showCloseButton><Button type="submit" disabled={!!busy}>{busy === 'save_plan_template' ? <LoaderCircle className="animate-spin" /> : <Save />}Save template</Button></DialogFooter></form></DialogContent></Dialog>;
}

function ClonePlanDialog({ open, onOpenChange, onClone, busy }: { open: boolean; onOpenChange: (open: boolean) => void; onClone: (payload: Record<string, string>) => void; busy: string | null }) {
  function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) { event.preventDefault(); const data = new FormData(event.currentTarget); onClone({ displayName: formValue(data, 'displayName'), timezone: formValue(data, 'timezone'), consentAccepted: formValue(data, 'consentAccepted'), nonClinicalAcknowledged: formValue(data, 'nonClinicalAcknowledged') }); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><form onSubmit={submit}><DialogHeader><DialogTitle>Clone this plan for another person</DialogTitle><DialogDescription>A new care recipient receives fresh, unassigned responsibilities based on this plan.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><label htmlFor="clone-name" className="grid gap-1.5 text-sm font-medium">New person&apos;s display name<Input id="clone-name" name="displayName" placeholder="e.g. Sam" required /></label><label htmlFor="clone-timezone" className="grid gap-1.5 text-sm font-medium">Timezone<Input id="clone-timezone" name="timezone" defaultValue="America/Toronto" required /></label><div className="rounded-xl border border-[#e5c6bd] bg-[var(--care-rose)] p-4 text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Privacy boundary:</strong> personal facts, event history, owners, risks, approvals, and outcomes will not move.</div><label className="flex items-start gap-3 text-sm leading-5"><input name="consentAccepted" type="checkbox" className="mt-1 size-4" required /><span>I confirm consent for the new recipient&apos;s care-coordination record.</span></label><label className="flex items-start gap-3 text-sm leading-5"><input name="nonClinicalAcknowledged" type="checkbox" className="mt-1 size-4" required /><span>I understand Carestead is not a clinical or emergency-response system.</span></label></div><DialogFooter className="mt-5" showCloseButton><Button type="submit" disabled={!!busy}>{busy === 'clone_plan' ? <LoaderCircle className="animate-spin" /> : <Copy />}Clone structure</Button></DialogFooter></form></DialogContent></Dialog>;
}

function ProfileDialog({ open, onOpenChange, onSave, profile, busy }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (payload: Record<string, string>) => void; profile?: DashboardState['profile']; busy: string | null }) {
  function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ preferredName: formValue(data, 'preferredName'), pronouns: formValue(data, 'pronouns'), homeBase: formValue(data, 'homeBase'), careContext: formValue(data, 'careContext'), communicationNotes: formValue(data, 'communicationNotes'), mobilityNotes: formValue(data, 'mobilityNotes'), emergencyPlan: formValue(data, 'emergencyPlan') }); }
  const area = 'min-h-20 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><form onSubmit={submit}><DialogHeader><DialogTitle>Edit handover profile</DialogTitle><DialogDescription>Keep this short and operational so another caregiver can understand the person quickly.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><div className="grid gap-4 sm:grid-cols-3"><label htmlFor="profile-name" className="grid gap-1.5 text-sm font-medium">Preferred name<Input id="profile-name" name="preferredName" defaultValue={profile?.preferred_name} required /></label><label htmlFor="profile-pronouns" className="grid gap-1.5 text-sm font-medium">Pronouns<Input id="profile-pronouns" name="pronouns" defaultValue={profile?.pronouns} placeholder="Optional" /></label><label htmlFor="profile-home" className="grid gap-1.5 text-sm font-medium">Home base<Input id="profile-home" name="homeBase" defaultValue={profile?.home_base} placeholder="City or setting" /></label></div><label htmlFor="profile-context" className="grid gap-1.5 text-sm font-medium">Care context<textarea id="profile-context" name="careContext" defaultValue={profile?.care_context} className={area} placeholder="What should a new caregiver understand first?" /></label><div className="grid gap-4 sm:grid-cols-2"><label htmlFor="profile-communication" className="grid gap-1.5 text-sm font-medium">Communication notes<textarea id="profile-communication" name="communicationNotes" defaultValue={profile?.communication_notes} className={area} /></label><label htmlFor="profile-mobility" className="grid gap-1.5 text-sm font-medium">Mobility and access<textarea id="profile-mobility" name="mobilityNotes" defaultValue={profile?.mobility_notes} className={area} /></label></div><label htmlFor="profile-emergency" className="grid gap-1.5 text-sm font-medium">Urgent situation plan<textarea id="profile-emergency" name="emergencyPlan" defaultValue={profile?.emergency_plan} className={area} placeholder="Keep this aligned with the documented clinical or emergency plan." /></label></div><DialogFooter className="mt-5" showCloseButton><Button type="submit" disabled={!!busy}>{busy === 'update_profile' ? <LoaderCircle className="animate-spin" /> : <Save />}Save profile</Button></DialogFooter></form></DialogContent></Dialog>;
}

function SupportContactDialog({ open, onOpenChange, onSave, contact, busy }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (payload: Record<string, string>) => void; contact?: SupportContact; busy: string | null }) {
  function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ name: formValue(data, 'name'), relationship: formValue(data, 'relationship'), contactType: formValue(data, 'contactType'), phone: formValue(data, 'phone'), email: formValue(data, 'email'), organization: formValue(data, 'organization'), notes: formValue(data, 'notes'), priority: formValue(data, 'priority') }); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><form onSubmit={submit}><DialogHeader><DialogTitle>{contact ? 'Edit support contact' : 'Add a support contact'}</DialogTitle><DialogDescription>Include the people, providers, and services another caregiver may need during a handover.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><label htmlFor="support-name" className="grid gap-1.5 text-sm font-medium">Name<Input id="support-name" name="name" defaultValue={contact?.name} required /></label><label htmlFor="support-relationship" className="grid gap-1.5 text-sm font-medium">Role or relationship<Input id="support-relationship" name="relationship" defaultValue={contact?.relationship} placeholder="Family caregiver, pharmacy…" required /></label></div><div className="grid gap-4 sm:grid-cols-2"><label htmlFor="support-type" className="grid gap-1.5 text-sm font-medium">Type<select id="support-type" name="contactType" defaultValue={contact?.contact_type ?? 'person'} className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="person">Person</option><option value="provider">Provider</option><option value="service">Service</option></select></label><label htmlFor="support-priority" className="grid gap-1.5 text-sm font-medium">Priority<select id="support-priority" name="priority" defaultValue={contact?.priority ?? 'standard'} className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="primary">Primary</option><option value="important">Important</option><option value="standard">Standard</option></select></label></div><label htmlFor="support-org" className="grid gap-1.5 text-sm font-medium">Organization<Input id="support-org" name="organization" defaultValue={contact?.organization} placeholder="Optional" /></label><div className="grid gap-4 sm:grid-cols-2"><label htmlFor="support-phone" className="grid gap-1.5 text-sm font-medium">Phone<Input id="support-phone" name="phone" type="tel" defaultValue={contact?.phone} /></label><label htmlFor="support-email" className="grid gap-1.5 text-sm font-medium">Email<Input id="support-email" name="email" type="email" defaultValue={contact?.email} /></label></div><label htmlFor="support-notes" className="grid gap-1.5 text-sm font-medium">What they help with<textarea id="support-notes" name="notes" defaultValue={contact?.notes} className="min-h-20 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></label></div><DialogFooter className="mt-5" showCloseButton><Button type="submit" disabled={!!busy}>{busy?.includes('support_contact') ? <LoaderCircle className="animate-spin" /> : contact ? <Pencil /> : <Plus />}{contact ? 'Save contact' : 'Add contact'}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function ConsentDialog({ open, onOpenChange, onSave, consent, busy }: { open: boolean; onOpenChange: (open: boolean) => void; onSave: (payload: Record<string, string>) => void; consent?: DashboardState['consent']; busy: string | null }) {
  function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ consentStatus: formValue(data, 'consentStatus'), retentionDays: formValue(data, 'retentionDays'), purpose: formValue(data, 'purpose'), nonClinicalAcknowledged: formValue(data, 'nonClinicalAcknowledged') }); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-xl"><form onSubmit={submit}><DialogHeader><DialogTitle>Manage consent and retention</DialogTitle><DialogDescription>Consent changes are attributed in the audit record. Withdrawing consent pauses care-data changes and agent checks.</DialogDescription></DialogHeader><div className="mt-5 grid gap-4"><label htmlFor="consent-status" className="grid gap-1.5 text-sm font-medium">Consent status<select id="consent-status" name="consentStatus" defaultValue={consent?.status ?? 'active'} className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="active">Active</option><option value="withdrawn">Withdrawn — pause processing</option></select></label><label htmlFor="retention-days" className="grid gap-1.5 text-sm font-medium">Retention period<select id="retention-days" name="retentionDays" defaultValue={consent?.retention_days ?? '365'} className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option><option value="0">No automatic expiry</option></select></label><label htmlFor="consent-purpose" className="grid gap-1.5 text-sm font-medium">Permitted purpose<textarea id="consent-purpose" name="purpose" defaultValue={consent?.purpose} className="min-h-24 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" required /></label><label className="flex items-start gap-3 text-sm leading-5"><input name="nonClinicalAcknowledged" type="checkbox" className="mt-1 size-4" required /><span>I understand Carestead supports coordination only and does not provide clinical decisions or emergency response.</span></label></div><DialogFooter className="mt-5" showCloseButton><Button type="submit" disabled={!!busy}>{busy === 'update_consent' ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}Save controls</Button></DialogFooter></form></DialogContent></Dialog>;
}

function DeleteRecipientDialog({ open, onOpenChange, onDelete, recipientName, busy }: { open: boolean; onOpenChange: (open: boolean) => void; onDelete: (payload: Record<string, string>) => void; recipientName: string; busy: string | null }) {
  function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) { event.preventDefault(); const data = new FormData(event.currentTarget); onDelete({ confirmName: formValue(data, 'confirmName') }); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><form onSubmit={submit}><DialogHeader><DialogTitle>Permanently delete {recipientName}</DialogTitle><DialogDescription>This cannot be undone. Care records, profile, contacts, plan, consent, notifications, and access assignments will be removed. Google Calendar events and delivered invitations remain outside Carestead. Cancel those appointments in Calendar first if needed.</DialogDescription></DialogHeader><div className="mt-5 rounded-xl border border-[#e5c6bd] bg-[var(--care-rose)] p-4 text-sm leading-6 text-muted-foreground">An accountability receipt records that a verified deletion occurred, but it does not retain the deleted care content.</div><label htmlFor="delete-confirm" className="mt-4 grid gap-1.5 text-sm font-medium">Type <strong>{recipientName}</strong> to confirm<Input id="delete-confirm" name="confirmName" autoComplete="off" required /></label><DialogFooter className="mt-5" showCloseButton><Button type="submit" variant="destructive" disabled={!!busy}>{busy === 'delete_recipient' ? <LoaderCircle className="animate-spin" /> : <Trash2 />}Permanently delete</Button></DialogFooter></form></DialogContent></Dialog>;
}
