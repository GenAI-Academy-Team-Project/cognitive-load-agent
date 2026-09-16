'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { browserVoice, voiceCommand, careVoiceRequest, needsVoiceTime, needsVoiceTitle, type VoiceAdapter } from '@/lib/voice';
import type { ChatActionRequest, ChatState } from '@/lib/types';

export function CareVoice({ recipientId, recipientName, screen, screens, navigate, canWrite, onChanged, adapter }: {
  recipientId: string; recipientName: string; screen: string; screens: string[];
  navigate: (screen: string) => void; canWrite: boolean; onChanged: () => void; adapter?: VoiceAdapter;
}) {
  const [voice] = useState(() => adapter || browserVoice());
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'listening' | 'working'>('idle');
  const [reply, setReply] = useState('Say “Open calendar” or ask about the care plan.');
  const [transcript, setTranscript] = useState('');
  const [pending, setPending] = useState<ChatActionRequest | null>(null);
  const [muted, setMuted] = useState(false);
  const clarification = useRef('');
  const awaitingTitle = useRef(false);
  const generation = useRef(0);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const stop = () => { if (document.hidden) { generation.current++; voice.stop(); voice.silence(); lock.current = false; setPhase('idle'); setPending(null); } };
    document.addEventListener('visibilitychange', stop);
    return () => { alive.current = false; generation.current++; voice.stop(); voice.silence(); document.removeEventListener('visibilitychange', stop); };
  }, [voice]);
  function say(text: string) { setReply(text); if (!muted) voice.speak(text); }
  async function command(text: string, version: number) {
    const current = () => alive.current && version === generation.current;
    const intent = voiceCommand(text, screens);
    if (intent.kind === 'navigate') { clarification.current = ''; setPending(null); navigate(intent.screen); say(`Opened ${intent.screen}.`); return; }
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
    setPending(action);
    say(action ? `${latest?.content || ''} ${action.summary}. ${Object.entries(action.payload).filter(([key]) => !/id$/i.test(key)).map(([key, value]) => `${key}: ${value}`).join('. ')}. Say Confirm to approve, or Cancel.` : latest?.content || 'Request completed.');
    if (intent.kind === 'confirm') onChanged();
  }
  async function run(text?: string) {
    if (lock.current) return;
    lock.current = true; setOpen(true); voice.silence();
    const version = ++generation.current;
    try {
      if (!text) setPhase('listening');
      const heard = text || await voice.listen();
      if (!alive.current || generation.current !== version) return;
      setTranscript(heard); await command(heard, version);
    } catch (error) {
      if (alive.current && generation.current === version) { setPending(null); say(error instanceof Error ? error.message : 'Voice request failed.'); }
    } finally { if (alive.current && generation.current === version) { lock.current = false; setPhase('idle'); } }
  }
  function stop() { generation.current++; voice.stop(); voice.silence(); lock.current = false; setPhase('idle'); }
  return <div className="fixed bottom-5 left-5 z-40 max-w-[calc(100vw-2.5rem)]">
    {open && <section aria-label="Carestead voice assistant" className="mb-3 max-h-[calc(100dvh-7rem)] w-80 max-w-full overflow-y-auto rounded-2xl border bg-card p-4 shadow-xl">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Voice · {screen}</h2><Button variant="ghost" size="icon-sm" aria-label="Close voice assistant" disabled={phase === 'working'} onClick={() => { stop(); setOpen(false); }}><X /></Button></div>
      <p className="text-xs text-muted-foreground">For {recipientName}</p>
      {transcript && <p className="mt-3 text-sm">You: {transcript}</p>}
      <p role="status" className="my-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm">{phase === 'listening' ? 'Listening…' : phase === 'working' ? 'Checking your request…' : reply}</p>
      {pending && <div className="my-3 text-sm"><strong>{pending.summary}</strong><dl>{Object.entries(pending.payload).filter(([key]) => !/id$/i.test(key)).map(([key, value]) => <div key={key}><dt className="font-medium">{key}</dt><dd>{value}</dd></div>)}</dl><div className="mt-2 flex gap-2"><Button disabled={!canWrite || phase !== 'idle'} onClick={() => void run('Confirm')}>Confirm</Button><Button variant="outline" disabled={phase !== 'idle'} onClick={() => void run('Cancel')}>Cancel</Button></div></div>}
      <p className="text-xs text-muted-foreground">Tap the microphone for each command. Speech may be processed by your device’s speech provider. Requests are saved in care chat history.</p>
      <Button variant="ghost" size="sm" onClick={() => { voice.silence(); setMuted(!muted); }}>{muted ? <VolumeX /> : <Volume2 />}{muted ? 'Enable spoken replies' : 'Mute spoken replies'}</Button>
    </section>}
    <Button className="rounded-full shadow-lg" disabled={phase === 'working'} aria-label={phase === 'listening' ? 'Stop voice listening' : 'Talk to Carestead'} onClick={() => phase === 'listening' ? stop() : void run()}>{phase === 'listening' ? <Square /> : <Mic />}{phase === 'listening' ? 'Stop' : 'Talk to Carestead'}</Button>
  </div>;
}
