'use client';

import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';

type Settings = {
  pushoverEnabled: boolean;
  email: string; emailEnabled: boolean; smsEnabled: boolean; phone: string; pushEnabled: boolean;
  vapidPublicKey: string | null; channels: string[];
  deliveries: { action_id: string; channel: string; status: string; error_code: string | null; created_at: string; target_name: string; title: string | null }[];
};

export function NotificationSettings({ recipientId }: { recipientId: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pushoverKey, setPushoverKey] = useState('');
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
  }, [recipientId]);

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

  return <section className="mt-6 rounded-[22px] border bg-card p-5" aria-label="Notification preferences">
    <h2 className="font-heading text-lg font-semibold">Your delivery preferences</h2>
    <p className="mt-2 text-sm text-muted-foreground">Choose how this care circle can contact you. Messages are sent only after a caregiver reviews and approves them.</p>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {notice && <output className="mt-3 block text-sm">{notice}</output>}
    {settings && <>
      <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void act(() => save({ action: 'save_preferences', emailEnabled: settings.emailEnabled, smsEnabled: settings.smsEnabled, phone: settings.phone })); }}>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.emailEnabled} onChange={(event) => setSettings({ ...settings, emailEnabled: event.target.checked })} disabled={busy || (!settings.channels.includes('email') && !settings.emailEnabled)} />Email me at {settings.email}{!settings.channels.includes('email') && ' (off or missing credentials — see Integrations)'}</label>
        <label htmlFor="notification-phone" className="grid max-w-sm gap-2 text-sm">Your SMS number<Input id="notification-phone" value={settings.phone} onChange={(event) => setSettings({ ...settings, phone: event.target.value })} type="tel" placeholder="+14165550123" maxLength={16} disabled={busy} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.smsEnabled} onChange={(event) => setSettings({ ...settings, smsEnabled: event.target.checked })} disabled={busy || (!settings.channels.includes('sms') && !settings.smsEnabled)} />I own this number and agree to receive care updates by SMS.{!settings.channels.includes('sms') && ' (off or missing credentials — see Integrations)'}</label>
        <p className="text-xs text-muted-foreground">Messages may contain the approved care details. Disable a channel here to stop future sends. SMS carrier charges may apply.</p>
        <Button variant="outline" disabled={busy} type="submit">Save delivery preferences</Button>
      </form>
      <div className="mt-5 border-t pt-4">
        <h3 className="font-medium">Pushover mobile notifications</h3>
        <p className="mt-1 text-sm">{settings.pushoverEnabled ? 'Enabled for your Pushover account.' : 'Install Pushover on your phone and enter your personal user key from its dashboard.'}</p>
        <p className="mt-1 text-xs text-muted-foreground">Use your own user key, not a group key: group keys send to everyone in that group. Approved messages go to all active devices on the saved account. Saving a key enables this channel for this care recipient.</p>
        <label htmlFor="pushover-user-key" className="mt-3 grid max-w-sm gap-2 text-sm">Your Pushover user key<Input id="pushover-user-key" type="password" autoComplete="off" value={pushoverKey} maxLength={30} onChange={(event) => setPushoverKey(event.target.value)} disabled={busy || !settings.channels.includes('pushover')} placeholder={settings.pushoverEnabled ? 'Enter a new key to replace it' : '30-character user key'} /></label>
        <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !settings.channels.includes('pushover') || !/^[A-Za-z0-9]{30}$/.test(pushoverKey)} onClick={() => act(async () => { await save({ action: 'enable_pushover', userKey: pushoverKey }); setPushoverKey(''); })}>{settings.pushoverEnabled ? 'Replace Pushover key' : 'Enable Pushover for me'}</Button>{settings.pushoverEnabled && <Button variant="outline" disabled={busy} onClick={() => act(() => save({ action: 'disable_pushover' }))}>Disable and remove Pushover key</Button>}</div>
        {!settings.channels.includes('pushover') && <p className="mt-2 text-xs text-muted-foreground">Pushover is off or needs its application token. An owner can enable it in Integrations.</p>}
      </div>
      <div className="mt-5 border-t pt-4"><p className="text-sm">Browser push: {settings.pushEnabled ? 'enabled for this profile' : 'disabled'}</p><p className="mt-1 text-xs text-muted-foreground">Messages may appear on your lock screen. On iPhone or iPad, open Carestead from your Home Screen. Enabling another browser replaces the previous registration for this profile.</p><div className="mt-3 flex gap-2"><Button variant="outline" disabled={busy || !settings.channels.includes('push')} onClick={() => act(enablePush)}>Enable on this browser</Button>{settings.pushEnabled && <Button variant="outline" disabled={busy} onClick={() => act(() => save({ action: 'disable_push' }))}>Disable push</Button>}</div>{!settings.channels.includes('push') && <p className="mt-2 text-xs text-muted-foreground">Push keys are not configured.</p>}</div>
      <p className="mt-5 text-sm">In Ask Carestead, try <strong>“Email me: Please review the care plan.”</strong> You can also use Pushover, SMS, Push, or In-app followed by an exact caregiver name and a colon.</p>
      <h3 className="mt-5 font-medium">Recent delivery attempts</h3>
      <p className="mt-1 text-xs text-muted-foreground">Accepted means the provider accepted the request, not that someone received or read it. If an attempt stays “sending” or says “unknown”, check the provider before sending again.</p>
      <ul className="mt-3 space-y-3">{settings.deliveries.map((item) => <li className="rounded-xl border p-3 text-sm" key={item.action_id}><p>{item.title || 'Caregiver update'} → {item.target_name}</p><p className="mt-1 text-xs text-muted-foreground">{item.channel} · {item.status} · {new Date(item.created_at).toLocaleString()}{item.error_code && ` · ${item.error_code}`}</p></li>)}</ul>
      {!settings.deliveries.length && <p className="mt-2 text-sm text-muted-foreground">No delivery attempts yet.</p>}
    </>}
  </section>;
}
