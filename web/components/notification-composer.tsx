'use client';

import { useEffect, useState } from 'react';
import { Bell, ChevronDown, Send } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
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
  ntfy: 'Mobile push',
};
const selectClass =
  'h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-sm';

export function NotificationComposer({
  state,
  onChanged,
  initialDraft,
}: {
  state: DashboardState;
  onChanged: () => void;
  initialDraft?: { title: string; detail: string };
}) {
  const recipientId = state.selectedRecipient.id;
  const [template, setTemplate] = useState('custom');
  const [composing, setComposing] = useState(Boolean(initialDraft));
  const [memberId, setMemberId] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>([
    'in_app',
  ]);
  const [channels, setChannels] = useState<string[]>(['in_app']);
  const [title, setTitle] = useState(initialDraft?.title || '');
  const [detail, setDetail] = useState(initialDraft?.detail || '');
  const [pending, setPending] = useState<ChatActionRequest[]>([]);
  const [reviewChannel, setReviewChannel] = useState('in_app');
  const [edits, setEdits] = useState<
    Record<string, { title: string; detail: string }>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const writable =
    state.currentUser.role !== 'viewer' &&
    state.consent.status === 'active' &&
    !state.currentUser.isGuest;
  const apply = (chat: ChatState) => {
    const available = chat.notificationChannels || ['in_app'];
    setChannels(available);
    setSelectedChannels((selected) =>
      selected.filter((channel) => available.includes(channel)),
    );
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
  async function requestAction(payload: Record<string, unknown>) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId, ...payload }),
    });
    const result = (await response.json()) as ChatState & { error?: string };
    if (!response.ok)
      throw new Error(result.error || 'Unable to update this notification.');
    apply(result);
  }

  async function approveAll() {
    if (busy || !writable || pending.some((action) => edits[action.id])) return;
    const drafts = [...pending];
    setBusy(true);
    setError('');
    setNotice('');
    let approved = 0;
    try {
      for (const draft of drafts) {
        await requestAction({ action: 'approve_action', actionId: draft.id });
        approved++;
      }
      setNotice(
        `${approved} notification draft${approved === 1 ? '' : 's'} approved. Check delivery history for each channel’s result.`,
      );
    } catch (error) {
      setError(
        `${approved} of ${drafts.length} drafts approved before sending stopped. ${error instanceof Error ? error.message : 'Unable to approve the next draft.'} Check delivery history before trying again.`,
      );
    } finally {
      setBusy(false);
      onChanged();
    }
  }

  async function submit(payload: Record<string, unknown>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await requestAction(payload);
      setNotice(
        payload.action === 'propose_notification'
          ? 'Drafts ready below. Review each channel, then approve individually or send all remaining drafts.'
          : payload.action === 'edit_notification'
            ? 'Draft updated. Review the changes before approving this channel.'
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
      <h2 className="font-heading text-xl font-semibold">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl border border-primary bg-primary px-4 py-4 text-left text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:px-5"
          aria-expanded={composing}
          aria-controls="notification-compose-form"
          onClick={() => setComposing((open) => !open)}
        >
          <Bell className="size-5 shrink-0" />
          Send a notification
          <span aria-hidden="true" className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden text-sm font-medium sm:inline">{composing ? 'Collapse' : 'Expand'}</span>
            <span className="grid size-8 place-items-center rounded-full bg-primary-foreground/15">
              <ChevronDown className={`size-5 transition-transform ${composing ? 'rotate-180' : ''}`} />
            </span>
          </span>
        </button>
      </h2>
      {composing && (
        <p className="mt-2 text-sm text-muted-foreground">
          Start with a template or write a custom message. Review and approve
          before delivery.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <output className="mt-3 block text-sm">{notice}</output>}
      <form
        id="notification-compose-form"
        hidden={!composing}
        className={`${composing ? 'grid' : 'hidden'} mt-5 min-w-0 gap-4 sm:grid-cols-2`}
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            await submit({
              action: 'propose_notification',
              notification: {
                memberId,
                channels: selectedChannels,
                title: title.trim(),
                detail: detail.trim(),
              },
            })
          ) {
            setTitle('');
            setDetail('');
            setTemplate('custom');
            setComposing(false);
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
        <fieldset className="grid gap-2 text-sm" disabled={busy || !writable}>
          <legend className="mb-2">Delivery channels</legend>
          <p className="text-xs text-muted-foreground">
            Choose one or more. Each channel gets its own approval draft.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-3">
            {channels.map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(value)}
                  onChange={(event) =>
                    setSelectedChannels((selected) =>
                      event.target.checked
                        ? [...selected, value]
                        : selected.filter((channel) => channel !== value),
                    )
                  }
                />
                {channelNames[value] || value}
              </label>
            ))}
          </div>
          {!selectedChannels.length && (
            <p className="text-xs text-muted-foreground">
              Select at least one delivery channel.
            </p>
          )}
        </fieldset>
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
              busy ||
              !writable ||
              !title.trim() ||
              !detail.trim() ||
              !memberId ||
              !selectedChannels.length
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
            <p className="mt-2 text-sm text-muted-foreground">
              Send all approves every remaining draft across these tabs.
              Discarded drafts are excluded.
            </p>
            <Button
              className="mt-3"
              disabled={
                busy ||
                !writable ||
                pending.some((action) => Boolean(edits[action.id]))
              }
              onClick={approveAll}
            >
              <Send />
              Approve and send all ({pending.length})
            </Button>
            {pending.some((action) => Boolean(edits[action.id])) && (
              <p className="mt-2 text-sm text-muted-foreground">
                Save or cancel your edits before sending all drafts.
              </p>
            )}
          </div>
          <Tabs
            value={
              pending.some((action) => action.payload.channel === reviewChannel)
                ? reviewChannel
                : pending[0].payload.channel
            }
            onValueChange={(value) => setReviewChannel(String(value))}
          >
            <TabsList
              aria-label="Review notification channels"
              className="h-auto w-full flex-wrap justify-start gap-1"
            >
              {[
                ...new Set(pending.map((action) => action.payload.channel)),
              ].map((channel) => (
                <TabsTrigger key={channel} value={channel}>
                  {channelNames[channel] || channel} (
                  {
                    pending.filter(
                      (action) => action.payload.channel === channel,
                    ).length
                  }
                  )
                </TabsTrigger>
              ))}
            </TabsList>
            {[...new Set(pending.map((action) => action.payload.channel))].map(
              (channel) => (
                <TabsContent key={channel} value={channel} keepMounted>
                  <PaginatedList
                    label={`${channelNames[channel] || channel} drafts`}
                    controlsPosition="after"
                    records={pending.filter(
                      (action) => action.payload.channel === channel,
                    )}
                    resetKey={recipientId}
                    removal={{
                      disabled: busy || !writable,
                      individual: false,
                      description:
                        'Discard the selected drafts in this channel. Other channels stay unchanged.',
                      remove: async (ids) => {
                        for (const id of ids)
                          if (
                            !(await submit({
                              action: 'reject_action',
                              actionId: id,
                            }))
                          )
                            return false;
                        return true;
                      },
                    }}
                  >
                    {pending
                      .filter((action) => action.payload.channel === channel)
                      .map((action) => (
                        <article
                          key={action.id}
                          className="bg-[var(--care-inset)] rounded-xl border p-4"
                        >
                          <h3 className="font-semibold">
                            {action.payload.title}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {action.payload.targetName} ·{' '}
                            {channelNames[action.payload.channel] ||
                              action.payload.channel}
                          </p>
                          {edits[action.id] ? (
                            <form
                              className="mt-3 grid gap-3"
                              onSubmit={async (event) => {
                                event.preventDefault();
                                if (
                                  await submit({
                                    action: 'edit_notification',
                                    actionId: action.id,
                                    notification: edits[action.id],
                                  })
                                ) {
                                  setEdits((current) => {
                                    const next = { ...current };
                                    delete next[action.id];
                                    return next;
                                  });
                                }
                              }}
                            >
                              <label
                                htmlFor={`draft-title-${action.id}`}
                                className="grid gap-1 text-sm"
                              >
                                Draft title
                                <Input
                                  id={`draft-title-${action.id}`}
                                  value={edits[action.id].title}
                                  maxLength={180}
                                  required
                                  disabled={busy}
                                  onChange={(event) => {
                                    const title = event.target.value;
                                    setEdits((current) => ({
                                      ...current,
                                      [action.id]: {
                                        ...current[action.id],
                                        title,
                                      },
                                    }));
                                  }}
                                />
                              </label>
                              <label
                                htmlFor={`draft-message-${action.id}`}
                                className="grid gap-1 text-sm"
                              >
                                Draft message
                                <Textarea
                                  id={`draft-message-${action.id}`}
                                  value={edits[action.id].detail}
                                  maxLength={900}
                                  required
                                  disabled={busy}
                                  onChange={(event) => {
                                    const detail = event.target.value;
                                    setEdits((current) => ({
                                      ...current,
                                      [action.id]: {
                                        ...current[action.id],
                                        detail,
                                      },
                                    }));
                                  }}
                                />
                              </label>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="submit"
                                  disabled={
                                    busy ||
                                    !writable ||
                                    !edits[action.id].title.trim() ||
                                    !edits[action.id].detail.trim()
                                  }
                                >
                                  Save draft
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    setEdits((current) => {
                                      const next = { ...current };
                                      delete next[action.id];
                                      return next;
                                    })
                                  }
                                >
                                  Cancel edit
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <p className="mt-3 whitespace-pre-wrap text-sm">
                              {action.payload.detail}
                            </p>
                          )}
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              disabled={
                                busy || !writable || Boolean(edits[action.id])
                              }
                              onClick={() =>
                                submit({
                                  action: 'approve_action',
                                  actionId: action.id,
                                })
                              }
                            >
                              Approve and send
                            </Button>
                            <Button
                              variant="outline"
                              disabled={
                                busy || !writable || Boolean(edits[action.id])
                              }
                              onClick={() =>
                                setEdits((current) => ({
                                  ...current,
                                  [action.id]: {
                                    title: action.payload.title,
                                    detail: action.payload.detail,
                                  },
                                }))
                              }
                            >
                              Edit draft
                            </Button>
                            <Button
                              variant="outline"
                              disabled={busy || !writable}
                              onClick={() =>
                                submit({
                                  action: 'reject_action',
                                  actionId: action.id,
                                })
                              }
                            >
                              Discard draft
                            </Button>
                          </div>
                        </article>
                      ))}
                  </PaginatedList>
                </TabsContent>
              ),
            )}
          </Tabs>
        </div>
      )}
    </section>
  );
}
