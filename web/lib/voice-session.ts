import type { VoiceAdapter } from './voice';

// Only one surface owns the microphone/speaker. Closing an inactive surface
// must not stop a newer session belonging to another surface.
let microphone: { stop: () => void } | undefined;
let speaker: { silence: () => void } | undefined;
export function voiceSession(adapter: VoiceAdapter): VoiceAdapter {
  let generation = 0;
  let cancel: (() => void) | undefined;
  const session: VoiceAdapter = {
    supported: () => adapter.supported(),
    listen: () => {
      microphone?.stop();
      speaker?.silence();
      microphone = session;
      const version = ++generation;
      return new Promise<string>((resolve, reject) => {
        cancel = () => { adapter.stop(); reject(new Error('Listening stopped.')); };
        function finish(settle: () => void) {
          if (version !== generation) return;
          if (microphone === session) microphone = undefined;
          cancel = undefined;
          settle();
        }
        adapter.listen().then(text => finish(() => resolve(text)), error => finish(() => reject(error)));
      });
    },
    stop: () => {
      if (microphone !== session) return;
      microphone = undefined; generation++;
      cancel?.(); cancel = undefined;
    },
    speak: text => {
      microphone?.stop(); speaker?.silence(); speaker = session;
      adapter.speak(text);
    },
    silence: () => {
      if (speaker !== session) return;
      speaker = undefined; adapter.silence();
    },
  };
  return session;
}
