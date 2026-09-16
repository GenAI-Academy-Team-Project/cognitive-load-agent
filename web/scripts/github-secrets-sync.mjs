#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const secretsFile = resolve(scriptDir, '../.secrets.cloudflare');
const environment = 'production';

function parseSecrets(content) {
  const secrets = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=');

    // Only include non-empty values
    if (key && value && value.trim()) {
      secrets[key.trim()] = value.trim();
    }
  }

  return secrets;
}

function checkGhCli() {
  const result = spawnSync('gh', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error('GitHub CLI (gh) is not installed. Install from https://cli.github.com/');
  }
}

function getRepoInfo() {
  const result = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error('Not in a GitHub repository or gh CLI not authenticated. Run: gh auth login');
  }
  const output = JSON.parse(result.stdout);
  return output.nameWithOwner;
}

function createSecret(name, value) {
  const result = spawnSync('gh', ['secret', 'set', name, '--env', environment, '-b', value], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) {
    throw new Error(`Failed to create secret ${name}: ${result.stderr || result.error?.message}`);
  }

  return true;
}

function listSecrets() {
  const result = spawnSync('gh', ['secret', 'list', '--env', environment, '--json', 'name'], {
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    throw new Error('Failed to list secrets');
  }

  const output = JSON.parse(result.stdout);
  return output.map(s => s.name);
}

async function main() {
  try {
    console.log('🔐 GitHub Secrets Sync');
    console.log('=====================\n');

    // Check prerequisites
    console.log('Checking prerequisites...');
    checkGhCli();
    const repo = getRepoInfo();
    console.log(`✓ Authenticated to ${repo}\n`);

    // Read local secrets
    console.log('Reading local secrets...');
    const content = readFileSync(secretsFile, 'utf8');
    const localSecrets = parseSecrets(content);
    const secretNames = Object.keys(localSecrets);

    if (!secretNames.length) {
      console.log('⚠️  No secrets found in .secrets.cloudflare');
      process.exitCode = 1;
      return;
    }

    console.log(`✓ Found ${secretNames.length} secrets\n`);

    // List existing secrets
    console.log('Checking existing GitHub secrets...');
    const existingSecrets = await new Promise((resolve) => {
      try {
        resolve(listSecrets());
      } catch {
        resolve([]);
      }
    });

    const newSecrets = secretNames.filter(s => !existingSecrets.includes(s));
    const existingCount = secretNames.filter(s => existingSecrets.includes(s)).length;

    console.log(`✓ ${existingCount} secrets already exist`);
    console.log(`✓ ${newSecrets.length} new secrets to create\n`);

    if (!newSecrets.length) {
      console.log('All secrets are already synced! ✓\n');
      return;
    }

    // Confirm before proceeding
    console.log('Secrets to be created:');
    newSecrets.forEach(name => console.log(`  • ${name}`));
    console.log('\n⚠️  This will create secrets in the "production" environment.\n');

    // Sync secrets
    console.log('Syncing secrets to GitHub...\n');
    let created = 0;
    let failed = 0;

    for (const name of newSecrets) {
      try {
        createSecret(name, localSecrets[name]);
        console.log(`✓ ${name}`);
        created++;
      } catch (error) {
        console.error(`✗ ${name}: ${error.message}`);
        failed++;
      }
    }

    // Summary
    console.log(`\n✓ Synced ${created} secret${created === 1 ? '' : 's'}`);
    if (failed) {
      console.error(`✗ Failed: ${failed}`);
      process.exitCode = 1;
    } else {
      console.log('\n🎉 All secrets synced successfully!');
    }
  } catch (error) {
    console.error(`\n❌ ${error.message}`);
    process.exitCode = 1;
  }
}

main();
