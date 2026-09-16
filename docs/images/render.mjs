// Run from any directory after `cd web && npm install`.
import sharp from '../../web/node_modules/sharp/lib/index.js';
import { fileURLToPath } from 'node:url';

for (const name of [
  'carestead-core-features',
  'carestead-agentic-capabilities',
  'carestead-technical-architecture',
  'carestead-evaluation-strategy',
  'carestead-user-journey',
  'carestead-decision-path',
]) {
  const input = fileURLToPath(new URL(`${name}.svg`, import.meta.url));
  const output = fileURLToPath(new URL(`${name}.png`, import.meta.url));
  await sharp(input).png().toFile(output);
  console.log(`Rendered ${name}.png`);
}
