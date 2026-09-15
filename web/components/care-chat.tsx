'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Check, Mic, MicOff, Send, Sparkles, Volume2, VolumeX, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { ChatMessage, ChatState } from '@/lib/types';

type RecognitionEventLike = { results: { [index: number]: { [index: number]: { transcript: string } } } };
type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type VoiceWindow = Window & { webkitSpeechRecognition?: new () => RecognitionLike; SpeechRecognition?: new () => RecognitionLike };

function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.98;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export function CareChat({ recipientId, recipientName, canWrite, onActionCompleted }: { recipientId: string; recipientName: string; canWrite: boolean; onActionCompleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<ChatState | null>(null);
  const [previousMessageIds, setPreviousMessageIds] = useState<string[]>([]);
  const [showPrevious, setShowPrevious] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [spokenReplies, setSpokenReplies] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const currentRecipient = useRef(recipientId);
  useEffect(() => { currentRecipient.current = recipientId; }, [recipientId]);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const lastSpokenId = useRef<string | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const messages = chat?.recipientId === recipientId ? chat.messages.filter((message) => showPrevious || !previousMessageIds.includes(message.id)) : [];
  const latestMessageId = messages.at(-1)?.id;

  useEffect(() => {
    const viewport = historyRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
    viewport?.scrollTo({ top: viewport.scrollHeight });
  }, [latestMessageId, busy, showPrevious]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch(`/api/chat?recipientId=${encodeURIComponent(recipientId)}`)
      .then(async (response) => {
        const result = await response.json() as ChatState | { error: string };
        if (!response.ok) throw new Error('error' in result ? result.error : 'Unable to load chat');
        return result as ChatState;
      })
      .then((result) => { if (active) { setPreviousMessageIds(result.messages.map((message) => message.id)); setShowPrevious(false); setChat(result); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load chat'); });
    return () => { active = false; };
  }, [open, recipientId]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVoiceSupported(Boolean((window as VoiceWindow).SpeechRecognition || (window as VoiceWindow).webkitSpeechRecognition)));
    return () => cancelAnimationFrame(frame);
  }, []);

  async function request(payload: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId, ...payload }) });
      const result = await response.json() as ChatState | { error: string };
      if (!response.ok) throw new Error('error' in result ? result.error : 'Chat request failed');
      const next = result as ChatState;
      if (currentRecipient.current !== recipientId) return false;
      setChat(next);
      const latest = [...next.messages].reverse().find((message) => message.role === 'assistant');
      if (spokenReplies && latest && latest.id !== lastSpokenId.current) { lastSpokenId.current = latest.id; speak(latest.content); }
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Carestead could not complete that request.');
      return false;
    } finally { setBusy(false); }
  }

  async function send(message = draft) {
    const value = message.trim();
    if (!value || busy || chat?.recipientId !== recipientId) return;
    setDraft('');
    await request({ action: 'message', message: value });
  }

  async function decide(actionId: string, decision: 'approve_action' | 'reject_action') {
    const complete = await request({ action: decision, actionId });
    if (complete && decision === 'approve_action') onActionCompleted();
  }

  async function clearHistory() {
    if (await request({ action: 'clear_history' })) {
      setPreviousMessageIds([]);
      setShowPrevious(false);
      setConfirmClear(false);
      lastSpokenId.current = null;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
  }

  function toggleListening() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const Constructor = (window as VoiceWindow).SpeechRecognition || (window as VoiceWindow).webkitSpeechRecognition;
    if (!Constructor) { setError('Voice input is not supported by this browser. You can continue by typing.'); return; }
    const recognition = new Constructor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-CA';
    recognition.onresult = (event) => { const transcript = event.results[0]?.[0]?.transcript || ''; setDraft(transcript); };
    recognition.onerror = () => { setError('I could not hear that clearly. Please try again or type your question.'); setListening(false); };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <>
      <Button onClick={() => { setChat(null); setError(null); setOpen(true); }} className="fixed right-5 bottom-5 z-40 h-13 w-13 rounded-2xl px-0 sm:w-auto sm:px-5 shadow-[0_14px_40px_rgb(35_68_52/0.24)]" aria-label={`Ask Carestead about ${recipientName}`}>
        <Sparkles className="size-5" /><span className="hidden sm:inline">Ask Carestead</span>
      </Button>
      <Sheet open={open} onOpenChange={(next) => { if (next) { setChat(null); setError(null); } setOpen(next); }}>
        <SheetContent className="w-[min(100vw,460px)] gap-0 border-l-0 bg-background p-0 sm:max-w-[460px]" aria-label={`Carestead assistant for ${recipientName}`}>
          <SheetHeader className="border-b bg-card px-5 py-4 pr-14">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Bot className="size-5" /></span>
              <div><SheetTitle className="font-heading text-lg font-semibold">Ask about {recipientName}</SheetTitle><SheetDescription className="mt-0.5 text-xs">{chat?.agentMode === 'model' ? `AI-grounded answers${chat.model ? ` · ${chat.model}` : ''}` : 'Grounded local answers'} · actions require approval</SheetDescription></div>
            </div>
          </SheetHeader>

          {chat?.recipientId === recipientId && chat.messages.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2">{previousMessageIds.length > 0 && <Button variant="ghost" size="sm" onClick={() => setShowPrevious((value) => !value)} aria-expanded={showPrevious}>{showPrevious ? 'Hide previous conversation' : 'Show previous conversation'}</Button>}<Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmClear(true)}>Clear chat history</Button></div>}
          <ScrollArea ref={historyRef} className="min-h-0 flex-1">
            <div className="space-y-4 px-4 py-5" aria-live="polite" aria-busy={busy}>
              {!chat && !error && <div className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground"><Sparkles className="size-4 animate-pulse text-primary" />Preparing the recipient-specific care context…</div>}
              {chat?.recipientId === recipientId && messages.length === 0 && <Welcome recipientName={recipientName} />}
              {messages.map((message) => <Message key={message.id} message={message} canWrite={canWrite} busy={busy} onDecide={decide} />)}
              {busy && <div className="w-fit rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-sm text-muted-foreground">Checking the care plan…</div>}
              {error && <div role="alert" className="rounded-xl border border-[var(--care-rose-ink)]/30 bg-[var(--care-rose)] p-3 text-sm text-[var(--care-rose-ink)]">{error}</div>}
            </div>
          </ScrollArea>

          <div className="border-t bg-card p-4">

            {chat?.recipientId === recipientId && messages.length === 0 && <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{chat.quickPrompts.map((prompt) => <button key={prompt} onClick={() => send(prompt)} disabled={busy} className="shrink-0 rounded-full border bg-card px-3 py-1.5 text-left text-xs text-[var(--care-success-ink)] hover:bg-secondary disabled:opacity-50">{prompt}</button>)}</div>}
            <div className="rounded-2xl border bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
              <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={`Ask about ${recipientName} or request an action…`} aria-label={`Message Carestead about ${recipientName}`} className="min-h-14 resize-none border-0 p-2 shadow-none focus-visible:ring-0" disabled={busy} />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button type="button" variant={listening ? 'default' : 'ghost'} size="icon-sm" onClick={toggleListening} aria-label={listening ? 'Stop listening' : 'Start voice input'} aria-pressed={listening} disabled={!voiceSupported || busy}>{listening ? <MicOff /> : <Mic />}</Button>
                  <Button type="button" variant={spokenReplies ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => { setSpokenReplies((value) => !value); if (spokenReplies && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }} aria-label={spokenReplies ? 'Turn off spoken replies' : 'Turn on spoken replies'} aria-pressed={spokenReplies}>{spokenReplies ? <Volume2 /> : <VolumeX />}</Button>
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">Audio is not saved</span>
                </div>
                <Button type="button" size="icon-sm" onClick={() => send()} disabled={!draft.trim() || busy || chat?.recipientId !== recipientId} aria-label="Send message"><Send /></Button>
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] leading-4 text-muted-foreground">Care coordination only—not medical advice. Messages require approval. Enable delivery channels in Notifications.</p>
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={confirmClear} onOpenChange={(next) => { if (!busy) setConfirmClear(next); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Clear chat history?</DialogTitle><DialogDescription>Permanently delete your saved voice and text messages about {recipientName}. Care records, trusted facts, and action records are retained.</DialogDescription></DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirmClear(false)}>Cancel</Button><Button disabled={busy} onClick={clearHistory}>{busy ? 'Clearing…' : 'Clear history'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Welcome({ recipientName }: { recipientName: string }) {
  return <div className="rounded-2xl border bg-card p-5"><span className="grid size-9 place-items-center rounded-xl bg-secondary text-primary"><Sparkles className="size-4" /></span><h3 className="mt-3 font-heading font-semibold">How can I help with {recipientName}’s care plan?</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">I can explain the latest state, find supporting records, check appointment conflicts, or prepare a safe action for your approval.</p></div>;
}

function Message({ message, canWrite, busy, onDecide }: { message: ChatMessage; canWrite: boolean; busy: boolean; onDecide: (id: string, decision: 'approve_action' | 'reject_action') => void }) {
  const user = message.role === 'user';
  return <article className={user ? 'ml-8' : 'mr-5'} aria-label={`${user ? 'You' : 'Carestead'} said`}>
    <div className={user ? 'rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground' : 'rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-sm leading-6'}>{message.content}</div>
    {!user && message.evidence.length > 0 && <details className="mt-2 rounded-xl border bg-card px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-primary">Evidence used · {message.evidence.length}</summary><div className="mt-2 space-y-2">{message.evidence.map((item, index) => <div key={`${item.label}-${index}`} className="border-l-2 border-border pl-2"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--care-success-ink)]">{item.label}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.detail}</p></div>)}</div></details>}
    {message.action && !message.evidence.some((item) => item.label === 'Completed tool') && message.content !== 'Action cancelled. No care-plan data was changed.' && <div className="mt-2 rounded-2xl border border-border bg-[var(--care-success)] p-4"><div className="flex items-center justify-between gap-2"><Badge variant="outline" className="bg-card text-[var(--care-success-ink)]">Approval required</Badge><span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{message.action.action_type.replaceAll('_', ' ')}</span></div><p className="mt-3 text-sm font-medium leading-5">{message.action.summary}</p>{message.action.action_type === 'send_notification' && <div className="mt-3 space-y-2 text-sm"><p>Channel: {message.action.payload.channel === 'ntfy' ? 'Mobile push' : message.action.payload.channel || 'in_app'}</p>{message.action.payload.targetName && <p>To: {message.action.payload.targetName} · {message.action.payload.destinationLabel?.replace('ntfy', 'mobile push')}</p>}<p className="font-medium">{message.action.payload.title}</p><p className="whitespace-pre-wrap break-words">{message.action.payload.detail}</p>{message.action.payload.channel && message.action.payload.channel !== 'in_app' && <p className="text-xs text-muted-foreground">This exact text leaves Carestead and may appear on a lock screen.</p>}</div>}{message.action.status === 'pending' ? <div className="mt-4 flex gap-2"><Button size="sm" onClick={() => onDecide(message.action!.id, 'approve_action')} disabled={!canWrite || busy}><Check />{message.action.action_type === 'save_memory' ? 'Save as trusted fact' : 'Approve'}</Button><Button size="sm" variant="outline" onClick={() => onDecide(message.action!.id, 'reject_action')} disabled={!canWrite || busy}><X />Cancel</Button></div> : <p className="mt-3 flex items-center gap-1.5 text-xs font-medium capitalize text-[var(--care-success-ink)]"><Check className="size-3.5" />{message.action.status}</p>}</div>}
  </article>;
}
