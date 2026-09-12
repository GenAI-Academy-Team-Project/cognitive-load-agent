'use client';

/* eslint-disable next/no-html-link-for-pages -- Auth links need document navigation because vinext's production RSC links throw. */

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  HeartPulse,
  LoaderCircle,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Invitation secrets stay in the fragment, outside request URLs and referrer headers.
function readInvitation() {
  return (
    new URLSearchParams(window.location.hash.slice(1)).get('invitation') ?? ''
  );
}
function subscribeToHash(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

const noSubscription = () => () => {};

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const signingUp = mode === 'sign-up';
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [busy, setBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const [error, setError] = useState('');
  const invitation = useSyncExternalStore(
    subscribeToHash,
    readInvitation,
    () => '',
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((response) => {
        if (response.ok) window.location.replace('/');
      })
      .catch(() => {});
  }, []);

  async function submit(event: {
    preventDefault: () => void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    if (signingUp && form.get('password') !== form.get('confirmPassword')) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          displayName: form.get('displayName'),
          confirmPassword: form.get('confirmPassword'),
          invitation,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'Unable to sign in. Try again.');
      window.location.replace('/');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to connect. Check your connection and try again.',
      );
      setBusy(false);
    }
  }

  async function continueAsGuest() {
    setBusy(true);
    setGuestBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/guest', { method: 'POST' });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to start guest access.');
      window.location.replace('/');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to connect. Try again.');
      setBusy(false);
      setGuestBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background font-sans text-foreground">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-2">
        <aside className="flex flex-col justify-between border-b bg-sidebar p-8 sm:p-12 lg:border-r lg:border-b-0">
          {/* Auth pages use document navigation to avoid vinext RSC link failures in production. */}
          <a
            href="/sign-in"
            className="flex w-fit items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
              <HeartPulse className="size-6" />
            </span>
            <span className="font-heading text-2xl font-bold tracking-tight">
              Carestead
            </span>
          </a>
          <div className="py-10 lg:py-20">
            <p className="text-sm font-medium text-primary">
              A shared place for care
            </p>
            <h2 className="mt-4 max-w-sm font-heading text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
              Keep the next step clear.
            </h2>
            <p className="mt-5 max-w-sm text-base leading-7 text-muted-foreground">
              Bring responsibilities, care updates, and the people you rely on
              into one place.
            </p>
            <div className="mt-8 hidden items-start gap-3 border-t border-sidebar-border pt-6 lg:flex">
              <Users className="mt-1 size-5 shrink-0 text-primary" />
              <p className="max-w-xs text-sm leading-6 text-muted-foreground">
                Your care circle shares the plan. You choose who can view it and
                who can help update it.
              </p>
            </div>
          </div>
          <p className="hidden text-xs leading-5 text-muted-foreground lg:block">
            Carestead supports care coordination. It does not replace clinical
            judgment or emergency services.
          </p>
        </aside>
        <section
          className="flex items-center justify-center px-6 py-12 sm:px-12"
          aria-labelledby="auth-title"
        >
          <div className="w-full max-w-sm">
            <p className="text-sm font-medium text-primary">
              {signingUp ? 'Join Carestead' : 'Welcome back'}
            </p>
            <h1
              id="auth-title"
              className="mt-2 font-heading text-3xl font-semibold tracking-tight"
            >
              {signingUp ? 'Create your account' : 'Sign in to Carestead'}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {signingUp
                ? invitation
                  ? 'Use the email address your care-circle owner invited.'
                  : 'Set up your care circle’s first account. Joining an existing circle? Use the link from its owner.'
                : 'Continue to your care plan and shared responsibilities.'}
            </p>
            <form onSubmit={submit} className="mt-7 space-y-5">
              {signingUp && (
                <div className="space-y-2">
                  <label htmlFor="displayName" className="text-sm font-medium">
                    Your name
                  </label>
                  <Input
                    id="displayName"
                    name="displayName"
                    autoComplete="name"
                    maxLength={100}
                    required
                    disabled={busy || !hydrated}
                  />
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email address
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  disabled={busy || !hydrated}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    className="pr-11"
                    autoComplete={
                      signingUp ? 'new-password' : 'current-password'
                    }
                    minLength={signingUp ? 12 : undefined}
                    maxLength={128}
                    aria-describedby={signingUp ? 'password-hint' : undefined}
                    required
                    disabled={busy || !hydrated}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                    aria-controls="password"
                    aria-pressed={showPassword}
                    disabled={busy || !hydrated}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                {signingUp && (
                  <p
                    id="password-hint"
                    className="text-xs text-muted-foreground"
                  >
                    Use at least 12 characters. A memorable phrase works well.
                  </p>
                )}
              </div>
              {signingUp && (
                <div className="space-y-2">
                  <label
                    htmlFor="confirmPassword"
                    className="text-sm font-medium"
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmation ? 'text' : 'password'}
                      className="pr-11"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      required
                      disabled={busy || !hydrated}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowConfirmation(!showConfirmation)}
                      aria-label={
                        showConfirmation
                          ? 'Hide confirmation password'
                          : 'Show confirmation password'
                      }
                      aria-controls="confirmPassword"
                      aria-pressed={showConfirmation}
                      disabled={busy || !hydrated}
                    >
                      {showConfirmation ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                </div>
              )}
              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={busy || !hydrated}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <ArrowRight />
                )}
                {busy && !guestBusy
                  ? signingUp
                    ? 'Creating account…'
                    : 'Signing in…'
                  : signingUp
                    ? 'Create account'
                    : 'Sign in'}
              </Button>
            </form>
            {!invitation && <div className="mt-5 space-y-2">
              <Button type="button" variant="outline" className="w-full" onClick={continueAsGuest} disabled={busy || !hydrated}>
                {guestBusy && <LoaderCircle className="animate-spin" />}
                {guestBusy ? 'Opening sample…' : 'Continue as guest'}
              </Button>
              <p className="text-center text-xs leading-5 text-muted-foreground">Explore a read-only sample care plan. No account needed.</p>
            </div>}
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {signingUp ? 'Already have an account?' : 'New to Carestead?'}{' '}
              <a
                href={signingUp ? '/sign-in' : '/sign-up'}
                className="rounded font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {signingUp ? 'Sign in' : 'Create an account'}
              </a>
            </p>
            <p className="mt-10 text-xs leading-5 text-muted-foreground lg:hidden">
              Carestead supports care coordination. It does not replace clinical
              judgment or emergency services.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
