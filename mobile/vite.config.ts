import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { apiOrigin } from './src/config.mjs';

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const origin = apiOrigin(env.VITE_CARESTEAD_API_ORIGIN, { allowLocal: command === 'serve' });
  const devOrigin = apiOrigin(env.CARESTEAD_DEV_API_ORIGIN || origin, { allowLocal: true });
  return {
    publicDir: fileURLToPath(new URL('../web/public', import.meta.url)),
    plugins: [react(), {
      name: 'carestead-client-boundary',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!importer) return;
        if (/^(cloudflare:|node:|drizzle-orm|vinext|next\/server)/.test(source) ||
            /^@\/(db\/|app\/api\/)/.test(source)) {
          throw new Error(`Server-only import in the mobile client: ${source}`);
        }
      },
      generateBundle(_options, bundle) {
        for (const entry of Object.values(bundle)) {
          if (entry.type === 'chunk' && Object.keys(entry.modules).some((id) =>
            /\/web\/(db\/|app\/api\/|lib\/(sessions|auth|guardrails|google-calendar|.*-service)\.)/.test(id))) {
            throw new Error('A server module entered the mobile bundle.');
          }
        }
      },
    }],
    resolve: {
      alias: { '@': fileURLToPath(new URL('../web', import.meta.url)), 'next/link': fileURLToPath(new URL('./src/link.tsx', import.meta.url)) },
      dedupe: ['react', 'react-dom', '@base-ui/react', 'lucide-react', 'class-variance-authority', 'clsx', 'tailwind-merge'],
    },
    css: { postcss: { plugins: [tailwindcss()] } },
    server: {
      port: 5174,
      fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
      proxy: {
        '/api': {
          target: devOrigin, changeOrigin: true, cookieDomainRewrite: '',
          configure(proxy) {
            proxy.on('proxyReq', (request, incoming) => {
              // Local development only: don't turn this into an unauthenticated public proxy.
              // Only same-origin browser mutations receive the upstream Origin.
              if (incoming.headers.origin === `http://${incoming.headers.host}` && incoming.headers['sec-fetch-site'] !== 'cross-site') {
                request.setHeader('Origin', devOrigin);
              }
            });
          },
        },
      },
    },
  };
});
