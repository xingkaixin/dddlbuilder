import { defineConfig } from '@playwright/test';
import { sharedPlaywrightConfig } from './playwright.shared';

export default defineConfig(sharedPlaywrightConfig, {
  testMatch: 'runtime-bindings.spec.ts',
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: process.env.CI ? 'pnpm run e2e:serve:built' : 'pnpm run e2e:serve',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
