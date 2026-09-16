import type { CapacitorConfig } from '@capacitor/cli';
import { loadEnv } from 'vite';
import { apiOrigin } from './src/config.mjs';

const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
const config: CapacitorConfig = {
  appId: 'com.carestead.mobile',
  appName: 'Carestead',
  webDir: 'dist',
  ios: { contentInset: 'never' },
  plugins: { CaresteadAPI: { origin: apiOrigin(env.VITE_CARESTEAD_API_ORIGIN) } },
};
export default config;
