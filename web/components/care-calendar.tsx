'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, ExternalLink, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { localInput } from '@/lib/calendar-time';
import type { CalendarAction, CalendarAppointment, CalendarState } from '@/lib/calendar-types';
import type { DashboardState } from '@/lib/types';

const selectClass = 'h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';
const formatWhen = (value: string, timeZone: string) => new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value));
function calendarLink(value?: string | null) {
  try { const url = new URL(value || ''); return url.protocol === 'https:' && ['calendar.google.com', 'www.google.com'].includes(url.hostname) ? url.href : null; } catch { return null; }
}

export function CareCalendar({ state, onCompleted }: { state: DashboardState; onCompleted: () => void }) {
  const recipientId = state.selectedRecipient.id;
  const canWrite = state.currentUser.role !== 'viewer' && state.consent.status === 'active';
  const [data, setData] = useState<CalendarState | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<CalendarAppointment | 'new' | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/calendar?recipientId=${encodeURIComponent(recipientId)}`);
    const result = await response.json() as CalendarState;
    if (!response.ok) throw new Error(result.error || 'Calendar could not be loaded.');
    setData(result);
  }, [recipientId]);
  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const callbackNotice = url.searchParams.get('calendarNotice') || '';
    if (callbackNotice) { url.searchParams.delete('calendarNotice'); window.history.replaceState(null, '', url); }
    fetch(`/api/calendar?recipientId=${encodeURIComponent(recipientId)}`).then(async (response) => {
      const result = await response.json() as CalendarState;
      if (!response.ok) throw new Error(result.error || 'Calendar could not be loaded.');
      if (active) { setData(result); setNotice(callbackNotice); }
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [recipientId]);

  async function act(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, recipientId, ...payload }) });
      const result = await response.json() as { error?: string; url?: string };
      if (!response.ok) throw new Error(result.error || 'Calendar action failed.');
      if (result.url) { window.location.assign(result.url); return true; }
      await refresh();
      if (action === 'approve') { setNotice('Google Calendar confirmed the action. Carestead has been updated.'); onCompleted(); }
      if (action === 'select_calendar') setNotice('Calendar selected for this recipient.');
      if (action === 'disconnect') setNotice('Google account disconnected from Carestead. Existing Google events remain on their calendars.');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Calendar action failed.');
      await refresh().catch(() => {});
      return false;
    } finally { setBusy(false); }
  }
  const connected = data?.connection?.status === 'connected' && data.configured;
  const unresolved = data?.actions.filter((action) => !['executed', 'rejected'].includes(action.status)) || [];
  const activeAppointments = data?.appointments.filter((appointment) => appointment.status === 'confirmed') || [];

  return <>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">{state.selectedRecipient.display_name}&apos;s care plan</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">Calendar</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Schedule care appointments, review invitations, and keep the care plan up to date.</p></div>
      <Button disabled={busy || !canWrite || !connected || !data?.binding} onClick={() => setEditor('new')}><Plus /> Schedule appointment</Button>
    </div>
    {error && <p role="alert" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
    {notice && <output className="block mt-5 rounded-xl border bg-secondary p-4 text-sm text-primary">{notice}</output>}
    {!data ? <output className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading calendar…</output> : <>
      <section aria-label="Google Calendar connection" className="mt-8 rounded-[22px] border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><CalendarDays className="size-5" /></span><div><h2 className="font-heading text-lg font-semibold">Google Calendar</h2><p className="mt-1 text-sm text-muted-foreground">{data.connection?.email || 'Connect the Google account you use for care appointments.'}</p><p className="mt-1 text-xs text-muted-foreground">Calendar access sends invitations. Your Gmail inbox is not accessed.</p></div></div><Badge variant="outline">{connected ? 'Connected' : data.connection?.status === 'reconnect_required' ? 'Reconnect required' : 'Not connected'}</Badge></div>
        {!data.configured && <p className="mt-4 text-sm text-muted-foreground">Google Calendar is off or needs credentials. An owner can review it in Integrations. Your local tasks and timeline still work.</p>}
        {data.error && <p role="alert" className="mt-4 text-sm text-destructive">{data.error}</p>}
        {!canWrite && <p className="mt-4 text-sm text-muted-foreground">{state.consent.status !== 'active' ? 'Calendar actions are paused while recipient consent is withdrawn.' : 'Owners and caregivers can connect accounts and schedule appointments.'}</p>}
        <div className="mt-5 flex flex-wrap items-end gap-3">
          {connected && <div className="min-w-0 flex-1 sm:max-w-md"><label htmlFor="recipient-calendar" className="mb-2 block text-sm font-medium">Calendar for {state.selectedRecipient.display_name}</label><select id="recipient-calendar" className={selectClass} value={data.binding?.calendar_id || ''} disabled={busy || !canWrite || !data.calendars.length} onChange={(event) => act('select_calendar', { calendarId: event.target.value })}><option value="" disabled>Choose your calendar</option>{data.binding && !data.calendars.some((calendar) => calendar.id === data.binding!.calendar_id) && <option value={data.binding.calendar_id}>{data.binding.calendar_name}</option>}{data.calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>)}</select></div>}
          {!connected && <Button disabled={busy || !canWrite || !data.configured} onClick={() => act('connect')}>{data.connection?.status === 'reconnect_required' ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}</Button>}
          {connected && <Button variant="outline" disabled={busy} onClick={() => setDisconnectOpen(true)}>Disconnect</Button>}
          <Button variant="ghost" disabled={busy} onClick={async () => { setBusy(true); try { await refresh(); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Refresh failed.'); } finally { setBusy(false); } }}><RefreshCw /> Refresh</Button>
        </div>
      </section>
      {unresolved.length > 0 && <section aria-label="Calendar approvals" className="mt-8"><h2 className="font-heading text-xl font-semibold">Review before sending</h2><p className="mt-2 text-sm text-muted-foreground">Invitations and changes go to the guests below. Review the details shared outside Carestead.</p><div className="mt-4 space-y-4">{unresolved.map((action) => <article key={action.id} className="rounded-[22px] border bg-card p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-heading text-lg font-semibold">{action.kind === 'create' ? 'New appointment' : action.kind === 'cancel' ? 'Cancel appointment' : 'Reschedule appointment'}</h3><Badge variant="outline">{action.status}</Badge></div><AppointmentPreview action={action} recipientName={state.selectedRecipient.display_name} />{action.error && <p className="mt-4 text-sm text-destructive">{action.error}</p>}<div className="mt-5 flex flex-wrap gap-2"><Button disabled={busy || !canWrite || !connected} onClick={() => act('approve', { actionId: action.id })}>{busy ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}{action.status === 'pending' ? action.kind === 'cancel' ? 'Approve cancellation and notify guests' : action.kind === 'reschedule' ? 'Approve change and notify guests' : 'Approve and send invite' : 'Retry / check result'}</Button>{['pending', 'failed'].includes(action.status) && <Button variant="outline" disabled={busy || !canWrite} onClick={() => act('reject', { actionId: action.id })}>Discard proposal</Button>}</div>{action.status === 'executing' && <p className="mt-3 text-xs text-muted-foreground">Processing with Google. If interrupted, check the result after two minutes.</p>}</article>)}</div></section>}
      <section aria-label="Carestead appointments" className="mt-8"><h2 className="font-heading text-xl font-semibold">Care appointments</h2><p className="mt-2 text-sm text-muted-foreground">Appointments scheduled through Carestead. Changes made directly in Google are checked when preparing a change.</p><div className="mt-4 overflow-hidden rounded-[22px] border bg-card">{!activeAppointments.length ? <div className="p-8 text-center"><CalendarDays className="mx-auto size-7 text-primary" /><p className="mt-3 font-medium">No calendar appointments yet</p><p className="mt-2 text-sm text-muted-foreground">Connect your account, choose a calendar, then schedule the next care appointment.</p></div> : activeAppointments.map((appointment, index) => <article key={appointment.id} className={`p-5 ${index ? 'border-t' : ''}`}><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><h3 className="font-heading font-semibold">{appointment.title}</h3><p className="mt-1 text-sm">{formatWhen(appointment.start_at, appointment.timezone)} – {formatWhen(appointment.end_at, appointment.timezone)}</p><p className="mt-1 text-xs text-muted-foreground">{appointment.timezone}{appointment.location ? ` · ${appointment.location}` : ''}</p>{calendarLink(appointment.html_link) && <a className="mt-3 inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4" href={calendarLink(appointment.html_link)!} target="_blank" rel="noreferrer">Open in Google Calendar <ExternalLink className="size-3" /></a>}</div><div className="flex flex-wrap items-start gap-2">{appointment.canManage && <><Button size="sm" variant="outline" disabled={busy || !canWrite || !connected} onClick={() => setEditor(appointment)}>Reschedule</Button><Button size="sm" variant="ghost" disabled={busy || !canWrite || !connected} onClick={() => act('propose', { kind: 'cancel', appointmentId: appointment.id })}>Cancel appointment</Button></>}{!appointment.canManage && <p className="text-xs text-muted-foreground">Managed by another Google connection</p>}</div></div></article>)}</div></section>
      {data.actions.some((action) => action.status === 'executed') && <section className="mt-8" aria-label="Completed calendar actions"><h2 className="font-heading text-xl font-semibold">Confirmed actions</h2><ul className="mt-4 divide-y rounded-[22px] border bg-card px-5">{data.actions.filter((action) => action.status === 'executed').slice(0, 10).map((action) => <li key={action.id} className="flex flex-wrap items-center gap-3 py-4 text-sm"><CheckCircle2 className="size-4 text-primary" /><span>{action.payload.title} · {action.kind === 'cancel' ? 'Cancelled' : action.kind === 'reschedule' ? 'Rescheduled' : 'Scheduled'}</span>{calendarLink(action.htmlLink) && <a className="text-primary underline" href={calendarLink(action.htmlLink)!} target="_blank" rel="noreferrer">View event</a>}</li>)}</ul></section>}
    </>}
    <AppointmentEditor key={editor === 'new' ? 'new' : editor?.id || 'closed'} open={editor !== null} appointment={editor === 'new' ? null : editor} state={state} busy={busy} error={error} onClose={() => setEditor(null)} onSubmit={async (payload) => { if (await act('propose', payload)) setEditor(null); }} />
    <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}><DialogContent><DialogHeader><DialogTitle>Disconnect Google Calendar?</DialogTitle><DialogDescription>This removes your saved Google credentials and calendar selections for all care recipients. Existing Google events remain. You can also revoke Carestead access in your Google account settings.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDisconnectOpen(false)}>Keep connected</Button><Button disabled={busy} onClick={async () => { if (await act('disconnect')) setDisconnectOpen(false); }}>Disconnect account</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

function AppointmentPreview({ action, recipientName }: { action: CalendarAction; recipientName: string }) {
  const p = action.payload;
  return <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">{[['Care recipient', recipientName], ['Title shared with guests', p.title], ['Organizer / calendar', `${p.organizer} · ${p.calendarName}`], ['Time zone', p.timeZone], ['Starts', formatWhen(p.start, p.timeZone)], ['Ends', formatWhen(p.end, p.timeZone)], ['Guests receiving updates', p.attendees.join(', ') || 'No guests — only your calendar'], ['Location', p.location || 'No location'], ...(action.kind === 'create' ? [['Your reminder', p.reminderMinutes ? `${p.reminderMinutes} minutes before` : 'None']] : [])].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>;
}

function AppointmentEditor({ open, appointment, state, busy, error, onClose, onSubmit }: { open: boolean; appointment: CalendarAppointment | null; state: DashboardState; busy: boolean; error: string; onClose: () => void; onSubmit: (payload: Record<string, unknown>) => Promise<void> }) {
  const [timeZone, setTimeZone] = useState(appointment?.timezone || state.selectedRecipient.timezone);
  const [title, setTitle] = useState(appointment?.title || 'Care appointment');
  const [start, setStart] = useState(appointment ? localInput(appointment.start_at, appointment.timezone) : '');
  const [end, setEnd] = useState(appointment ? localInput(appointment.end_at, appointment.timezone) : '');
  const [formError, setFormError] = useState('');
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{appointment ? 'Reschedule appointment' : 'Schedule appointment'}</DialogTitle><DialogDescription>{appointment ? 'Choose the new time. Current Google event details and guests will appear in the approval preview.' : 'Prepare an invitation for caregiver review. Nothing is sent until you approve.'}</DialogDescription></DialogHeader><form onSubmit={async (event) => { event.preventDefault(); setFormError(''); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await onSubmit({ ...values, kind: appointment ? 'reschedule' : 'create', appointmentId: appointment?.id, reminderMinutes: Number(values.reminderMinutes || 0) }); } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not prepare appointment.'); } }} className="space-y-4">
    {!appointment && <><label className="block text-sm font-medium">Link a responsibility<select name="taskId" className={`${selectClass} mt-2`} onChange={(event) => { const task = state.tasks.find((item) => item.id === event.target.value); if (task) { setTitle(task.title); setStart(localInput(task.due_at, timeZone)); setEnd(localInput(new Date(Date.parse(task.due_at) + 3600000).toISOString(), timeZone)); } }}><option value="">Create a new appointment responsibility</option>{state.tasks.filter((task) => !['complete', 'archived'].includes(task.status)).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><label htmlFor="calendar-title" className="block text-sm font-medium">Event title<Input id="calendar-title" name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} className="mt-2" /></label><p className="text-xs text-muted-foreground">Guests can see this title. Include only the care details you want to share.</p></>}
    <label htmlFor="calendar-timeZone" className="block text-sm font-medium">Time zone<Input id="calendar-timeZone" name="timeZone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} required maxLength={80} placeholder="America/Toronto" className="mt-2" /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label htmlFor="calendar-startLocal" className="block text-sm font-medium">Starts<Input id="calendar-startLocal" name="startLocal" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} required className="mt-2" /></label><label htmlFor="calendar-endLocal" className="block text-sm font-medium">Ends<Input id="calendar-endLocal" name="endLocal" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} required className="mt-2" /></label></div>
    {!appointment && <><label htmlFor="calendar-attendees" className="block text-sm font-medium">Guest email addresses<Input id="calendar-attendees" name="attendees" placeholder="maya@example.com, caregiver@example.com" maxLength={3000} className="mt-2" /></label><label htmlFor="calendar-location" className="block text-sm font-medium">Location<Input id="calendar-location" name="location" maxLength={500} className="mt-2" /></label><label className="block text-sm font-medium">Your calendar reminder<select name="reminderMinutes" className={`${selectClass} mt-2`} defaultValue="30"><option value="0">None</option><option value="10">10 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></label><p className="text-xs text-muted-foreground">Guests control their own reminders. No clinical notes are added automatically.</p></>}
    {(formError || error) && <p role="alert" className="text-sm text-destructive">{formError || error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}Review invitation</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}
