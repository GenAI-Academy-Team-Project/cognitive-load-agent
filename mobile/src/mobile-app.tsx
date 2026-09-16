import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ClipboardList, HeartPulse, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { CareChat } from '@/components/care-chat';
import { CareCalendar } from '@/components/care-calendar';
import { Button } from '@/components/ui/button';
import type { DashboardState } from '@/lib/types';
import { macBackend, openWeb } from './platform';

type Tab = 'Today' | 'Handover' | 'Calendar' | 'Account';
const tabs = [{ label: 'Today', icon: ClipboardList }, { label: 'Handover', icon: Users }, { label: 'Calendar', icon: CalendarDays }, { label: 'Account', icon: ShieldCheck }] as const;

export function MobileApp() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [tab, setTab] = useState<Tab>('Today');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [refreshKey, setRefreshKey] = useState(0);
  const selected = useRef('');
  const generation = useRef(0);
  const operation = useRef(false);

  const refresh = useCallback(async (recipientId = selected.current) => {
    if (operation.current) return;
    operation.current = true;
    const version = ++generation.current;
    setBusy(true); setError(''); setMessage('');
    // Clear the previous recipient immediately; failed switches never show the wrong person's data.
    if (recipientId !== selected.current) setState(null);
    try {
      const response = await fetch(`/api/state${recipientId ? `?recipientId=${encodeURIComponent(recipientId)}` : ''}`);
      if (response.status === 401) return;
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load the care plan.');
      if (version !== generation.current) return;
      selected.current = data.selectedRecipient.id;
      setState(data); setRefreshKey((value) => value + 1);
    } catch (reason) {
      if (version === generation.current) setError(reason instanceof Error ? reason.message : 'Unable to connect. Tap Refresh to try again.');
    } finally {
      operation.current = false;
      if (version === generation.current) setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('online', update); window.addEventListener('offline', update);
    document.addEventListener('visibilitychange', resume);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); document.removeEventListener('visibilitychange', resume); };
  }, [refresh]);

  async function mutate(action: string, id: string) {
    if (!state || operation.current) return;
    operation.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, recipientId: state.selectedRecipient.id }) });
      if (response.status === 401) return;
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The change could not be saved.');
      setState(data); setMessage(action === 'complete_task' ? 'Responsibility completed.' : 'Plan approved.');
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : 'Connection interrupted.'} Refresh to check the outcome before trying again.`);
    } finally { operation.current = false; setBusy(false); }
  }

  async function signOut() {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST' });
      if (!response.ok) throw new Error('Unable to sign out. Check your connection and try again.');
      setState(null); window.location.replace('/sign-in');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to sign out.'); }
    finally { operation.current = false; setBusy(false); }
  }

  async function openSite(view: string) {
    try { await openWeb(`/?view=${encodeURIComponent(view)}&recipientId=${encodeURIComponent(selected.current)}`); }
    catch { setError('The browser could not be opened. Try again.'); }
  }

  const canWrite = state?.currentUser.role !== 'viewer' && state?.consent.status === 'active';
  const tasks = state?.tasks.filter((task) => !['complete', 'archived'].includes(task.status)).sort((a, b) => a.due_at.localeCompare(b.due_at)) || [];
  const formatWhen = (date: string) => new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: state?.selectedRecipient.timezone || 'UTC' }).format(new Date(date));

  return <div className="mobile-shell">
    <header className="mobile-header">
      <a className="mobile-brand" href="/" aria-label="Carestead home"><HeartPulse aria-hidden="true" /><span>Carestead</span></a>
      <Button variant="ghost" disabled={busy} onClick={() => void refresh()} aria-label="Refresh care plan"><RefreshCw className={busy ? 'animate-spin' : ''} /></Button>
    </header>
    <main className="mobile-content" aria-busy={busy}>
      {offline && <p className="mobile-notice" role="status">You’re offline. Reconnect before making changes. This view may be out of date.</p>}
      {error && <p className="mobile-error" role="alert">{error}</p>}
      {message && <p className="mobile-notice" role="status">{message}</p>}
      {!state ? <section className="mobile-card"><h1>{busy ? 'Opening your care plan…' : 'Your care plan is unavailable'}</h1><p>Use Refresh to load the latest shared information.</p></section> : <>
        <label className="mobile-recipient">Caring for<select aria-label="Care recipient" value={state.selectedRecipient.id} disabled={busy} onChange={(event) => void refresh(event.target.value)}>{state.recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.display_name}</option>)}</select></label>
        <div className="mobile-heading"><p>{state.currentPlan.name}</p><h1>{tab === 'Today' ? 'Keep the next step clear.' : tab}</h1></div>
        {!canWrite && <p className="mobile-notice">{state.consent.status !== 'active' ? 'Consent is withdrawn. Care changes and chat are paused.' : 'You have view-only access to this care plan.'}</p>}

        {tab === 'Today' && <>
          {state.approvals.filter((approval) => approval.status === 'pending').map((approval) => <section className="mobile-card mobile-review" key={approval.id}><p className="mobile-eyebrow">Your review is needed</p><h2>Proposed care action</h2><p>{approval.action}</p><Button disabled={!canWrite || busy || offline} onClick={() => void mutate('approve_plan', approval.id)}>Approve this plan</Button></section>)}
          <section aria-labelledby="responsibilities-title"><div className="mobile-section-title"><h2 id="responsibilities-title">Next responsibilities</h2><span>{tasks.length} open</span></div>
            {!tasks.length && <p className="mobile-card">No open responsibilities.</p>}
            {tasks.map((task) => <article className="mobile-card mobile-task" key={task.id}><div><p className="mobile-eyebrow">{task.category}</p><h3>{task.title}</h3><p>{task.owner} · {formatWhen(task.due_at)}</p></div><Button variant="outline" aria-label={`Complete ${task.title}`} disabled={!canWrite || busy || offline} onClick={() => void mutate('complete_task', task.id)}><Check aria-hidden="true" /><span>Complete</span></Button></article>)}
          </section>
          <section className="mobile-card"><h2>Care updates</h2>{state.notifications.filter((item) => item.delivery_state === 'delivered').slice(0, 5).map((item) => <div className="mobile-update" key={item.id}><h3>{item.title}</h3><p>{item.detail}</p></div>)}{!state.notifications.some((item) => item.delivery_state === 'delivered') && <p>No delivered updates.</p>}</section>
        </>}

        {tab === 'Handover' && <>
          <section className="mobile-card"><h2>{state.profile.preferred_name || state.selectedRecipient.display_name}</h2><p>{state.profile.care_context || 'No care context recorded yet.'}</p><dl>{[['Communication', state.profile.communication_notes], ['Mobility', state.profile.mobility_notes], ['Home base', state.profile.home_base], ['Urgent plan', state.profile.emergency_plan]].map(([label, value]) => value && <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
          <section className="mobile-card"><h2>Latest update</h2><p>{state.events[0] ? `${state.events[0].title} — ${state.events[0].detail}` : 'No updates recorded.'}</p></section>
          <section className="mobile-card"><h2>Needs attention</h2>{state.risks.filter((risk) => risk.status !== 'resolved').map((risk) => <div className="mobile-update" key={risk.id}><h3>{risk.title}</h3><p>{risk.severity} priority · {risk.detail}</p></div>)}{!state.risks.some((risk) => risk.status !== 'resolved') && <p>No unresolved risks.</p>}</section>
          <section className="mobile-card"><h2>People to know</h2>{state.supportContacts.map((contact) => <div className="mobile-update" key={contact.id}><h3>{contact.name}</h3><p>{contact.relationship}{contact.phone ? ` · ${contact.phone}` : ''}</p><p>{contact.notes}</p></div>)}{!state.supportContacts.length && <p>No contacts recorded.</p>}</section>
        </>}

        {tab === 'Calendar' && <div className="mobile-calendar"><p className="mobile-notice">{macBackend ? 'Connect Google from Carestead in your Mac browser using the same account, then return here and tap Refresh.' : 'Google connection setup opens Carestead in your browser. Sign in with the same account, connect Google, then return and tap Refresh.'}</p><CareCalendar key={`${state.selectedRecipient.id}:${refreshKey}`} state={state} onCompleted={() => void refresh()} /></div>}

        {tab === 'Account' && <>
          <section className="mobile-card"><h2>{state.currentUser.displayName}</h2><p>{state.currentUser.email}</p><p>{state.currentUser.role} for {state.selectedRecipient.display_name}</p><Button variant="outline" disabled={busy} onClick={() => void signOut()}>Sign out</Button></section>
          <section className="mobile-card"><h2>Your shared workspace</h2><p>Manage invitations, exports, privacy settings, and delivery preferences on the Carestead website. Your browser may ask you to sign in separately.</p><div className="mobile-actions"><Button variant="outline" onClick={() => void openSite('Privacy & data')}>Privacy & data</Button><Button variant="outline" onClick={() => void openSite('Care circle')}>Care circle</Button><Button variant="outline" onClick={() => void openSite('Notifications')}>Delivery preferences</Button></div></section>
          <section className="mobile-card"><h2>About this pilot</h2><p>Care information is loaded from your shared workspace. Offline editing and native push notifications are not enabled. Typed chat is available; voice depends on device support.</p></section>
        </>}
        <p className="mobile-disclaimer">Carestead supports care coordination. It does not replace clinical judgment or emergency services.</p>
        {state.consent.status === 'active' && !busy && <CareChat key={state.selectedRecipient.id} recipientId={state.selectedRecipient.id} recipientName={state.selectedRecipient.display_name} canWrite={canWrite && !offline} onActionCompleted={() => void refresh()} />}
      </>}
    </main>
    <nav className="mobile-tabs" aria-label="Main navigation">{tabs.map(({ label, icon: Icon }) => <button key={label} disabled={busy} aria-current={tab === label ? 'page' : undefined} onClick={() => { setTab(label); window.scrollTo({ top: 0 }); }}><Icon aria-hidden="true" /><span>{label}</span></button>)}</nav>
  </div>;
}
