'use client';
import { PaginatedList } from './paginated-list';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { notificationDeliveryHint, validNtfyTopic } from '@/lib/notification-types';
import { Button } from './ui/button';
import { PrivateInput, PrivateValue } from './private-value';

type Settings = {
  ntfyEnabled: boolean; ntfyTopic: string | null; ntfyServerUrl: string | null;
  email: string; emailEnabled: boolean; smsEnabled: boolean; phone: string; pushEnabled: boolean;
  vapidPublicKey: string | null; channels: string[];
  deliveries: { action_id: string; channel: string; status: string; error_code: string | null; created_at: string; target_name: string; title: string | null }[];
};

function useNotificationPreferences(recipientId: string, revision: number) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [ntfyTopic, setNtfyTopic] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/notifications?recipientId=${encodeURIComponent(recipientId)}`, { signal: controller.signal }).then(async (response) => {
      const result = await response.json() as Settings & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not load notification settings.');
      setSettings(result);
    }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [recipientId, revision]);

  async function save(body: Record<string, unknown>) {
    const response = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId, ...body }) });
    const result = await response.json() as Settings & { error?: string };
    if (!response.ok) throw new Error(result.error || 'Could not save notification settings.');
    setSettings(result);
    setNotice('Notification preferences saved.');
  }

  async function act(run: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await run(); } catch (error) { setError(error instanceof Error ? error.message : 'Could not update notifications.'); } finally { setBusy(false); }
  }

  async function enablePush() {
    if (!settings?.vapidPublicKey || !('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push is unavailable in this browser. On iPhone or iPad, add Carestead to the Home Screen and open it there.');
    if (await Notification.requestPermission() !== 'granted') throw new Error('Allow notifications in your browser settings to enable push.');
    const registration = await navigator.serviceWorker.register('/carestead-sw.js');
    await navigator.serviceWorker.ready;
    const encoded = settings.vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/');
    const key = Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await save({ action: 'subscribe_push', subscription: subscription.toJSON() });
  }

  return { settings, setSettings, ntfyTopic, setNtfyTopic, error, notice, busy, save, act, enablePush };
}

const PreferencesContext = createContext<ReturnType<typeof useNotificationPreferences> | null>(null);

export function NotificationPreferencesProvider({ recipientId, revision, children }: { recipientId: string; revision: number; children: ReactNode }) {
  const preferences = useNotificationPreferences(recipientId, revision);
  return <PreferencesContext.Provider value={preferences}>{children}</PreferencesContext.Provider>;
}

export function NotificationPreferences({ channel }: { channel: "email" | "sms" | "ntfy" | "push" }) {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error("Notification preferences require a provider.");
  const { settings: savedSettings, ntfyTopic, setNtfyTopic, error, notice, busy, save, act, enablePush } = preferences;
  const [draft, setDraft] = useState<{ source: Settings | null; value: Settings } | null>(null);
  const settings = draft && draft.source === savedSettings ? draft.value : savedSettings;
  function setSettings(value: Settings) { setDraft({ source: savedSettings, value }); }
  return <section className="mt-5 border-t pt-4" aria-label={`Your ${channel} delivery preferences`}>
    <h3 className="font-medium">Your delivery preferences</h3>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {notice && <output className="mt-3 block text-sm">{notice}</output>}
    {!settings && !error && <p className="mt-3 text-sm">Loading delivery preferences…</p>}
    {settings && <>
    {(channel === 'email' || channel === 'sms') && <>
      <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void act(() => save({ action: 'save_preferences', emailEnabled: channel === 'email' ? settings.emailEnabled : savedSettings!.emailEnabled, smsEnabled: channel === 'sms' ? settings.smsEnabled : savedSettings!.smsEnabled, phone: channel === 'sms' ? settings.phone : savedSettings!.phone })); }}>
        {channel === 'email' && <><div className="flex flex-wrap items-center gap-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={settings.emailEnabled} onChange={(event) => setSettings({ ...settings, emailEnabled: event.target.checked })} disabled={busy || (!settings.channels.includes('email') && !settings.emailEnabled)} />Email me at</label><PrivateValue value={settings.email} kind="email" label="email address" />{!settings.channels.includes('email') && ' (off or missing credentials — configure and enable this integration above)'}</div></>}
        {channel === 'sms' && <>
        <div className="grid max-w-sm gap-2 text-sm"><label htmlFor="notification-phone">Your SMS number</label><PrivateInput kind="phone" label="SMS number" id="notification-phone" value={settings.phone} onChange={(event) => setSettings({ ...settings, phone: event.target.value })} type="tel" placeholder="+14165550123" maxLength={16} disabled={busy} /><p className="text-xs text-muted-foreground">Use the eye button to view or edit your saved number.</p></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.smsEnabled} onChange={(event) => setSettings({ ...settings, smsEnabled: event.target.checked })} disabled={busy || (!settings.channels.includes('sms') && !settings.smsEnabled)} />I own this number and agree to receive care updates by SMS.{!settings.channels.includes('sms') && ' (off or missing credentials — configure and enable this integration above)'}</label>
        </>}
        <p className="text-xs text-muted-foreground">Messages may contain the approved care details. Disable a channel here to stop future sends. {channel === 'sms' && 'SMS carrier charges may apply.'}</p>
        <Button variant="outline" disabled={busy} type="submit">Save {channel === 'email' ? 'email' : 'SMS'} preferences</Button>
      </form>
    </>}
    {channel === 'ntfy' && <>
      <div className="mt-4">
        <h3 className="font-medium">Mobile push</h3>
        <p className="mt-1 text-sm">{settings.ntfyEnabled ? 'A topic is saved for your mobile notifications.' : 'Open your mobile push app and subscribe to your own topic.'}</p>
        {settings.ntfyServerUrl && <p className="mt-1 flex flex-wrap items-center gap-1 text-sm">Mobile push server: <PrivateValue value={settings.ntfyServerUrl} label="mobile push server URL" /></p>}
        <p className="mt-1 text-xs text-muted-foreground">Use a private, access-controlled topic for care details. Anyone with access to the topic receives its messages; public topics can be read by anyone who knows their name. Notifications may appear on your lock screen.</p>
        {settings.ntfyTopic && <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1 text-sm"><span className="font-medium">Current mobile push topic:</span><PrivateValue key={settings.ntfyTopic} value={settings.ntfyTopic} label="current mobile push topic" /></div>}
        <div className="mt-3 grid max-w-sm gap-2 text-sm"><label htmlFor="ntfy-topic">{settings.ntfyEnabled ? 'New mobile push topic' : 'Your mobile push topic'}</label><PrivateInput label="mobile push topic" id="ntfy-topic" type="password" autoComplete="off" value={ntfyTopic} maxLength={64} onChange={(event) => setNtfyTopic(event.target.value)} disabled={busy || !settings.channels.includes('ntfy')} placeholder={settings.ntfyEnabled ? 'Enter a topic to replace it' : 'Topic subscribed to on your phone'} /></div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || !settings.channels.includes('ntfy') || !validNtfyTopic(ntfyTopic)} onClick={() => act(async () => { await save({ action: 'enable_ntfy', topic: ntfyTopic }); setNtfyTopic(''); })}>{settings.ntfyEnabled ? 'Replace mobile push topic' : 'Enable mobile push'}</Button>
          {settings.ntfyEnabled && <Button variant="outline" disabled={busy} onClick={() => act(() => save({ action: 'disable_ntfy' }))}>Disable mobile push</Button>}
        </div>
        {!settings.channels.includes('ntfy') && <p className="mt-2 text-xs text-muted-foreground">An owner must configure the mobile push server and enable it in Integrations first.</p>}
        <p className="mt-2 text-sm">After subscribing on your phone, ask “Mobile push me: There is a care update to review.” and approve the message.</p>
      </div>
    </>}
    {channel === 'push' && <>
      <div className="mt-4"><p className="text-sm">Browser push: {settings.pushEnabled ? 'enabled for this profile' : 'disabled'}</p><p className="mt-1 text-xs text-muted-foreground">Messages may appear on your lock screen. On iPhone or iPad, open Carestead from your Home Screen. Enabling another browser replaces the previous registration for this profile.</p><div className="mt-3 flex gap-2"><Button variant="outline" disabled={busy || !settings.channels.includes('push')} onClick={() => act(enablePush)}>Enable on this browser</Button>{settings.pushEnabled && <Button variant="outline" disabled={busy} onClick={() => act(() => save({ action: 'disable_push' }))}>Disable push</Button>}</div>{!settings.channels.includes('push') && <p className="mt-2 text-xs text-muted-foreground">Push keys are not configured.</p>}</div>    </>}
    </>}
  </section>;
}

export function NotificationSettings({ recipientId }: { recipientId: string }) {
  const { settings, error } = useNotificationPreferences(recipientId, 0);
  return <section className="mt-6 min-w-0" aria-label="Recent delivery attempts">
    <h2 className="font-heading text-lg font-semibold">Recent delivery attempts</h2>
    <p className="mt-2 text-sm text-muted-foreground">Update your delivery preferences for each channel in <a href={`/?view=Integrations&recipientId=${encodeURIComponent(recipientId)}`} className="font-medium text-primary underline underline-offset-4">Account settings → Integrations</a>.</p>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {!settings && !error && <p className="mt-3 text-sm">Loading delivery attempts…</p>}
    {settings && <>
      <p className="mt-1 text-xs text-muted-foreground">Google Calendar invitations, changes, and cancellations appear here after Google confirms an update with guests. Accepted means the provider accepted the request, not that someone received or read it. If an attempt stays “sending” or says “unknown”, check the provider before sending again.</p>
      <ul className="mt-3 space-y-3"><PaginatedList label="Delivery history" layout="list" records={settings.deliveries.map(item => ({ ...item, id: item.action_id }))} resetKey={recipientId}>{settings.deliveries.map((item) => <li className="rounded-xl border border-l-4 border-primary/35 border-l-primary bg-[var(--care-inset)] p-3 text-sm shadow-sm shadow-primary/10 dark:bg-card" key={item.action_id}><p>{item.title || 'Caregiver update'} → {item.target_name}</p><p className="mt-1 text-xs text-muted-foreground">{item.channel === 'google_calendar' ? 'Google Calendar' : item.channel === 'ntfy' ? 'Mobile push' : item.channel} · {item.status} · {new Date(item.created_at).toLocaleString()}{item.error_code && ` · ${item.error_code}`}</p>{notificationDeliveryHint(item.channel, item.error_code) && <p className="mt-2 text-xs text-muted-foreground">{notificationDeliveryHint(item.channel, item.error_code)}</p>}</li>)}</PaginatedList></ul>
      {!settings.deliveries.length && <p className="mt-2 text-sm text-muted-foreground">No delivery attempts yet.</p>}
    </>}
  </section>;
}
