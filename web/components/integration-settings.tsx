'use client';

import { useEffect, useState } from 'react';
import { integrationKeys, type IntegrationId, type IntegrationStatus } from '@/lib/integration-types';

const descriptions: Record<IntegrationId, { title: string; detail: string; next: string }> = {
  ntfy: { title: 'ntfy mobile notifications', detail: 'Send approved updates to the ntfy app on your phone.', next: 'Subscribe to your topic in ntfy, then save it in Notifications. Each message requires approval.' },
  calendar: { title: 'Google Calendar', detail: 'Create appointments in a connected Google calendar. Your local tasks and timeline always remain available.', next: 'Connect your Google account in Calendar, then approve each appointment.' },
  sms: { title: 'Twilio SMS', detail: 'Send approved messages to opted-in caregivers. In-app notifications always remain available.', next: 'Save your phone number and SMS preference in Notifications. Each message requires approval.' },
  email: { title: 'Email delivery', detail: 'Send approved care updates through Resend.', next: 'Enable your email preference in Notifications. Each message requires approval.' },
  push: { title: 'Browser push', detail: 'Send approved updates to subscribed browsers.', next: 'Allow browser notifications in Notifications. Each message requires approval.' },
};
type Settings = { integrations: IntegrationStatus[]; canManage: boolean };

export function IntegrationSettings({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<Settings | null>(null);
  const [busy, setBusy] = useState<IntegrationId | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState<Partial<Record<IntegrationId, Record<string, string | null>>>>({});
  useEffect(() => {
    let active = true;
    void fetch('/api/integrations').then(async (response) => {
      if (!response.ok) throw new Error('Integration settings could not be loaded. Reopen this page to retry.');
      const result = await response.json() as Settings;
      if (active) setData(result);
    }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  async function save(item: IntegrationStatus, enabled: boolean, config?: Record<string, string | null>) {
    setBusy(item.id); setError(''); setNotice('');
    try {
      const response = await fetch('/api/integrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, enabled, ...(config ? { config } : {}) }) });
      const result = await response.json() as Settings & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Integration could not be updated.');
      setData(result); if (config) setDrafts(current => ({ ...current, [item.id]: {} })); setNotice('Integration settings saved.'); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Integration could not be updated.'); }
    finally { setBusy(null); }
  }
  function edit(id: IntegrationId, key: string, value: string | null) {
    setDrafts(current => ({ ...current, [id]: { ...current[id], [key]: value } }));
  }
  return <section aria-labelledby="integrations-title">
    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Optional connections</p>
    <h1 id="integrations-title" className="mt-2 font-heading text-3xl font-semibold">Integrations</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Carestead works without external services. Turn on only the connections your care circle needs. These switches apply to everyone in this care circle.</p>
    {notice && <output className="mt-4 block text-sm">{notice}</output>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {!data && !error && <output className="mt-6 block text-sm">Loading integrations…</output>}
    {data && <>
      {!data.canManage && <p className="mt-4 text-sm text-muted-foreground">A care-circle owner manages these switches.</p>}
      <div className="mt-7 divide-y overflow-hidden rounded-[22px] border bg-card">{data.integrations.map((item) => {
        const copy = descriptions[item.id];
        return <div key={item.id} className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4"><div><h2 className="font-heading text-lg font-semibold">{copy.title}</h2><p className="mt-1 text-xs text-muted-foreground">{!item.configured ? 'Credentials required' : item.enabled ? 'On · credentials configured' : 'Off · credentials configured'}</p></div>
            <button type="button" role="switch" aria-checked={item.enabled} aria-label={copy.title} aria-describedby={`${item.id}-detail`} disabled={busy !== null || !data.canManage || (!item.configured && !item.enabled)} onClick={() => void save(item, !item.enabled)} className={`inline-flex h-8 w-14 shrink-0 items-center rounded-full border p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${item.enabled ? 'bg-primary' : 'bg-muted'}`}><span aria-hidden="true" className={`size-5 rounded-full bg-white shadow-sm ${item.enabled ? 'ml-auto' : ''}`} /></button>
          </div>
          <p id={`${item.id}-detail`} className="mt-3 text-sm leading-6 text-muted-foreground">{copy.detail}</p>
          {!item.configured && <p className="mt-2 text-sm">Add this service’s credentials below before enabling it. You can keep using Carestead without it.</p>}
          {item.enabled && <p className="mt-2 text-sm leading-6">{copy.next}</p>}
        </div>;
      })}</div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">Credentials configured does not confirm provider access. Switching off pauses the service; it does not cancel requests already sent or delete provider data.</p>
    </>}
  </section>;
}
