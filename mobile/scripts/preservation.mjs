import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const file = process.argv[3] || fileURLToPath(new URL('../.preservation.json', import.meta.url));
const hash = (path) => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
if (process.argv[2] === 'snapshot') {
  const paths = [...new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0'))].filter((path) => path && !path.startsWith('mobile/'));
  writeFileSync(file, JSON.stringify(Object.fromEntries(paths.map((path) => [path, hash(path)])), null, 2));
  console.log(`Saved ${paths.length} existing file hashes to ${file}.`);
} else if (process.argv[2] === 'check') {
  if (!existsSync(file)) throw new Error('Run node scripts/preservation.mjs snapshot before beginning mobile work.');
  const baseline = JSON.parse(readFileSync(file, 'utf8'));
  const changed = Object.entries(baseline).filter(([path, digest]) => !existsSync(resolve(root, path)) || hash(path) !== digest).map(([path]) => path);
  if (changed.length) {
    console.error('Existing files changed since the snapshot (may include concurrent edits):\n' + changed.join('\n'));
    process.exitCode = 1;
  } else console.log(`Verified: all ${Object.keys(baseline).length} existing files are byte-for-byte unchanged.`);
} else throw new Error('Usage: preservation.mjs snapshot|check [manifest path]');
