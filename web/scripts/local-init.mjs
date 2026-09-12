import { copyFileSync, constants } from 'node:fs';

try {
  copyFileSync(new URL('../.dev.vars.example', import.meta.url), new URL('../.dev.vars', import.meta.url), constants.COPYFILE_EXCL);
  console.log('Created web/.dev.vars. Fill in optional local integration settings as needed.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Kept existing web/.dev.vars.');
}
