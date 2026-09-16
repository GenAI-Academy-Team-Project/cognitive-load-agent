'use client';
import { useEffect, useRef, useState } from 'react';
import { browserVoice, type VoiceAdapter } from '@/lib/voice';
import { voiceSession } from '@/lib/voice-session';

export function useDictation({ adapter, enabled, scope, onText, onError }: {
  adapter?: VoiceAdapter; enabled: boolean; scope: string;
  onText: (text: string) => void; onError: (message: string) => void;
}) {
  const [voice] = useState(() => voiceSession(adapter || browserVoice()));
  const [listening, setListening] = useState(false);
  const generation = useRef(0);
  const callbacks = useRef({ onText, onError });
  useEffect(() => { callbacks.current = { onText, onError }; }, [onText, onError]);
  function stop() { generation.current++; voice.stop(); setListening(false); }
  useEffect(() => {
    const frame = requestAnimationFrame(() => setListening(false));
    const background = () => { if (document.hidden) { generation.current++; voice.stop(); voice.silence(); setListening(false); } };
    document.addEventListener('visibilitychange', background);
    const invalidate = () => { generation.current++; };
    return () => { cancelAnimationFrame(frame); invalidate(); voice.stop(); voice.silence(); document.removeEventListener('visibilitychange', background); };
  }, [voice, scope]);
  useEffect(() => {
    if (enabled) return;
    generation.current++;
    voice.stop();
    const frame = requestAnimationFrame(() => setListening(false));
    return () => cancelAnimationFrame(frame);
  }, [voice, enabled]);
  async function toggle() {
    if (listening) { stop(); return; }
    if (!enabled) return;
    if (!voice.supported()) { callbacks.current.onError('Voice input is unavailable here. You can still type your message.'); return; }
    const version = ++generation.current;
    setListening(true);
    try {
      const text = await voice.listen();
      if (version === generation.current) callbacks.current.onText(text);
    } catch (error) {
      if (version === generation.current && !(error instanceof Error && error.message === 'Listening stopped.')) callbacks.current.onError(error instanceof Error ? error.message : 'Could not hear you. Try again or type.');
    } finally { if (version === generation.current) setListening(false); }
  }
  // Rendering uses this value only while the current surface is enabled.
  return { listening: enabled && listening, toggle, stop, voice };
}
