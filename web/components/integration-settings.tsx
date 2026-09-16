'use client';
import { PaginatedList } from './paginated-list';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { NotificationPreferences, NotificationPreferencesProvider } from './notification-settings';
import { PrivateInput } from './private-value';
import { integrationKeys, type IntegrationId, type IntegrationStatus } from '@/lib/integration-types';

const descriptions: Record<IntegrationId, { title: string; detail: string; next: string }> = {
  ntfy: { title: 'Mobile push', detail: 'Send approved updates to your mobile push app.', next: 'Subscribe to your topic in your mobile push app, then save it below. Each message requires approval.' },
  calendar: { title: 'Google Calendar', detail: 'Create appointments in a connected Google calendar. Your local tasks and timeline always remain available.', next: 'Connect your Google account in Calendar, then approve each appointment.' },
  sms: { title: 'Twilio SMS', detail: 'Send approved messages to opted-in caregivers. In-app notifications always remain available.', next: 'Save your phone number and SMS preference below. Each message requires approval.' },
  email: { title: 'Email delivery', detail: 'Send approved care updates through Resend.', next: 'Enable your email preference below. Each message requires approval.' },
  push: { title: 'Browser push', detail: 'Send approved updates to subscribed browsers.', next: 'Allow browser notifications below. Each message requires approval.' },
  llm: { title: 'AI reasoning', detail: 'Enable advanced AI analysis for care planning and conflict detection.', next: 'Add your OpenAI API key below to enable AI-powered features. Without this, Carestead uses rule-based reasoning.' },
};
const repositoryDocs = 'https://github.com/GenAI-Academy-Team-Project/cognitive-load-agent/blob/main/docs/';
const setup: Record<IntegrationId, { detail: string; doc: string }> = {
  ntfy: { detail: 'Open your mobile push app and subscribe to a topic on the configured server. Each caregiver must save that topic and opt in below. Use an access-controlled topic for care details; a publisher token alone does not make a topic private. Changing servers requires saving preferences again.', doc: 'ntfy-setup.md' },
  calendar: { detail: 'Enable Calendar API in Google Cloud, configure the OAuth consent screen and a Web application client, add test users when in testing, and register the exact callback URL. Each caregiver must connect their account and choose an owned calendar.', doc: 'google-calendar-setup.md' },
  sms: { detail: 'Configure an SMS-capable Twilio sender and complete provider sender setup for your destination countries. Trial accounts restrict destinations. This build sends a fixed appointment-reminder trial template instead of your composed SMS text. Each receiving caregiver must save their own number and opt in for the selected recipient.', doc: 'twilio-sms-setup.md' },
  email: { detail: 'Verify the sender/domain in Resend and use that sender for outgoing mail. Each receiving caregiver must enable email for the selected recipient; delivery uses their Carestead account email.', doc: 'resend-email-setup.md' },
  push: { detail: 'Generate a VAPID key pair once and serve the app over HTTPS (localhost works for development). Each caregiver must grant notification permission and register their browser. On iPhone/iPad, add Carestead to the Home Screen and open it there. Re-register browsers after rotating VAPID keys.', doc: 'browser-push-setup.md' },
  llm: { detail: 'Create an OpenAI API account and generate an API key with access to the Reasoner API. The key enables advanced AI analysis for care planning and conflict detection. Without an API key, Carestead uses rule-based reasoning which remains fully functional. The model defaults to gpt-5.6-terra and reasoning effort to low; adjust as needed.', doc: 'deployment.md#llm-configuration' },
};
type Settings = { integrations: IntegrationStatus[]; canManage: boolean };

