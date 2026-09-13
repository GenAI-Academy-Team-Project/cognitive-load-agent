import { defineConfig } from '@playwright/test';
import integrations from './playwright.integrations.config';

// Reuse the isolated runtime with synthetic bindings and no provider credentials.
export default defineConfig({
  ...integrations,
  projects: integrations.projects!.map(project => project.name === 'setup' ? project : {
    ...project, testMatch: /handover\.spec\.ts/,
  }),
});
