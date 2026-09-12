import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, type Plugin } from 'vite';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;
const cloudDeployment = process.env.CARESTEAD_CLOUD === '1';

// The Cloudflare plugin emits local preview bindings next to its build output.
// Cloud releases use remote Worker secrets and must not package that local file.
const excludeLocalSecrets: Plugin = {
  name: 'carestead-exclude-local-secrets',
  enforce: 'post',
  generateBundle: {
    order: 'post',
    handler(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (/(^|\/)\.dev\.vars(?:\.|$)/.test(name)) delete bundle[name];
      }
    },
  },
};

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: { watch: { ...(isCodexSeatbeltSandbox ? { useFsEvents: false, usePolling: true } : {}), ignored: ['**/.playwright-runs/**', '**/test-results/**', '**/playwright-report/**'] } },
    plugins: [
      vinext(),
      ...(cloudDeployment ? [] : [sites()]),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        ...(cloudDeployment
          ? { configPath: './wrangler.deploy.json' }
          : { config: localBindingConfig }),
        persistState: process.env.CARESTEAD_TEST === '1' ? false : undefined,
        inspectorPort: isCodexSeatbeltSandbox || process.env.CARESTEAD_TEST === '1' ? false : undefined,
      }),
      ...(cloudDeployment ? [excludeLocalSecrets] : []),
    ],
  };
});
