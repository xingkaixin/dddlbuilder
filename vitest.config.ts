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
        },
      },
    ],
  },
});
