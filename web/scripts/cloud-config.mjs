import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Exported shell/CI settings take precedence over this ignored local file.
const envFile = new URL('../.env.cloudflare', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(fileURLToPath(envFile));

const id = process.env.CLOUDFLARE_D1_DATABASE_ID;
if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || id === '00000000-0000-4000-8000-000000000000') {
  throw new Error('Set CLOUDFLARE_D1_DATABASE_ID to the UUID of your production D1 database.');
}
const config = JSON.parse(readFileSync(new URL('../wrangler.example.json', import.meta.url), 'utf8'));
if (process.argv.includes('--production') && id === '11111111-1111-4111-8111-111111111111') {
  throw new Error('The dry-run D1 placeholder cannot be used for migration or deployment. Set CLOUDFLARE_D1_DATABASE_ID to your real database UUID.');
}
config.name = process.env.CLOUDFLARE_WORKER_NAME || config.name;
if (process.env.CLOUDFLARE_ACCOUNT_ID) config.account_id = process.env.CLOUDFLARE_ACCOUNT_ID;
config.d1_databases[0].database_id = id;
config.d1_databases[0].database_name = process.env.CLOUDFLARE_D1_DATABASE_NAME || config.d1_databases[0].database_name;
writeFileSync(new URL('../wrangler.deploy.json', import.meta.url), `${JSON.stringify(config, null, 2)}\n`);
console.log('Generated web/wrangler.deploy.json');
