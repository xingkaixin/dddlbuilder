/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    globals: true,
    environment: 'node',
    exclude: [
      'node_modules/**',
      '**/node_modules/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: [
        'api/**/*.{ts,tsx}',
        'server-api/**/*.{ts,tsx}',
      ],
      exclude: [
        'api/**/*.{test,spec}.{ts,tsx}',
        'server-api/**/*.{test,spec}.{ts,tsx}',
        'api/__tests__/**/*',
        'server-api/__tests__/**/*',
        // Exclude AI upstream orchestration internals and prompt templates.
        'server-api/openaiControl.ts',
        'server-api/prompts/**/*',
        'server-api/routes/explain.ts',
        'server-api/routes/generateTable.ts',
        'server-api/routes/review.ts',
        'server-api/lib/workspaceSnapshots.ts',
        'server-api/lib/workspaceMigration.ts',
        'server-api/lib/aiStreamDebug.ts',
        'server-api/routes/workspaceMigration.ts',
        'server-api/routes/workspaceSnapshot.ts',
        '../../packages/db/schema/auth.ts',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
