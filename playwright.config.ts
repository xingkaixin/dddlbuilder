import { defineConfig } from '@playwright/test';
import { sharedPlaywrightConfig } from './playwright.shared';

export default defineConfig(sharedPlaywrightConfig, {
  fullyParallel: false,
  testIgnore: 'runtime-bindings.spec.ts',
  webServer: {
    command: process.env.CI
      ? 'pnpm --dir apps/web exec vite preview --config vite.e2e.config.ts --host 127.0.0.1 --port 3000 --strictPort'
      : 'pnpm --dir apps/web exec vite --config vite.e2e.config.ts --host 127.0.0.1 --port 3000 --strictPort',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
  },
});
