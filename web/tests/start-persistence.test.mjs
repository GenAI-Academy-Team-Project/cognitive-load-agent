// Run after npm run build: node --test tests/start-persistence.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, copyFile, cp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

for (const command of ['start', 'dev']) test(`${command} preserves sign-in across restarts and replacement of build output`, { timeout: 120_000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const dir = await mkdtemp(join(tmpdir(), 'carestead-persistence-'));
  const port = 43287;
  const origin = `http://127.0.0.1:${port}`;
  let server;
  let logs = '';
  const stop = async () => {
    if (!server || server.exitCode !== null) return;
    const exited = once(server, 'exit');
    process.kill(-server.pid, 'SIGTERM');
    await exited;
  };
  const start = async () => {
    const args = command === 'start' ? ['--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0'] : ['--hostname', '127.0.0.1', '--port', String(port)];
    server = spawn('npm', ['run', command, '--', ...args], {
      cwd: dir, detached: true,
      env: { ...process.env, PATH: `${join(root, 'node_modules/.bin')}:${process.env.PATH}`, CARESTEAD_TEST: '1', CARESTEAD_PERSISTENCE_TEST: '1', CARESTEAD_CLOUD: '0', WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', chunk => { logs += chunk; });
    server.stderr.on('data', chunk => { logs += chunk; });
    for (let i = 0; i < 120; i++) {
      assert.equal(server.exitCode, null, logs);
      try { if ((await fetch(`${origin}/api/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.fail(`Server did not start: ${logs}`);
  };
  const credentials = { email: 'restart@example.test', password: 'Restart test password 2026!', confirmPassword: 'Restart test password 2026!', displayName: 'Restart test' };
  const auth = action => fetch(`${origin}/api/auth/${action}`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(credentials),
  });
  try {
    if (command === 'dev') {
      await cp(root, dir, { recursive: true, filter: source => !source.slice(root.length).split('/').some(part => ['node_modules', 'dist', '.next', '.vinext', '.wrangler', '.certs', '.playwright-runs', 'test-results', 'playwright-report'].includes(part) || part.startsWith('.secrets') || part.startsWith('.env') || part.startsWith('.dev.vars')) });
      await symlink(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    }
    await copyFile(join(root, 'package.json'), join(dir, 'package.json'));
    await mkdir(join(dir, 'scripts'), { recursive: true });
    await copyFile(join(root, 'scripts/local-server.mjs'), join(dir, 'scripts/local-server.mjs'));
    if (command === 'start') await symlink(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    await mkdir(join(dir, 'dist'), { recursive: true });
    const copyBuild = () => cp(join(root, 'dist'), join(dir, 'dist'), { recursive: true, filter: source => !source.split('/').some(part => part === '.wrangler' || part.startsWith('.dev.vars')) });
    await copyBuild();
    await start();
    assert.equal((await auth('sign-up')).status, 201);
    await stop();
    await rm(join(dir, 'dist'), { recursive: true });
    await copyBuild();
    await start();
    assert.equal((await auth('sign-in')).status, 200);
    credentials.password = 'Wrong password 2026!';
    assert.equal((await auth('sign-in')).status, 401);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
