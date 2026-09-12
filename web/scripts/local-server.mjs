import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access } from 'node:fs/promises';
import { createServer as createTcpServer } from 'node:net';

const mode = process.argv[2];
if (!['dev', 'start'].includes(mode)) throw new Error('Expected dev or start.');
const testing = process.env.CARESTEAD_TEST === '1';
const host = process.env.CARESTEAD_CONTAINER === '1' ? '0.0.0.0' : '127.0.0.1';
const extra = process.argv.slice(3);
if (!testing && extra.length) throw new Error('Local preview uses fixed ports 8080 and 8083; run without extra flags.');

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
}

let redirect;
let child;
let tls = false;
function stop(code = 0) {
  redirect?.close();
  redirect?.closeAllConnections();
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  process.exitCode = code;
}

try {
  if (!testing) {
    try {
      await Promise.all(['.certs/carestead.pem', '.certs/carestead-key.pem'].map(path => access(path)));
      tls = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      console.log('Local certificates missing; using HTTP on port 8080.');
    }
    const probe = createTcpServer();
    await listen(probe, tls ? 8083 : 8080);
    await new Promise(resolve => probe.close(resolve));
    if (tls) {
      redirect = createServer((request, response) => {
        response.writeHead(308, { Location: `https://carestead.com:8083${request.url?.startsWith('/') ? request.url : '/'}` });
        response.end();
      });
      await listen(redirect, 8080);
    }
  }

  const args = mode === 'dev'
    ? ['node_modules/vinext/dist/cli.js', 'dev', ...(testing ? extra : ['--hostname', process.env.CARESTEAD_CONTAINER === '1' ? host : 'carestead.com', '--port', tls ? '8083' : '8080'])]
    : ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'dist/server/wrangler.json', '--persist-to', '.wrangler/state',
      ...(testing ? extra : ['--ip', host, '--port', tls ? '8083' : '8080', '--local-protocol', tls ? 'https' : 'http', ...(tls ? ['--https-cert-path', '.certs/carestead.pem', '--https-key-path', '.certs/carestead-key.pem'] : []), '--inspector-port', '0'])];
  child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code ?? 1));
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop());
  if (!testing) console.log(tls ? 'Carestead: https://carestead.com:8083 (HTTP :8080 redirects to HTTPS)' : 'Carestead: http://carestead.com:8080');
} catch (error) {
  console.error(error.code === 'EADDRINUSE'
    ? 'Carestead needs ports 8080 and 8083. Stop the existing preview (make down for Docker), then retry.'
    : error.message);
  stop(1);
}
