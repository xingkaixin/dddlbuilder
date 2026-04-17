/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'apps/web',
      'apps/worker',
      'packages/ddl-core',
      {
        test: {
          name: 'scripts',
          globals: true,
          environment: 'node',
          include: ['scripts/**/*.test.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text'],
            include: ['scripts/**/*.{ts,tsx}'],
            exclude: [
              'scripts/**/*.{test,spec}.{ts,tsx}',
              'scripts/d1-inspect.ts',
              'scripts/d1-migrate.ts',
              'scripts/d1-reset.ts',
              'scripts/d1-seed.ts',
              'scripts/deploy.ts',
              'scripts/dev-worker.ts',
              'scripts/dev.ts',
              'scripts/generate-favicon.ts',
              'scripts/generate-logos.ts',
              'scripts/verify-server-bundle.ts',
            ],
            thresholds: {
              branches: 80,
              functions: 80,
              lines: 80,
              statements: 80,
            },
          },
        },
      },
    ],
  },
});
