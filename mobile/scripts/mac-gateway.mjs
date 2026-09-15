import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { apiOrigin } from '../src/config.mjs';

export function createMacGateway({ publicOrigin, backendOrigin }) {
  const publicURL = new URL(apiOrigin(publicOrigin));
  const backend = new URL(apiOrigin(backendOrigin, { allowLocal: true }));
  if (!['localhost', '127.0.0.1', '[::1]'].includes(backend.hostname)) throw new Error('The Mac gateway upstream must be a loopback address.');
  return http.createServer((incoming, outgoing) => {
    const path = incoming.url || '/';
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
      outgoing.writeHead(400).end('Invalid path'); return;
    }
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(incoming.method || 'GET');
    if (mutation && (incoming.headers.origin !== publicURL.origin || incoming.headers['sec-fetch-site'] === 'cross-site')) {
      outgoing.writeHead(403, { 'Content-Type': 'application/json' }).end('{"error":"Open Carestead at the configured tunnel address."}'); return;
    }
    const headers = { ...incoming.headers, host: backend.host };
    if (incoming.headers.origin === publicURL.origin) headers.origin = backend.origin;
    // The local runtime must see one consistent origin, including on mutation checks.
    delete headers['x-forwarded-host']; delete headers['x-forwarded-proto']; delete headers.forwarded;
    const upstream = (backend.protocol === 'https:' ? https : http).request(new URL(path, backend), { method: incoming.method, headers, timeout: 40000 }, (response) => {
      const responseHeaders = { ...response.headers, 'cache-control': 'no-store' };
      if (responseHeaders['set-cookie']) responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map((cookie) => {
        const hostOnly = cookie.replace(/;\s*Domain=[^;]*/ig, '');
        return /;\s*Secure(?:;|$)/i.test(hostOnly) ? hostOnly : `${hostOnly}; Secure`;
      });
      if (responseHeaders.location) {
        const location = new URL(responseHeaders.location, backend);
        if (location.origin === backend.origin) responseHeaders.location = new URL(location.pathname + location.search + location.hash, publicURL).href;
      }
      outgoing.writeHead(response.statusCode || 502, responseHeaders);
      response.pipe(outgoing);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
    upstream.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502, { 'Content-Type': 'application/json' }).end('{"error":"The Mac backend is unavailable. Check that it is running."}');
      else outgoing.destroy();
    });
    incoming.on('aborted', () => upstream.destroy());
    incoming.pipe(upstream);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = fileURLToPath(new URL('..', import.meta.url));
  const env = { ...loadEnv('production', directory, ''), ...process.env };
  const server = createMacGateway({ publicOrigin: env.VITE_CARESTEAD_API_ORIGIN, backendOrigin: env.CARESTEAD_MAC_BACKEND_ORIGIN || 'http://127.0.0.1:8080' });
  const port = Number(env.CARESTEAD_MAC_GATEWAY_PORT || 8081);
  server.listen(port, '127.0.0.1', () => console.log(`Mobile gateway: http://127.0.0.1:${port} → Mac backend. Point your HTTPS tunnel at this gateway.`));
}
