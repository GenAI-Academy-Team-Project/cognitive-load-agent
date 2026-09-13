import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';

test('local setup creates the template once and preserves existing settings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'carestead-local-'));
  try {
    mkdirSync(join(dir, 'scripts'));
    copyFileSync(new URL('./local-init.mjs', import.meta.url), join(dir, 'scripts/local-init.mjs'));
    writeFileSync(join(dir, '.dev.vars.example'), 'RESEND_API_KEY=\n');
    const run = () => spawnSync(process.execPath, ['scripts/local-init.mjs'], { cwd: dir, encoding: 'utf8' });
    const checkSetup = (expectedResendKey) => {
      const result = run();
      assert.equal(result.status, 0);
      const saved = readFileSync(join(dir, '.dev.vars'), 'utf8');
      const settings = parseEnv(saved);
      assert.equal(settings.RESEND_API_KEY, expectedResendKey);
      assert.match(settings.INTEGRATION_CONFIG_KEY, /^[a-f0-9]{64}$/);
      assert.ok(!`${result.stdout}${result.stderr}`.includes(settings.INTEGRATION_CONFIG_KEY), 'setup must not log the encryption key');

      const repeated = run();
      assert.equal(repeated.status, 0);
      assert.equal(readFileSync(join(dir, '.dev.vars'), 'utf8'), saved);
      assert.ok(!`${repeated.stdout}${repeated.stderr}`.includes(settings.INTEGRATION_CONFIG_KEY), 'reruns must not log the encryption key');
    };
    checkSetup('');
    for (const keySetting of ['', '\nINTEGRATION_CONFIG_KEY=']) {
      writeFileSync(join(dir, '.dev.vars'), `RESEND_API_KEY=keep-existing${keySetting}`);
      checkSetup('keep-existing');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
