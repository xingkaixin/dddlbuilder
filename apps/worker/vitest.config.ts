/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
      ],
    },
  },
});
