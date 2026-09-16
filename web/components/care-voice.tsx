'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2, VolumeX, ChevronDown, History, Keyboard } from 'lucide-react';
import { voiceSession } from '@/lib/voice-session';
import { CareEvidence } from './care-evidence';
import { Button } from '@/components/ui/button';
import { browserVoice, voiceCommand, careVoiceRequest, needsVoiceTime, needsVoiceTitle, type VoiceAdapter } from '@/lib/voice';
import type { ChatMessage, ChatState } from '@/lib/types';

export function CareVoice({ recipientId, recipientName, screen, screens, navigate, canWrite, onChanged, adapter, voiceFirst = false, spokenReplies = true, onSpokenRepliesChange, initialChat, onResponse, presentation = 'panel', onType, onHistory, autoListen = false, claimAutoListen, disabled = false, onBusyChange }: {
  onSpokenRepliesChange?: (enabled: boolean) => void;
  disabled?: boolean; onBusyChange?: (busy: boolean) => void;
  presentation?: 'mobile' | 'panel'; onType?: () => void; onHistory?: () => void;
  autoListen?: boolean; claimAutoListen?: () => boolean;
  initialChat?: ChatState; onResponse?: (chat: ChatState) => void;
  voiceFirst?: boolean; spokenReplies?: boolean;
  recipientId: string; recipientName: string; screen: string; screens: string[];
  navigate: (screen: string) => void; canWrite: boolean; onChanged: () => void; adapter?: VoiceAdapter;
}) {
  const [voice] = useState(() => voiceSession(adapter || browserVoice()));
  const [expanded, setExpanded] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'listening' | 'working'>('idle');
  const [reply, setReply] = useState('Ask about care, plan a responsibility, or open a screen.');
  const [transcript, setTranscript] = useState('');
  const [replyEvidence, setReplyEvidence] = useState<{ recipientId: string; message: ChatMessage } | null>(null);
  const latest = [...(initialChat?.messages ?? [])].reverse().find(message => message.role === 'assistant');
  const pending = latest?.action?.status === 'pending' ? latest.action : null;
  const [localMuted, setLocalMuted] = useState(!spokenReplies);
  const muted = onSpokenRepliesChange ? !spokenReplies : localMuted;
  const clarification = useRef('');
  const awaitingTitle = useRef(false);
  const generation = useRef(0);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const stop = () => { if (document.hidden) { if (lock.current) setReply('Listening interrupted. Tap Talk to try again.'); generation.current++; voice.stop(); voice.silence(); lock.current = false; setPhase('idle'); } };
    const modalFocus = (event: FocusEvent) => { if (presentation === 'mobile' && event.target instanceof Element && event.target.closest('[role=dialog], [role=menu]')) { if (lock.current) setReply('Listening stopped while another window was opened. Tap Talk to try again.'); generation.current++; voice.stop(); voice.silence(); lock.current = false; setPhase('idle'); } };
    document.addEventListener('focusin', modalFocus);
    document.addEventListener('visibilitychange', stop);
    const invalidate = () => { alive.current = false; generation.current++; };
    return () => { invalidate(); voice.stop(); voice.silence(); document.removeEventListener('visibilitychange', stop); document.removeEventListener('focusin', modalFocus); };
  }, [voice, presentation]);
  useEffect(() => { onBusyChange?.(phase !== 'idle'); return () => onBusyChange?.(false); }, [phase, onBusyChange]);
  useEffect(() => {
    if (!disabled) return;
    generation.current++; voice.stop(); lock.current = false;
    const frame = requestAnimationFrame(() => setPhase('idle'));
    return () => cancelAnimationFrame(frame);
  }, [disabled, voice]);
  function say(text: string) { setReply(text); if (!muted) voice.speak(text); }
  async function command(text: string, version: number) {
    const current = () => alive.current && version === generation.current;
    const intent = voiceCommand(text, screens);
    if (intent.kind === 'navigate') { clarification.current = ''; navigate(intent.screen); say(`Opened ${intent.screen}.`); setExpanded(false); return; }
    if (intent.kind === 'confirm' || intent.kind === 'cancel') {
      if (!pending) { clarification.current = ''; say(intent.kind === 'cancel' ? 'Request cancelled.' : 'There is no voice action waiting for confirmation.'); return; }
      if (intent.kind === 'confirm' && !canWrite) { say('You do not have permission to make this change.'); return; }
    } else if (pending) { say('Please confirm or cancel the displayed action before making another request.'); return; }
    const requestText = careVoiceRequest(clarification.current ? (awaitingTitle.current ? clarification.current.replace(/create responsibility(?: to\b)?/i, `create responsibility to ${text}`) : `${clarification.current} ${text}`) : text, screen);
    awaitingTitle.current = false;
    if (intent.kind === 'request' && needsVoiceTitle(requestText)) { clarification.current = requestText; awaitingTitle.current = true; say('What should the reminder be for? Say the task, or say Cancel.'); return; }
    if (intent.kind === 'request' && needsVoiceTime(requestText)) { clarification.current = requestText; say('What date and time? Say, for example, tomorrow at nine AM, or say Cancel.'); return; }
    clarification.current = '';
    const payload = intent.kind === 'confirm' || intent.kind === 'cancel'
      ? { action: intent.kind === 'confirm' ? 'approve_action' : 'reject_action', actionId: pending!.id }
      : { action: 'message', message: requestText };
    setPhase('working');
    // The recipient is explicit; backend authorization and approval remain authoritative.
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId, ...payload }) });
    const result = await response.json() as ChatState & { error?: string };
    if (!current()) return;
    if (!response.ok) throw new Error(result.error || 'Request failed. Check the activity log before retrying a change.');
    if (result.recipientId !== recipientId) throw new Error('The care recipient changed. Please try again.');
    const latest = [...result.messages].reverse().find(message => message.role === 'assistant');
    const action = latest?.action?.status === 'pending' ? latest.action : null;
    onResponse?.(result);
    const answer = action ? `${latest?.content || ''} ${action.summary}. ${Object.entries(action.payload).filter(([key]) => !/id$/i.test(key)).map(([key, value]) => `${key}: ${value}`).join('. ')}. Say Confirm to approve, or Cancel.` : latest?.content || 'Request completed.';
    setReplyEvidence(latest ? { recipientId, message: latest } : null);
    setReply(presentation === 'mobile' ? latest?.content || 'Request completed.' : 'Reply added to your conversation.');
    if (!muted) voice.speak(answer);
    if (intent.kind === 'confirm') onChanged();
  }
  async function run(text?: string) {
    if (lock.current || disabled) return;
    setReplyEvidence(null);
    lock.current = true; setExpanded(true); voice.silence();
    const version = ++generation.current;
    try {
      if (!text) { setTranscript(''); setPhase('listening'); }
      const heard = text || await voice.listen();
      if (!alive.current || generation.current !== version) return;
      if (!heard.trim()) throw new Error('No speech heard. Tap Talk and try again.');
      setTranscript(heard); await command(heard, version);
    } catch (error) {
      if (error instanceof Error && error.message === 'Listening stopped.') { if (alive.current && generation.current === version) setReply('Recording cancelled. Tap Talk to try again.'); return; }
      if (alive.current && generation.current === version) { say(error instanceof Error ? error.message : 'Voice request failed.'); }
    } finally { if (alive.current && generation.current === version) { lock.current = false; setPhase('idle'); } }
  }
  function stop() { setReply('Recording cancelled. Nothing was sent. Tap Talk to try again.'); generation.current++; voice.stop(); voice.silence(); lock.current = false; setPhase('idle'); }
  const autoRun = useRef(() => { void run(); });
  useEffect(() => { autoRun.current = () => { void run(); }; });
  useEffect(() => {
    if (!autoListen || !claimAutoListen) return;
    const start = () => {
      if (document.visibilityState === 'visible' && !document.querySelector('[role=dialog]') && claimAutoListen()) autoRun.current();
    };
    const frame = requestAnimationFrame(start);
    document.addEventListener('visibilitychange', start);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', start); };
  }, [autoListen, claimAutoListen]);
  const mobile = presentation === 'mobile';
  const showCard = expanded || !!pending || phase !== 'idle';
  return <section aria-label="Carestead voice assistant" data-voice-primary={voiceFirst}
    className={mobile ? 'rounded-3xl border border-primary/20 bg-card p-4 shadow-[0_-8px_40px_rgb(35_68_52/0.12)]' : 'border-t bg-secondary/40 px-4 py-3'}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="min-w-0 truncate text-xs font-medium text-muted-foreground">{mobile ? `Carestead · ${recipientName}` : `Speaking about ${recipientName}`}</p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label={muted ? 'Enable spoken replies' : 'Mute spoken replies'} onClick={() => { voice.silence(); if (onSpokenRepliesChange) onSpokenRepliesChange(muted); else setLocalMuted(!muted); }}>{muted ? <VolumeX /> : <Volume2 />}</Button>
        {mobile && onHistory && <Button variant="ghost" size="icon-sm" aria-label="Conversation history" onClick={onHistory}><History /></Button>}
        {mobile && expanded && !pending && phase === 'idle' && <Button variant="ghost" size="icon-sm" aria-label="Minimize voice response" onClick={() => setExpanded(false)}><ChevronDown /></Button>}
      </div>
    </div>
    {((mobile && showCard) || (!mobile && (transcript || phase !== 'idle' || expanded))) && <div className={mobile ? 'mb-3 max-h-[38dvh] overflow-y-auto rounded-2xl border bg-background p-4' : 'mb-3'}>
      {transcript && <p className="mb-2 break-words text-xs text-muted-foreground">You: {transcript}</p>}
      <output className="block whitespace-pre-wrap break-words text-sm leading-6">{phase === 'listening' ? 'Listening… Speak, then pause to send.' : phase === 'working' ? 'Checking your request…' : reply}</output>
      {mobile && phase === 'idle' && replyEvidence?.recipientId === recipientId && <CareEvidence key={replyEvidence.message.id} evidence={replyEvidence.message.evidence} />}
      {mobile && pending && <div className="mt-3 border-t pt-3 text-sm"><strong>{pending.summary}</strong><dl className="mt-2 space-y-1">{Object.entries(pending.payload).filter(([key]) => !/id$/i.test(key)).map(([key, value]) => <div key={key} className="break-words"><dt className="font-medium">{key}</dt><dd>{value}</dd></div>)}</dl><p className="mt-3 text-xs">Say Confirm or Cancel, or choose below.</p><div className="mt-2 flex gap-2"><Button disabled={!canWrite || phase !== 'idle'} onClick={() => void run('Confirm')}>Confirm</Button><Button variant="outline" disabled={phase !== 'idle'} onClick={() => void run('Cancel')}>Cancel</Button></div></div>}
    </div>}
    <div className="flex items-center gap-2">
      <Button className={mobile ? 'h-14 flex-1 rounded-2xl px-4 text-base' : 'h-11 flex-1 rounded-xl'} variant={voiceFirst ? 'default' : 'outline'} disabled={disabled || phase === 'working'} aria-label={phase === 'listening' ? 'Cancel recording' : 'Talk to Carestead'} aria-pressed={phase === 'listening'} onClick={() => phase === 'listening' ? stop() : void run()}>{phase === 'listening' ? <Square /> : <Mic />}{phase === 'listening' ? 'Cancel recording' : mobile ? 'Talk' : 'Talk to Carestead'}</Button>
      {mobile && onType && <Button variant={voiceFirst ? 'ghost' : 'default'} className={voiceFirst ? 'h-14 rounded-xl' : 'order-first h-14 flex-1 rounded-xl'} onClick={onType}><Keyboard />{voiceFirst ? 'Type instead' : 'Type to Carestead'}</Button>}
    </div>
    {mobile && <p className="mt-2 text-center text-[11px] text-muted-foreground">{phase === 'listening' ? 'Microphone on · pause to send, or cancel to discard' : 'Speak to navigate, ask, or plan. Changes need confirmation.'}</p>}
  </section>;
}
