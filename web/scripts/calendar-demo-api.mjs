import { setTimeout } from 'node:timers/promises';

// Retry only explicit throttling responses: network failures and other errors
// may have happened after a mutation, so replaying those is unsafe.
export function demoApi(api, { sleep = setTimeout, log = console.log, now = Date.now } = {}) {
  async function send(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      const response = await api[method](path, ...(method === 'post' ? [{ data: body }] : []));
      if (response.status() === 429 && attempt < 2) {
        const retryAfter = response.headers()['retry-after'];
        const seconds = retryAfter?.trim() ? Number(retryAfter) : NaN;
        const headerDelay = Number.isFinite(seconds) && seconds >= 0
          ? seconds * 1000
          : Date.parse(retryAfter) - now();
        // The app currently omits Retry-After. Recipient deletion has a one-hour
        // window; other actions used by these scripts have one-minute windows.
        const delay = Number.isFinite(headerDelay) && headerDelay >= 0
          ? headerDelay + 1000
          : body?.action === 'delete_recipient' ? 3601000 : 61000;
        log(`Rate limited: ${body?.action || path}. Waiting ${Math.ceil(delay / 1000)} seconds before retry ${attempt + 1}/2. Keep this script running; demo progress is preserved.`);
        await response.dispose();
        await sleep(delay);
        continue;
      }
      try {
        const value = await response.json();
        if (!response.ok()) throw new Error(`${response.status()}: ${value.error || 'Request failed'} (${body?.action || path})`);
        return value;
      } finally { await response.dispose(); }
    }
  }
  return {
    get: path => send('get', path),
    post: (path, body) => send('post', path, body),
  };
}
