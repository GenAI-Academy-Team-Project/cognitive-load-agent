import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { calendarSecrets, calendarSecretNames } from './calendar-config.mjs';

const groups = [['INTEGRATION_CONFIG_KEY'], ['AUTH_PUBLIC_URL'], calendarSecretNames, ['RESEND_API_KEY', 'NOTIFICATION_EMAIL_FROM'], ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'], ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'], ['NTFY_SERVER_URL'], ['NTFY_ACCESS_TOKEN']];
export const runtimeSecretNames = groups.flat();

export function cloudSecrets(source) {
  const values = {};
  if (source.AUTH_PUBLIC_URL) {
    let url;
    try { url = new URL(source.AUTH_PUBLIC_URL); } catch { throw new Error('AUTH_PUBLIC_URL must be an HTTPS origin.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('AUTH_PUBLIC_URL must be an HTTPS origin without credentials or a path.');
  }
  for (const group of groups) {
    if (!group.some((name) => source[name] !== undefined && source[name] !== '')) continue;
    for (const name of group) {
      const value = source[name];
      if (typeof value !== 'string' || !value.trim()) throw new Error(`Set ${name}: configure all values in an integration group or leave the entire group blank.`);
      if (value !== value.trim() || /[\r\n]/.test(value)) throw new Error(`${name} must not contain surrounding whitespace or newlines.`);
      values[name] = value;
    }
  }
  if (values.INTEGRATION_CONFIG_KEY && !/^[a-f0-9]{64}$/i.test(values.INTEGRATION_CONFIG_KEY)) throw new Error('INTEGRATION_CONFIG_KEY must contain 64 hexadecimal characters.');
  if (values.NTFY_SERVER_URL) {
    let url;
    try { url = new URL(values.NTFY_SERVER_URL); } catch { throw new Error('NTFY_SERVER_URL must be an HTTPS server origin.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('NTFY_SERVER_URL must be an HTTPS server origin.');
  }
  if (values.NTFY_ACCESS_TOKEN && !values.NTFY_SERVER_URL) throw new Error('Set NTFY_SERVER_URL with NTFY_ACCESS_TOKEN.');
  if (values.GOOGLE_CLIENT_ID) calendarSecrets(values);
  if (values.TWILIO_ACCOUNT_SID && !/^AC[0-9a-f]{32}$/i.test(values.TWILIO_ACCOUNT_SID)) throw new Error('TWILIO_ACCOUNT_SID must be an AC-prefixed account SID.');
  if (values.TWILIO_FROM_NUMBER && !/^\+[1-9]\d{7,14}$/.test(values.TWILIO_FROM_NUMBER)) throw new Error('TWILIO_FROM_NUMBER must use E.164 format.');
  if (values.VAPID_SUBJECT && !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(values.VAPID_SUBJECT)) throw new Error('VAPID_SUBJECT must be an operator mailto: or HTTPS contact URI.');
  for (const [name, size] of [['VAPID_PUBLIC_KEY', 65], ['VAPID_PRIVATE_KEY', 32]]) {
    if (values[name] && (!/^[A-Za-z0-9_-]+$/.test(values[name]) || Buffer.from(values[name], 'base64url').length !== size)) throw new Error(`${name} must be a valid base64url VAPID key.`);
  }
  if (!Object.keys(values).length) throw new Error('No cloud runtime secrets configured. Fill web/.secrets.cloudflare or supply integration values through CI.');
  return values;
}

export function loadCloudSecrets(file, environment = process.env) {
  const saved = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  if (Object.keys(saved).some((name) => !runtimeSecretNames.includes(name))) throw new Error('Cloud secrets file contains an unknown setting. Use only the runtime bindings in .secrets.cloudflare.example.');
  // Never load .dev.vars, .env files, or arbitrary settings into the upload.
  return cloudSecrets({ ...saved, ...environment });
}

export function uploadCloudSecrets(values, config, run = spawnSync) {
  const worker = JSON.parse(readFileSync(config, 'utf8'));
  if (!worker.name || !worker.d1_databases?.some((db) => db.binding === 'DB' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(db.database_id) && !['00000000-0000-4000-8000-000000000000', '11111111-1111-4111-8111-111111111111'].includes(db.database_id))) throw new Error('Generate a production Worker configuration with make cloud-config before uploading secrets.');
  const selected = cloudSecrets(values);
  const childEnv = { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' };
  for (const name of runtimeSecretNames) delete childEnv[name];
  const child = run(process.execPath, [fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)), 'secret', 'bulk', '--config', fileURLToPath(config)], {
    input: JSON.stringify(selected), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: childEnv,
  });
  if (child.error || child.status !== 0) throw new Error('Cloud secret upload failed. Check Cloudflare authentication and the deployed Worker. Verify remote settings before retrying.');
  console.log('Configured cloud runtime secrets uploaded; omitted values were left unchanged.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const mode = process.argv[2];
    if (!['--check', '--apply'].includes(mode) || process.argv.length !== 3) throw new Error('Usage: node scripts/cloud-secrets.mjs --check|--apply');
    const values = loadCloudSecrets(new URL('../.secrets.cloudflare', import.meta.url));
    if (mode === '--check') console.log('Configured cloud integration groups are valid. Values were not printed or uploaded.');
    else uploadCloudSecrets(values, new URL('../wrangler.deploy.json', import.meta.url));
  } catch (error) {
    console.error(error instanceof Error && error.code === undefined ? error.message : 'Cloud secret configuration could not be loaded. Check the local file and generated Worker configuration.');
    process.exitCode = 1;
  }
}
