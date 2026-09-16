import { test, expect } from '@playwright/test';
import { voiceSession } from '../../web/lib/voice-session';
import type { VoiceAdapter } from '../../web/lib/voice';

function adapter() {
  const state = { stops: 0, silenced: 0, resolve: (_: string) => {} };
  const voice: VoiceAdapter = {
    supported: () => true,
    listen: () => new Promise(resolve => { state.resolve = resolve; }),
    stop: () => { state.stops++; }, speak: () => {}, silence: () => { state.silenced++; },
  };
  return { state, voice };
}
test('switching microphone owners discards late results without stopping the new owner', async () => {
  const a = adapter(), b = adapter();
  const first = voiceSession(a.voice), next = voiceSession(b.voice);
  const oldResult = first.listen().catch(error => error.message);
  const newResult = next.listen();
  expect(await oldResult).toBe('Listening stopped.');
  first.stop(); first.silence();
  a.state.resolve('stale transcript');
  expect(b.state.stops).toBe(0);
  b.state.resolve('current transcript');
  expect(await newResult).toBe('current transcript');
  expect(a.state.stops).toBe(1);
});
test('only the speaker owner can silence playback; recording interrupts playback', async () => {
  const a = adapter(), b = adapter();
  const first = voiceSession(a.voice), next = voiceSession(b.voice);
  first.speak('reply'); next.silence();
  expect(a.state.silenced).toBe(0);
  const result = next.listen();
  expect(a.state.silenced).toBe(1);
  b.state.resolve('new question'); await result;
  next.speak('new reply'); first.silence();
  expect(b.state.silenced).toBe(0);
  next.silence();
});
