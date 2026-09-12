'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { NotificationOutcome } from './notification-outcome';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import type { CareCircleMember, ChatActionRequest, ChatState } from '@/lib/types';
import { notificationChannels, type NotificationChannel, type NotificationProvider } from '@/lib/notification-types';

const labels: Record<NotificationChannel, string> = { in_app: 'In-app', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', push: 'Push' };

const messageTemplates = [
  { id: 'review-plan', label: 'Review the care plan', title: 'Care plan review', detail: 'Please open Carestead and review the care plan when you have a moment.' },
  { id: 'check-in', label: 'Request a check-in', title: 'Care check-in', detail: 'Please check in and share an update with the care circle in Carestead.' },
  { id: 'availability', label: 'Confirm availability', title: 'Availability check', detail: 'Please confirm your availability to help with care and update your availability in Carestead.' },
  { id: 'responsibilities', label: 'Review responsibilities', title: 'Responsibility reminder', detail: 'Please review your assigned responsibilities in Carestead and update their status.' },
  { id: 'appointment', label: 'Review appointments', title: 'Appointment reminder', detail: 'Please check the care calendar for upcoming appointments and confirm whether you can help.' },
  { id: 'handover', label: 'Review the handover', title: 'Care handover', detail: 'Please review the handover in Carestead before taking over care, and add any questions or updates.' },
];

export function NotificationComposer({ careRecipientId, members, canWrite, onCompleted }: { careRecipientId: string; members: CareCircleMember[]; canWrite: boolean; onCompleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [providerChannels, setProviderChannels] = useState<Record<NotificationProvider, string[]>>({ legacy: [], onesignal: [] });
  const [provider, setProvider] = useState<NotificationProvider>('legacy');
  const channels = providerChannels[provider];
  const [memberId, setMemberId] = useState('');
  const [channel, setChannel] = useState<NotificationChannel>('in_app');
  const [title, setTitle] = useState('Caregiver update');
  const [detail, setDetail] = useState('');
  const [templateId, setTemplateId] = useState('custom');
  const customDraft = useRef({ title: 'Caregiver update', detail: '' });

  function chooseTemplate(id: string) {
    if (templateId === 'custom') customDraft.current = { title, detail };
    const template = messageTemplates.find((item) => item.id === id);
    const draft = template || customDraft.current;
    setTemplateId(id);
    setTitle(draft.title);
    setDetail(draft.detail);
  }
  const [proposal, setProposal] = useState<ChatActionRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/notifications?careRecipientId=${encodeURIComponent(careRecipientId)}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { channels: string[]; providerChannels?: Record<NotificationProvider, string[]>; error?: string };
        if (!response.ok) throw new Error(result.error || 'Could not load delivery channels.');
        if (!controller.signal.aborted) { setProviderChannels(result.providerChannels || { legacy: result.channels, onesignal: [] }); }
      }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [open, careRecipientId]);

  async function request(action: 'propose_notification' | 'approve_action' | 'reject_action') {
    if (busy || (action !== 'reject_action' && !canWrite)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId: careRecipientId, action, ...(action === 'propose_notification' ? { notification: { memberId, channel, title, detail, provider } } : { actionId: proposal?.id }) }) });
      const result = await response.json() as ChatState & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not complete the notification request.');
      if (!mounted.current) return;
      if (action === 'propose_notification') {
        const next = result.messages.at(-1)?.action;
        if (!next || next.action_type !== 'send_notification') throw new Error('Could not prepare a notification for review.');
        setProposal(next);
      } else {
        setProposal(null);
        if (action === 'reject_action') setNotice('Notification cancelled. Nothing was sent.');
        else {
          setNotice(result.messages.at(-1)?.content || 'Request processed. Check Recent delivery attempts for the result.');
          setDetail('');
          setTitle('Caregiver update');
          setTemplateId('custom');
          customDraft.current = { title: 'Caregiver update', detail: '' };
          onCompleted();
        }
      }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Could not complete the notification request.');
    } finally { if (mounted.current) setBusy(false); }
  }

  return <section className="mt-6 rounded-[22px] border bg-card p-5" aria-label="Send notification">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-heading text-lg font-semibold">Send a care update</h2><p className="mt-1 text-sm text-muted-foreground">Choose a ready-to-send message or write your own, then review before sending.</p></div>
      {!open && <Button disabled={!canWrite} onClick={() => setOpen(true)}><Send />Send notification</Button>}
    </div>
    {!canWrite && <p className="mt-3 text-sm text-muted-foreground">Sending requires an owner or caregiver account and active care-recipient consent.</p>}
    {open && !proposal && <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void request('propose_notification'); }}>
      <fieldset disabled={busy || !canWrite} className="space-y-4">
        <label className="grid gap-2 text-sm font-medium">Delivery provider<select value={provider} onChange={event => { const next = event.target.value as NotificationProvider; setProvider(next); setChannel(next === 'onesignal' ? 'email' : 'in_app'); }} className="h-10 rounded-lg border bg-background px-3"><option value="legacy">Existing providers</option><option value="onesignal" disabled={!providerChannels.onesignal.length}>OneSignal{!providerChannels.onesignal.length ? ' — enable in Integrations' : ''}</option></select></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor="compose-caregiver" className="grid gap-2 text-sm font-medium">Caregiver<select id="compose-caregiver" required value={memberId} onChange={(event) => setMemberId(event.target.value)} className="h-10 min-w-0 rounded-lg border bg-background px-3 focus-visible:outline-2 focus-visible:outline-ring"><option value="">Choose a caregiver</option>{members.filter((member) => member.status === 'active').map((member) => <option key={member.id} value={member.id}>{member.display_name} ({member.email})</option>)}</select></label>
          <label htmlFor="compose-channel" className="grid gap-2 text-sm font-medium">Channel<select id="compose-channel" value={channel} onChange={(event) => setChannel(event.target.value as NotificationChannel)} className="h-10 min-w-0 rounded-lg border bg-background px-3 focus-visible:outline-2 focus-visible:outline-ring">{notificationChannels.map((value) => <option key={value} value={value} disabled={!channels.includes(value)}>{labels[value]}{!channels.includes(value) ? ' — unavailable' : ''}</option>)}</select></label>
        </div>
        <p className="text-xs text-muted-foreground">Enable unavailable channels in Integrations. The receiving caregiver must save their own delivery preferences below for SMS, email, or push.</p>
        <div className="space-y-2 rounded-xl border bg-secondary/30 p-4">
          <label htmlFor="compose-template" className="block text-sm font-medium">Message template</label>
          <select id="compose-template" value={templateId} onChange={(event) => chooseTemplate(event.target.value)} aria-describedby="compose-template-help" className="h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring">
            <option value="custom">Custom — write your own</option>
            {messageTemplates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
          </select>
          <p id="compose-template-help" className="text-xs text-muted-foreground">{templateId === 'custom' ? 'Write your own title and message below. Your custom draft is kept while you explore templates.' : 'The title and message are filled in below. Edit them if needed. Choosing another template replaces this text.'}</p>
        </div>
        {channel === 'whatsapp' && <p className="rounded-xl border bg-secondary/30 p-3 text-sm">The caregiver must have messaged your Twilio WhatsApp sender within the last 24 hours. In the sandbox, they must join it first. These editable messages are not WhatsApp-approved business templates.</p>}
        <label htmlFor="compose-title" className="grid gap-2 text-sm font-medium">Title<Input id="compose-title" required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label htmlFor="compose-message" className="grid gap-2 text-sm font-medium">Message<Textarea id="compose-message" required maxLength={900} value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Please review the care plan before tomorrow." className="min-h-28" /></label>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{detail.length}/900 characters</p><Button type="submit" disabled={!memberId || !title.trim() || !detail.trim() || !channels.includes(channel)}>{busy ? 'Preparing…' : 'Review notification'}</Button></div>
      </fieldset>
    </form>}
    {proposal && <div className="mt-5 rounded-2xl border border-[#b9d5c3] bg-[#d8e9dc] p-4" aria-label="Review notification">
      <h3 className="font-heading font-semibold">Review before sending</h3>
      <p className="mt-2 text-sm">Provider: {proposal.payload.provider === 'onesignal' ? 'OneSignal' : 'Existing provider'}</p>
      <dl className="mt-3 grid gap-2 text-sm"><div><dt className="inline font-medium">To: </dt><dd className="inline break-words">{proposal.payload.targetName} · {proposal.payload.destinationLabel}</dd></div><div><dt className="inline font-medium">Channel: </dt><dd className="inline">{labels[proposal.payload.channel as NotificationChannel]}</dd></div></dl>
      <p className="mt-4 break-words font-medium">{proposal.payload.title}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{proposal.payload.detail}</p>
      {proposal.payload.channel !== 'in_app' && <p className="mt-3 text-xs text-muted-foreground">This content leaves Carestead and may appear on a lock screen.</p>}
      <div className="mt-4 flex gap-2"><Button disabled={busy || !canWrite} onClick={() => void request('approve_action')}>{busy ? 'Processing…' : 'Approve and send'}</Button><Button variant="outline" disabled={busy} onClick={() => void request('reject_action')}>Cancel</Button></div>
    </div>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}{error.includes('enable SMS') && ' Open Notifications → Your delivery preferences in the receiving caregiver’s account, enter a number such as +14165550123, check SMS consent, and save for this care recipient.'}</p>}
    {notice && <div className="mt-4"><NotificationOutcome content={notice} /></div>}
  </section>;
}
