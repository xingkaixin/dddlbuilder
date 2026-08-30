/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    exclude: [
      'node_modules/**',
      '**/node_modules/**',
      'e2e/**',
      'playwright-report/**',
      'test-results/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      thresholds: {
        branches: 60,
        functions: 67,
        lines: 71,
        statements: 70,
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/__tests__/**/*',
        'src/i18n/locales/en-US/common.ts',
        'src/i18n/locales/ja-JP/common.ts',
        'src/i18n/locales/zh-CN/common.ts',
        'src/components/App/er-diagram/types.ts',
        'src/components/ImportSqlDialog/types.ts',
        'src/components/App/table/index.ts',
        'src/hooks/index.ts',
        'src/stores/index.ts',
        'src/utils/constants/index.ts',
        'src/utils/constants.ts',
        'src/main.tsx',
        'src/App.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
