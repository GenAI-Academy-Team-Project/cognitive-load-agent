import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('local setup creates the template once and preserves existing settings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'carestead-local-'));
  try {
    mkdirSync(join(dir, 'scripts'));
    copyFileSync(new URL('./local-init.mjs', import.meta.url), join(dir, 'scripts/local-init.mjs'));
    writeFileSync(join(dir, '.dev.vars.example'), 'MEM0_API_KEY=\n');
    const run = () => spawnSync(process.execPath, ['scripts/local-init.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(run().status, 0);
    assert.equal(readFileSync(join(dir, '.dev.vars'), 'utf8'), 'MEM0_API_KEY=\n');
    writeFileSync(join(dir, '.dev.vars'), 'MEM0_API_KEY=keep-existing');
    assert.equal(run().status, 0);
    assert.equal(readFileSync(join(dir, '.dev.vars'), 'utf8'), 'MEM0_API_KEY=keep-existing');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
