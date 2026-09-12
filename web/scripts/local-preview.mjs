import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer, get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { pathToFileURL } from 'node:url';

export function previewConfig(env = process.env, exists = existsSync) {
  const certificate = '/app/.certs/carestead.pem';
  const privateKey = '/app/.certs/carestead-key.pem';
  const https = exists(certificate) && exists(privateKey);
  const host = env.CARESTEAD_PUBLIC_HOST || 'carestead.com';
  const port = Number(env.CARESTEAD_PUBLIC_PORT || 8080);
  if (!['carestead.com', 'localhost', '127.0.0.1', '[::1]'].includes(host)) throw new Error('Choose a local hostname covered by the Carestead certificate.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CARESTEAD_PUBLIC_PORT must be between 1 and 65535.');
  return { certificate, privateKey, https, origin: `${https ? 'https' : 'http'}://${host}:${port}` };
}

export function runtimeSettings(source, origin) {
  // Preserve all other settings; the shared host file remains untouched.
  return source.split(/\r?\n/).filter(line => !/^\s*(AUTH_PUBLIC_URL|AUTH_LOCAL_HTTP_ORIGIN)\s*=/.test(line)).join('\n') + `\nAUTH_PUBLIC_URL=${JSON.stringify(origin)}\nAUTH_LOCAL_HTTP_ORIGIN=${JSON.stringify(origin.startsWith('http://') ? origin : '')}\n`;
}

export function redirectLocation(target, origin) {
  const path = new URL(target || '/', origin);
  return origin + path.pathname + path.search;
}

function health(config) {
  const get = config.https ? httpsGet : httpGet;
  const request = get(`${config.https ? 'https' : 'http'}://127.0.0.1:8080/api/health`, config.https ? { ca: readFileSync(config.certificate) } : {}, response => {
    response.resume();
    process.exitCode = response.statusCode === 200 ? 0 : 1;
  });
  request.setTimeout(4000, () => request.destroy(new Error('Health check timeout')));
  request.on('error', () => { process.exitCode = 1; });
}

function start(config) {
  writeFileSync('/app/dist/server/.dev.vars', runtimeSettings(readFileSync('/app/config/.dev.vars', 'utf8'), config.origin), { mode: 0o600 });
  const args = ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'dist/server/wrangler.json', '--ip', '0.0.0.0', '--port', '8080', '--inspector-port', '0', '--persist-to', '/app/.wrangler/state'];
  if (config.https) args.push('--local-protocol', 'https', '--https-key-path', config.privateKey, '--https-cert-path', config.certificate);
  const worker = spawn(process.execPath, args, { stdio: 'inherit' });
  const redirect = config.https ? createServer((request, response) => {
    try {
      response.writeHead(307, { Location: redirectLocation(request.url, config.origin), 'Cache-Control': 'no-store' }).end();
    } catch { response.writeHead(400).end('Invalid request URL.'); }
  }) : undefined;
  const close = () => { redirect?.close(); redirect?.closeAllConnections(); };
  redirect?.on('error', error => { console.error(`HTTP redirect failed: ${error.message}`); process.exitCode = 1; worker.kill('SIGTERM'); });
  redirect?.listen(8081, '0.0.0.0');
  worker.on('error', error => { console.error(error.message); close(); process.exitCode = 1; });
  worker.on('exit', code => { close(); process.exitCode = process.exitCode || code || 0; });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { close(); worker.kill(signal); });
  console.log(`Carestead local preview: ${config.origin}${config.https ? ' (HTTP redirects enabled on container port 8081)' : ' (no local certificate pair; using HTTP)'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = previewConfig();
  if (process.argv.includes('--health')) health(config);
  else start(config);
}
