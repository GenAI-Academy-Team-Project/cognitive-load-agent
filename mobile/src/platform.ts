import type { VoiceAdapter } from '@/lib/voice';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { createMobileFetch } from './transport.mjs';
import { apiOrigin } from './config.mjs';

interface NativeAPI {
  listen(): Promise<{ text: string }>;
  stopListening(): Promise<void>;
  speak(options: { text: string }): Promise<void>;
  silence(): Promise<void>;
  request(options: { path: string; method: string; body?: string; contentType?: string; bodyEncoding?: string }): Promise<{ status: number; data: string }>;
  shareExport(options: { data: string; filename: string }): Promise<void>;
  openWeb(options: { path: string }): Promise<void>;
}
const bridge = registerPlugin<NativeAPI>('CaresteadAPI');
export const native = Capacitor.isNativePlatform();
export const macBackend = import.meta.env.VITE_CARESTEAD_LOCAL_BACKEND === '1';
export const publicOrigin = apiOrigin(import.meta.env.VITE_CARESTEAD_API_ORIGIN, { allowLocal: import.meta.env.DEV });

export async function openWeb(path = '/') {
  const url = new URL(path, publicOrigin);
  if (url.origin !== publicOrigin) throw new Error('Only your Carestead site can be opened here.');
  if (native) await bridge.openWeb({ path: url.pathname + url.search });
  else window.open(url.href, '_blank', 'noopener,noreferrer');
}

export function installTransport() {
  const browserFetch = window.fetch.bind(window);
  window.fetch = createMobileFetch({
    native,
    request: (options: Parameters<NativeAPI['request']>[0]) => bridge.request(options),
    openCalendar: (recipientId: string) => {
      if (macBackend) throw new Error('Connect Google from Carestead in your Mac browser using the same account, then return here and tap Refresh.');
      return openWeb(`/?view=Calendar&recipientId=${encodeURIComponent(recipientId)}`);
    },
    browserFetch,
    localOrigin: window.location.href,
    onUnauthorized: () => window.location.replace('/sign-in'),
  });
}

export async function shareExport(blob: Blob, filename: string) {
  await bridge.shareExport({ data: await blob.text(), filename });
}

export const nativeVoice: VoiceAdapter | undefined = native ? {
  supported: () => true,
  listen: async () => (await bridge.listen()).text,
  stop: () => { void bridge.stopListening().catch(() => {}); },
  speak: text => { void bridge.speak({ text }).catch(() => {}); },
  silence: () => { void bridge.silence().catch(() => {}); },
} : undefined;
