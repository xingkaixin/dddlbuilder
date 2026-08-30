/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    globals: true,
    environment: 'node',
    exclude: ['node_modules/**', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['api/**/*.{ts,tsx}', 'server-api/**/*.{ts,tsx}'],
      exclude: [
        'api/**/*.{test,spec}.{ts,tsx}',
        'server-api/**/*.{test,spec}.{ts,tsx}',
        'api/__tests__/**/*',
        'server-api/__tests__/**/*',
      ],
      thresholds: {
        branches: 79,
        functions: 92,
        lines: 91,
        statements: 89,
      },
    },
  },
});
