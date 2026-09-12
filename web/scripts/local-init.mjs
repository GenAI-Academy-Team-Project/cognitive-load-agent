import { copyFileSync, constants, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';

const file = new URL('../.dev.vars', import.meta.url);
try {
  copyFileSync(new URL('../.dev.vars.example', import.meta.url), file, constants.COPYFILE_EXCL);
  console.log('Created web/.dev.vars. Fill in optional local integration settings as needed.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Kept existing web/.dev.vars.');
}
const saved = readFileSync(file, 'utf8');
if (!parseEnv(saved).INTEGRATION_CONFIG_KEY) {
  writeFileSync(file, `${saved.trimEnd()}\n\n# Stable key for encrypted integration overrides.\nINTEGRATION_CONFIG_KEY=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
  console.log('Configured local integration encryption key; value not displayed.');
}
chmodSync(file, 0o600);
