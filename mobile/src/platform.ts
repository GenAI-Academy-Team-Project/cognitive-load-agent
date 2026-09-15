import { Capacitor, registerPlugin } from '@capacitor/core';
import { createMobileFetch } from './transport.mjs';
import { apiOrigin } from './config.mjs';

interface NativeAPI {
  request(options: { path: string; method: string; body?: string }): Promise<{ status: number; data: string }>;
  openWeb(options: { path: string }): Promise<void>;
}
const bridge = registerPlugin<NativeAPI>('CaresteadAPI');
export const native = Capacitor.isNativePlatform();
export const macBackend = import.meta.env.VITE_CARESTEAD_LOCAL_BACKEND === '1';
const origin = apiOrigin(import.meta.env.VITE_CARESTEAD_API_ORIGIN, { allowLocal: import.meta.env.DEV });

export async function openWeb(path = '/') {
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error('Only your Carestead site can be opened here.');
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
