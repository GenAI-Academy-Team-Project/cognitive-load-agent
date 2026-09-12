'use client';

import { useState, type SubmitEvent } from 'react';
import { Activity, ChevronDown, Database, LoaderCircle, LockKeyhole, LogOut, MemoryStick, Settings, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/password-input';
import { PasswordRules } from '@/components/password-rules';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { CurrentUser } from '@/lib/types';

type AccountView = 'Privacy & data' | 'Integrations' | 'Memory';
const accountItems = [
  { label: 'Privacy & data', icon: Database },
  { label: 'Integrations', icon: Activity },
  { label: 'Memory', icon: MemoryStick },
] as const;
const roleDetails = {
  owner: 'You can manage care-circle membership, consent, integrations, and care records.',
  caregiver: 'You can coordinate care and update care records when consent is active. An owner manages membership, consent, and integrations.',
  viewer: 'You can review the care information shared with you. Your role does not allow changes to care records.',
};

export function AccountMenus({ user, recipientName, view, onNavigate, onSignOut, busy }: {
  user: CurrentUser; recipientName: string; view: string; onNavigate: (view: AccountView) => void; onSignOut: () => void; busy: boolean;
}) {
  const [dialog, setDialog] = useState<'role' | 'password' | null>(null);
  return <>
    {!user.isGuest && <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />} aria-label="Account settings" className={accountItems.some((item) => item.label === view) ? 'bg-secondary text-primary' : ''}>
        <Settings /><span className="hidden sm:inline">Account settings</span><ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Account settings</DropdownMenuLabel>
          {accountItems.map(({ label, icon: Icon }) => <DropdownMenuItem key={label} onClick={() => onNavigate(label)} aria-current={view === label ? 'page' : undefined} className="px-3 py-2.5"><Icon />{label}</DropdownMenuItem>)}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>}
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Profile settings for ${user.displayName}`} className="flex min-w-0 items-center gap-2 rounded-lg p-1.5 text-left outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring">
        <span className="hidden text-right sm:block"><span className="block max-w-32 truncate text-xs font-medium">{user.displayName}</span><span className="block text-[10px] capitalize text-muted-foreground">{user.isGuest || user.role === 'viewer' ? 'Guest' : user.role}</span></span>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d9eadf] text-sm font-semibold text-[#315944]">{user.displayName.slice(0, 2).toUpperCase()}</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Profile settings</DropdownMenuLabel>
          <div className="px-3 py-2"><p className="truncate text-sm font-medium">{user.displayName}</p><p className="break-all text-xs text-muted-foreground">{user.email || 'Guest preview'}</p></div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDialog('role')} className="px-3 py-2.5"><ShieldCheck />Role details</DropdownMenuItem>
          {!user.isGuest && <DropdownMenuItem onClick={() => setDialog('password')} className="px-3 py-2.5"><LockKeyhole />Update password</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSignOut} disabled={busy} className="px-3 py-2.5"><LogOut />Log out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={dialog === 'role'} onOpenChange={(open) => { if (!open) setDialog(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Role details</DialogTitle><DialogDescription>Your access for {recipientName}.</DialogDescription></DialogHeader>
        <div className="rounded-xl border bg-secondary p-4"><p className="font-medium capitalize">{user.isGuest || user.role === 'viewer' ? 'Guest' : user.role}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{user.isGuest ? 'You can explore a read-only care plan with fictional sample data.' : roleDetails[user.role]}</p></div>
        <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={dialog === 'password'} onOpenChange={(open) => { if (!open) setDialog(null); }}>
      <DialogContent><PasswordForm key={dialog ?? 'closed'} email={user.email} /></DialogContent>
    </Dialog>
  </>;
}

function PasswordForm({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError(''); setSaved(false);
    if (data.get('newPassword') !== data.get('confirmPassword')) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/update-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(data)) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Your password could not be updated. Try again.');
      form.reset(); setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' }); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your password could not be updated. Try again.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-5">
    <DialogHeader><DialogTitle>Update password</DialogTitle><DialogDescription>Manage the password for {email}. Other sessions will be signed out after you save.</DialogDescription></DialogHeader>
    <input type="hidden" autoComplete="username" name="email" value={email} />
    {([
      ['currentPassword', 'Current password', 'current-password'],
      ['newPassword', 'New password', 'new-password'],
      ['confirmPassword', 'Confirm new password', 'new-password'],
    ] as const).map(([name, label, autoComplete]) => <div key={name} className="space-y-2"><label htmlFor={name} className="text-sm font-medium">{label}</label><PasswordInput label={label} id={name} name={name} onChange={(event) => setPasswords(values => ({ ...values, [name]: event.target.value }))} autoComplete={autoComplete} required minLength={name === 'currentPassword' ? 1 : 12} maxLength={128} disabled={busy} aria-describedby={name === 'newPassword' ? 'new-password-hint' : name === 'confirmPassword' ? 'confirmation-hint' : undefined} />{name === 'newPassword' && <PasswordRules id="new-password-hint" password={passwords.newPassword} currentPassword={passwords.currentPassword} />}{name === 'confirmPassword' && <PasswordRules id="confirmation-hint" password={passwords.newPassword} confirmation={passwords.confirmPassword} />}</div>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && <output className="block text-sm text-primary">Password updated. Your other sessions have been signed out.</output>}
    <DialogFooter><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}Update password</Button></DialogFooter>
  </form>;
}
