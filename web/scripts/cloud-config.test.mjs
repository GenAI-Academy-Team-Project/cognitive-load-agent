import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('loads saved settings, honors CI overrides, and blocks placeholder publication', () => {
  const dir = mkdtempSync(join(tmpdir(), 'carestead-cloud-'));
  try {
    mkdirSync(join(dir, 'scripts'));
    copyFileSync(new URL('./cloud-config.mjs', import.meta.url), join(dir, 'scripts/cloud-config.mjs'));
    copyFileSync(new URL('../wrangler.example.json', import.meta.url), join(dir, 'wrangler.example.json'));
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('CLOUDFLARE_')) delete env[key];
    const run = (extra = {}, args = []) => spawnSync(process.execPath, ['scripts/cloud-config.mjs', ...args], { cwd: dir, env: { ...env, ...extra }, encoding: 'utf8' });
    assert.notEqual(run().status, 0);
    assert.equal(existsSync(join(dir, 'wrangler.deploy.json')), false);
    const id = '12345678-1234-4234-8234-123456789abc';
    writeFileSync(join(dir, '.env.cloudflare'), `CLOUDFLARE_D1_DATABASE_ID=${id}\nCLOUDFLARE_WORKER_NAME=saved-worker\nCLOUDFLARE_ACCOUNT_ID=${'a'.repeat(32)}\n`);
    assert.equal(run({}, ['--production']).status, 0);
    const config = () => JSON.parse(readFileSync(join(dir, 'wrangler.deploy.json'), 'utf8'));
    assert.equal(config().d1_databases[0].database_id, id);
    assert.equal(config().name, 'saved-worker');
    assert.equal(config().account_id, 'a'.repeat(32));
    assert.equal(run({ CLOUDFLARE_WORKER_NAME: 'ci-worker' }).status, 0);
    assert.equal(config().name, 'ci-worker');
    const placeholder = { CLOUDFLARE_D1_DATABASE_ID: '11111111-1111-4111-8111-111111111111' };
    assert.equal(run(placeholder).status, 0);
    assert.notEqual(run(placeholder, ['--production']).status, 0);
    assert.notEqual(run({ CLOUDFLARE_D1_DATABASE_ID: 'invalid' }).status, 0);
    assert.notEqual(run({ CLOUDFLARE_D1_DATABASE_ID: '00000000-0000-4000-8000-000000000000' }).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
