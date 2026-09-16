// Browser harness for the injected iOS-style adapter. No SpeechRecognition stub.
import { createRoot } from 'react-dom/client';
import CareDashboard from '@/components/care-dashboard';
import type { VoiceAdapter } from '@/lib/voice';
import '../src/mobile.css';
const controls = { calls: 0, stops: 0, spoken: [] as string[], resolve: (_text: string) => {} };
(window as unknown as { testVoice: typeof controls }).testVoice = controls;
const adapter: VoiceAdapter = {
  supported: () => true,
  listen: () => { controls.calls++; return new Promise(resolve => { controls.resolve = resolve; }); },
  stop: () => { controls.stops++; },
  speak: text => { controls.spoken.push(text); },
  silence: () => {},
};
createRoot(document.getElementById('root')!).render(<CareDashboard mobile voiceAdapter={adapter} />);
