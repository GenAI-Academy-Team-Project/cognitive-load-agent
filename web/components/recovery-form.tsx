'use client';
/* eslint-disable next/no-html-link-for-pages -- Auth uses document navigation for vinext compatibility. */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/password-input';
import { PasswordRules } from '@/components/password-rules';

export function RecoveryForm({ reset = false }: { reset?: boolean }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  // Read the one-time fragment after hydration, then remove it from browser history.
  useEffect(() => {
    if (reset) {
      // eslint-disable-next-line react/react-compiler -- Synchronize the browser-only secret after hydration.
      setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react/react-compiler -- Enable the form only after reading the browser fragment.
    setReady(true);
  }, [reset]);
  const validToken = /^[a-f0-9]{64}$/.test(token);
  async function submit(event: { preventDefault: () => void; currentTarget: HTMLFormElement }) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    if (reset && form.get('password') !== form.get('confirmPassword')) {
      setError('The passwords do not match.'); return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${reset ? 'reset-password' : 'forgot-password'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reset ? { token, password: form.get('password'), confirmPassword: form.get('confirmPassword') } : { email: form.get('email') }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to complete the request. Try again.');
      setDone(true);
      setToken('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to connect. Try again.'); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
    <section className="w-full max-w-sm" aria-labelledby="recovery-title">
      <a href="/sign-in" className="font-heading text-xl font-bold text-primary">Carestead</a>
      <h1 id="recovery-title" className="mt-8 font-heading text-3xl font-semibold">{reset ? 'Reset your password' : 'Forgot your password?'}</h1>
      {done ? <output className="mt-5 block text-sm leading-6">{reset ? 'Your password has been reset and existing sessions have been signed out. Sign in with your new password.' : 'If an account uses that email address, a password reset link will arrive shortly. Check your spam folder too.'}</output> : <>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{reset ? 'Choose a new password with 12–128 characters.' : 'Enter your account email. We’ll send a link you can use within 30 minutes.'}</p>
        {reset && ready && !validToken ? <p role="alert" className="mt-5 text-sm">This reset link is missing or invalid. <a href="/forgot-password" className="text-primary underline">Request a new link</a>.</p> : <form onSubmit={submit} className="mt-7 space-y-5">
          {reset ? <>
            <div className="space-y-2"><label htmlFor="password" className="text-sm font-medium">New password</label><PasswordInput label="New password" id="password" name="password" onChange={(event) => setPassword(event.target.value)} aria-describedby="password-hint" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy || !ready} /><PasswordRules id="password-hint" password={password} /></div>
            <div className="space-y-2"><label htmlFor="confirmPassword" className="text-sm font-medium">Confirm new password</label><PasswordInput label="Confirm new password" id="confirmPassword" name="confirmPassword" onChange={(event) => setConfirmation(event.target.value)} aria-describedby="confirmation-hint" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy || !ready} /><PasswordRules id="confirmation-hint" password={password} confirmation={confirmation} /></div>
          </> : <div className="space-y-2"><label htmlFor="email" className="text-sm font-medium">Email address</label><Input id="email" name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy || !ready} /></div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}{reset && <> <a href="/forgot-password" className="underline">Request a new reset link</a>.</>}</p>}
          <Button type="submit" className="w-full" disabled={busy || !ready || (reset && !validToken)}>{busy ? 'Please wait…' : reset ? 'Reset password' : 'Send reset link'}</Button>
        </form>}
      </>}
      {!reset && <details className="mt-7 text-sm"><summary className="cursor-pointer font-medium">Forgot your email address?</summary><p className="mt-3 leading-6 text-muted-foreground">Check your password manager or search your inboxes for Carestead invitations. You can also ask your care-circle owner which email they invited. If you no longer have access to that inbox, contact the owner for help restoring access.</p></details>}
      <p className="mt-7 text-center text-sm"><a href="/sign-in" className="text-primary underline underline-offset-4">Back to sign in</a></p>
    </section>
  </main>;
}
