'use client';

import { useEffect, useState } from 'react';
import { Bell, Send } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { PaginatedList } from './paginated-list';
import type { ChatActionRequest, ChatState, DashboardState } from '@/lib/types';

const templates = [
  { id: 'custom', name: 'Custom message', title: '', detail: '' },
  {
    id: 'check-in',
    name: 'Care check-in',
    title: 'Care check-in',
    detail: 'Please check in and share an update with the care circle.',
  },
  {
    id: 'appointment',
    name: 'Appointment reminder',
    title: 'Upcoming appointment',
    detail:
      'Please review the upcoming appointment in Calendar and confirm the arrangements.',
  },
  {
    id: 'coverage',
    name: 'Coverage request',
    title: 'Care coverage needed',
    detail:
      'Please review the open responsibilities and let us know when you can help.',
  },
  {
    id: 'handover',
    name: 'Handover ready',
    title: 'Handover ready for review',
    detail:
      'The care handover is ready. Please review the latest updates before your next visit.',
  },
];
const channelNames: Record<string, string> = {
  in_app: 'Carestead inbox',
  email: 'Email',
  sms: 'SMS',
  push: 'Browser push',
  ntfy: 'ntfy mobile push',
};
const selectClass =
  'h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-sm';

export function NotificationComposer({
  state,
  onChanged,
}: {
  state: DashboardState;
  onChanged: () => void;
}) {
  const recipientId = state.selectedRecipient.id;
  const [template, setTemplate] = useState('custom');
  const [memberId, setMemberId] = useState('');
  const [channel, setChannel] = useState('in_app');
  const [channels, setChannels] = useState<string[]>(['in_app']);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [pending, setPending] = useState<ChatActionRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const writable =
    state.currentUser.role !== 'viewer' &&
    state.consent.status === 'active' &&
    !state.currentUser.isGuest;
  const apply = (chat: ChatState) => {
    setChannels(chat.notificationChannels || ['in_app']);
    setPending(
      chat.messages.flatMap((message) =>
        message.action?.action_type === 'send_notification' &&
        message.action.status === 'pending'
          ? [message.action]
          : [],
      ),
    );
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/chat?recipientId=${encodeURIComponent(recipientId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as ChatState & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            result.error || 'Unable to load notification drafts.',
          );
        apply(result);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [recipientId, state.notifications]);
  async function submit(payload: Record<string, unknown>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId, ...payload }),
      });
      const result = (await response.json()) as ChatState & { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'Unable to update this notification.');
      apply(result);
      setNotice(
        payload.action === 'propose_notification'
          ? 'Draft ready below. Review the exact message before approving delivery.'
          : payload.action === 'reject_action'
            ? 'Draft discarded.'
            : 'Notification delivery approved. Check delivery history for its result.',
      );
      onChanged();
      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to update notification.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mt-6 min-w-0 rounded-2xl border bg-card p-5"
      aria-label="Compose notification"
    >
      <h2 className="flex items-center gap-2 font-heading text-xl font-semibold">
        <Bell className="size-5" />
        Send a notification
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Start with a template or write a custom message. Review and approve
        before delivery.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <output className="mt-3 block text-sm">{notice}</output>}
      <form
        className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            await submit({
              action: 'propose_notification',
              notification: {
                memberId,
                channel,
                title: title.trim(),
                detail: detail.trim(),
              },
            })
          ) {
            setTitle('');
            setDetail('');
            setTemplate('custom');
          }
        }}
      >
        <label className="grid gap-2 text-sm">
          Message template
          <select
            className={selectClass}
            value={template}
            disabled={busy || !writable}
            onChange={(event) => {
              const selected = templates.find(
                (item) => item.id === event.target.value,
              )!;
              setTemplate(selected.id);
              setTitle(selected.title);
              setDetail(selected.detail);
            }}
          >
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm">
          Receiving caregiver
          <select
            className={selectClass}
            value={memberId}
            onChange={(event) => setMemberId(event.target.value)}
            disabled={busy || !writable}
            required
          >
            <option value="">Choose a care-circle member</option>
            {state.careCircle
              .filter((member) => member.status === 'active')
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.display_name}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm">
          Delivery channel
          <select
            className={selectClass}
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            disabled={busy || !writable}
          >
            {channels.map((value) => (
              <option key={value} value={value}>
                {channelNames[value] || value}
              </option>
            ))}
          </select>
        </label>
        <label
          htmlFor="notification-composer-title"
          className="grid gap-2 text-sm"
        >
          Notification title
          <Input
            id="notification-composer-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={180}
            required
            disabled={busy || !writable}
          />
        </label>
        <label
          htmlFor="notification-composer-message"
          className="grid gap-2 text-sm sm:col-span-2"
        >
          Message
          <Textarea
            id="notification-composer-message"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            maxLength={900}
            required
            disabled={busy || !writable}
          />
        </label>
        <div className="sm:col-span-2">
          <Button
            type="submit"
            disabled={
              busy || !writable || !title.trim() || !detail.trim() || !memberId
            }
          >
            <Send />
            Prepare notification
          </Button>
        </div>
      </form>
      {pending.length > 0 && (
        <div className="mt-6 space-y-4 border-t pt-5">
          <div>
            <h3 className="font-heading text-lg font-semibold">
              Review and approve
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Check the recipient, channel, and message below before sending.
            </p>
          </div>
          <PaginatedList
            label="Notification drafts"
            controlsPosition="after"
            records={pending}
            resetKey={recipientId}
            removal={{
              disabled: busy || !writable,
              individual: false,
              description:
                'Discard these unsent drafts. No notification will be sent.',
              remove: async (ids) => {
                for (const id of ids)
                  if (
                    !(await submit({ action: 'reject_action', actionId: id }))
                  )
                    return false;
                return true;
              },
            }}
          >
            {pending.map((action) => (
              <article key={action.id} className="rounded-xl border p-4">
                <h3 className="font-semibold">{action.payload.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {action.payload.targetName} ·{' '}
                  {channelNames[action.payload.channel] ||
                    action.payload.channel}
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm">
                  {action.payload.detail}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    disabled={busy || !writable}
                    onClick={() =>
                      submit({ action: 'approve_action', actionId: action.id })
                    }
                  >
                    Approve and send
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || !writable}
                    onClick={() =>
                      submit({ action: 'reject_action', actionId: action.id })
                    }
                  >
                    Discard draft
                  </Button>
                </div>
              </article>
            ))}
          </PaginatedList>
        </div>
      )}
    </section>
  );
}
