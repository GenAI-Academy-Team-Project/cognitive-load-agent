export interface VoiceAdapter {
  supported(): boolean;
  listen(): Promise<string>;
  stop(): void;
  speak(text: string): void;
  silence(): void;
}
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start(): void; abort(): void;
};
function constructor() {
  const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition;
}
export function browserVoice(): VoiceAdapter {
  let cancel: (() => void) | undefined;
  return {
    supported: () => !!constructor(),
    listen: () => new Promise((resolve, reject) => {
      cancel?.();
      const Constructor = constructor();
      if (!Constructor) { reject(new Error('Voice recognition is unavailable in this browser. Use a supported browser or the iPhone app.')); return; }
      const recognition = new Constructor();
      let finished = false;
      const finish = (text?: string, error?: string) => {
        if (finished) return;
        finished = true; clearTimeout(timer); cancel = undefined;
        recognition.onresult = null; recognition.onerror = null; recognition.onend = null;
        recognition.abort();
        if (text?.trim()) resolve(text.trim()); else reject(new Error(error || 'No speech heard. Please try again.'));
      };
      const timer = setTimeout(() => finish(undefined, 'Listening timed out. Please try again.'), 20000);
      cancel = () => finish(undefined, 'Listening stopped.');
      recognition.lang = 'en-CA'; recognition.continuous = false; recognition.interimResults = false;
      recognition.onresult = event => finish(event.results[0]?.[0]?.transcript);
      recognition.onerror = () => finish(undefined, 'Speech recognition failed. Check microphone permission and your connection.');
      recognition.onend = () => finish();
      try { recognition.start(); } catch { finish(undefined, 'Microphone unavailable. Check your microphone permission.'); }
    }),
    stop: () => cancel?.(),
    speak: text => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-CA';
      window.speechSynthesis.speak(utterance);
    },
    silence: () => window.speechSynthesis?.cancel(),
  };
}
export function voiceCommand(text: string, screens: readonly string[]) {
  const normalized = text.toLowerCase().trim().replace(/[.!?]+$/, '');
  if (['confirm', 'confirm action', 'approve'].includes(normalized)) return { kind: 'confirm' } as const;
  if (['cancel', 'cancel action', 'reject'].includes(normalized)) return { kind: 'cancel' } as const;
  const target = normalized.replace(/^(?:open|show|go to|take me to) (?:the |my )?/, '');
  const aliases: Record<string, string> = { home: 'Overview', today: 'Overview', tasks: 'Responsibilities', 'activity log': 'Timeline', 'trusted facts': 'Memory', 'care hand over': 'Handover', 'settings': 'Integrations' };
  const screen = screens.find(name => name.toLowerCase() === (aliases[target] || target).toLowerCase());
  return screen ? { kind: 'navigate', screen } as const : { kind: 'request' } as const;
}

export function careVoiceRequest(text: string, screen: string) {
  if (/^(read|summarize|explain)( this)? (screen|page)[.!?]?$/i.test(text.trim())) {
    return `Give me a summary of ${screen === 'Overview' ? 'what needs attention today' : screen}.`;
  }
  const numbers: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12' };
  return text.replace(/\b(add|create|set)(?: a| an)? (reminder|task|responsibility)\b/i, 'create responsibility')
    .replace(/\bat (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, (_, word: string) => `at ${numbers[word.toLowerCase()]}`)
    .replace(/\ba\.m\./gi, 'am').replace(/\bp\.m\./gi, 'pm');
}
export function needsVoiceTime(text: string) {
  return /\bcreate responsibility\b/i.test(text) && !(/\b(?:today|tomorrow|20\d{2}-\d{2}-\d{2})\b/i.test(text) && /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(text));
}

export function needsVoiceTitle(text: string) {
  const match = text.match(/\bcreate responsibility(?: to\b)?\s*(.*)/i);
  return !!match && !match[1].replace(/\b(?:due |for )?(?:today|tomorrow|20\d{2}-\d{2}-\d{2})\b.*$/i, '').trim();
}