export function IntegrationSettings({ onChanged, recipientId, recipientName }: { onChanged: () => void; recipientId: string; recipientName: string }) {
  const [expanded, setExpanded] = useState<IntegrationId | null>(null);
  const [preferenceRevision, setPreferenceRevision] = useState(0);
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
    setBusy(item.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/integrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, enabled, ...(config ? { config } : {}) }) });
      const result = await response.json() as Settings & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Integration could not be updated.');
      setData(result);
      setPreferenceRevision(value => value + 1);
      if (config) setDrafts(current => ({ ...current, [item.id]: {} }));
      setNotice('Integration settings saved.');
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Integration could not be updated.');
      return false;
    } finally {
      setBusy(null);
    }
  }
  function edit(id: IntegrationId, key: string, value: string | null) {
    setDrafts(current => ({ ...current, [id]: { ...current[id], [key]: value } }));
  }
  return <NotificationPreferencesProvider key={recipientId} recipientId={recipientId} revision={preferenceRevision}><section aria-labelledby="integrations-title">
    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Optional connections</p>
    <h1 id="integrations-title" className="mt-2 font-heading text-3xl font-semibold">Integrations</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Carestead works without external services. Turn on only the connections your care circle needs. These switches apply to everyone in this care circle.</p>
    <p className="mt-2 text-sm text-muted-foreground">Your delivery preferences below apply to you for {recipientName}. Messages require caregiver review and approval before sending.</p>
    {notice && <output className="mt-4 block text-sm">{notice}</output>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {!data && !error && <output className="mt-6 block text-sm">Loading integrations…</output>}
    {data && <>
      {!data.canManage && <p className="mt-4 text-sm text-muted-foreground">A care-circle owner manages these switches.</p>}
      <div className="mt-7 grid min-w-0 gap-5"><PaginatedList label="Integrations" filterFields={[["status", "Connection status"], ["credential_status", "Credential setup"]]} removal={{ individual: false, disabled: busy !== null || !data.canManage, canRemove: record => Boolean(record.enabled), description: 'Switch off all enabled integrations for the care circle. Saved credentials and provider data remain.', remove: async ids => { for (const id of ids) { const item = data.integrations.find(item => item.id === id); if (!item || !await save(item, false)) return false; } return true; } }} records={data.integrations.map(item => ({ ...item, title: descriptions[item.id].title, channel: descriptions[item.id].title, status: item.enabled ? 'enabled' : 'disabled', credential_status: item.configured ? 'configured' : 'credentials_required' }))}>{data.integrations.map((item) => {
        const copy = descriptions[item.id];
        return <div key={item.id} className="min-w-0 rounded-2xl border bg-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4"><div><h2 className="font-heading text-lg font-semibold">{copy.title}</h2><p className="mt-1 text-xs text-muted-foreground">{!item.configured ? 'Credentials required' : item.enabled ? 'On · credentials configured' : 'Off · credentials configured'}</p></div>
            <button type="button" role="switch" aria-checked={item.enabled} aria-label={copy.title} aria-describedby={`${item.id}-detail`} disabled={busy !== null || !data.canManage || (!item.configured && !item.enabled)} onClick={() => void save(item, !item.enabled)} className={`inline-flex h-8 w-14 shrink-0 items-center rounded-full border p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${item.enabled ? 'bg-primary' : 'bg-muted'}`}><span aria-hidden="true" className={`size-5 rounded-full bg-white shadow-sm ${item.enabled ? 'ml-auto' : ''}`} /></button>
          </div>
          <p id={`${item.id}-detail`} className="mt-3 text-sm leading-6 text-muted-foreground">{copy.detail}</p>
          {item.id === 'sms' && <p className="mt-3 rounded-lg border bg-[var(--care-inset)] p-3 text-sm leading-6"><strong>SMS trial limitation:</strong> This build uses a hardcoded appointment-reminder template to support Twilio trial delivery. Any SMS message you enter is replaced by the default template content sent to the phone. Your composed text remains in the in-app copy. Upgrading the Twilio account alone does not remove this limitation.</p>}
          <button type="button" id={`${item.id}-manage`} aria-expanded={expanded === item.id} aria-controls={`${item.id}-settings`} aria-label={`${expanded === item.id ? 'Hide' : 'Manage'} settings for ${copy.title}`} onClick={() => setExpanded(current => current === item.id ? null : item.id)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary/30 bg-[var(--care-inset)] px-3 py-2 text-sm font-medium text-primary">
            {expanded === item.id ? 'Hide settings' : 'Manage settings'}<ChevronDown aria-hidden="true" className={`size-4 transition-transform ${expanded === item.id ? 'rotate-180' : ''}`} />
          </button>
          <section id={`${item.id}-settings`} aria-labelledby={`${item.id}-manage`} hidden={expanded !== item.id}>
          {item.id !== 'calendar' && item.id !== 'llm' && <NotificationPreferences channel={item.id} />}
          {!item.configured && <p className="mt-3 text-sm">An owner must add this service’s credentials before enabling it.</p>}
          <details className="mt-4 rounded-xl border bg-[var(--care-inset)] p-4 text-sm leading-6">
            <summary className="cursor-pointer font-medium">Setup help</summary>
            <p className="mt-3 text-muted-foreground">{setup[item.id].detail}</p>
            <p className="mt-2">{copy.next}</p>
            <a href={`${repositoryDocs}${setup[item.id].doc}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-medium text-primary underline underline-offset-4">{copy.title} setup guide (GitHub)</a>
          </details>
          {data.canManage && <details className="bg-[var(--care-inset)] mt-4 rounded-xl border p-4">
            <summary className="cursor-pointer text-sm font-medium">Environment configuration</summary>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">Saved overrides take precedence over .dev.vars and deployment environment values. Leave an input blank to keep its current value. Saved values are encrypted on the server and stay hidden. Use the eye button to check a new value before saving.</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Saving overrides requires a server encryption key. <a href={`${repositoryDocs}deployment.md#encrypted-integration-overrides`} target="_blank" rel="noopener noreferrer" className="text-primary underline">Encrypted override setup (GitHub)</a></p>
            {item.id === 'ntfy' && <p className="mt-2 text-xs text-muted-foreground">The access token is optional. Use a token belonging to the selected server.</p>}
            <form className="mt-4 space-y-4" autoComplete="off" onSubmit={event => {
              event.preventDefault();
              const config = Object.fromEntries(Object.entries(drafts[item.id] || {}).filter(([, value]) => value === null || value.trim()));
              void save(item, item.enabled, config);
            }}>
              {integrationKeys[item.id].map(key => {
                const source = item.fields?.find(field => field.key === key)?.source || 'missing';
                const reset = drafts[item.id]?.[key] === null;
                return <div key={key}>
                  <label htmlFor={`${item.id}-${key}`} className="block break-all text-xs font-medium">{key}</label>
                  <p id={`${item.id}-${key}-source`} className="mt-1 text-xs text-muted-foreground">{reset ? 'Will use environment after saving' : source === 'override' ? 'Saved override · value hidden' : source === 'environment' ? 'Environment · value hidden' : 'Not configured'}</p>
                  <PrivateInput label={key} id={`${item.id}-${key}`} type="password" autoComplete="new-password" spellCheck={false} autoCapitalize="none" aria-describedby={`${item.id}-${key}-source`} value={drafts[item.id]?.[key] ?? ''} placeholder={source === 'missing' ? 'Enter value' : '••••••••'} disabled={busy !== null || reset} maxLength={8192} onChange={event => edit(item.id, key, event.target.value)} className="mt-2 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm" />
                  {(source === 'override' || reset) && <button type="button" disabled={busy !== null} onClick={() => edit(item.id, key, reset ? '' : null)} className="mt-2 text-xs underline">{reset ? 'Keep saved override' : 'Use environment value'}</button>}
                </div>;
              })}
              <button type="submit" disabled={busy !== null || !Object.values(drafts[item.id] || {}).some(value => value === null || value.trim())} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy === item.id ? 'Saving…' : 'Save configuration'}</button>
            </form>
          </details>}
          </section>
        </div>;
      })}</PaginatedList></div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">Credentials configured does not confirm provider access. Switching off pauses the service; it does not cancel requests already sent or delete provider data.</p>
    </>}
  </section></NotificationPreferencesProvider>;
}
