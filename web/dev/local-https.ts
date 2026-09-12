import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Plugin } from 'vite';

export function localCertificate(enabled: boolean, certificate: URL, privateKey: URL) {
  if (!enabled || !existsSync(certificate) || !existsSync(privateKey)) return undefined;
  return { cert: readFileSync(certificate), key: readFileSync(privateKey) };
}

export function httpToHttps(): Plugin {
  return {
    name: 'carestead-local-http-redirect',
    apply: 'serve',
    configureServer(vite) {
      const main = vite.httpServer;
      if (!main || !vite.config.server.https) return;
      const redirect = createServer((request, response) => {
        const address = main.address();
        if (!address || typeof address === 'string') {
          response.writeHead(503).end();
          return;
        }
        try {
          const source = new URL(`http://${request.headers.host || ''}`);
          if (!['carestead.com', 'localhost', '127.0.0.1', '[::1]'].includes(source.hostname)) {
            response.writeHead(421).end('Use the configured local Carestead hostname.');
            return;
          }
          const path = new URL(request.url || '/', source);
          // Keep the destination on an approved host, even for absolute request targets.
          const location = `https://${source.hostname}:${address.port}${path.pathname}${path.search}`;
          response.writeHead(307, { Location: location, 'Cache-Control': 'no-store' }).end();
        } catch {
          response.writeHead(400).end('Invalid request URL.');
        }
      });
      redirect.on('error', (error) => {
        vite.config.logger.error(`Carestead HTTP redirect could not start: ${error.message}. Set CARESTEAD_HTTP_PORT to a free port.`);
      });
      main.once('listening', () => {
        const address = main.address();
        if (!address || typeof address === 'string') return;
        const port = Number(process.env.CARESTEAD_HTTP_PORT || address.port + 1);
        if (!Number.isInteger(port) || port < 1 || port > 65535 || port === address.port) {
          vite.config.logger.error('CARESTEAD_HTTP_PORT must be a free port from 1 to 65535, different from the HTTPS port.');
          return;
        }
        redirect.listen(port, address.address, () => {
          vite.config.logger.info(`  Carestead HTTP: http://carestead.com:${port} → https://carestead.com:${address.port}`);
        });
      });
      const close = () => { redirect.close(); redirect.closeAllConnections(); };
      main.once('close', close);
      // Close the companion before Vite restarts, so the next instance can bind its port.
      const originalClose = vite.close.bind(vite);
      vite.close = async () => { close(); await originalClose(); };
    },
  };
}
