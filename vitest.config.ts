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
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      thresholds: {
        global: {
          branches: 85,
          functions: 95,
          lines: 90,
          statements: 90,
        },
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/components/**/*', // Exclude UI component tests
        'src/__tests__/**/*', // Exclude all test files and helpers
        'src/scripts/**/*', // Exclude utility scripts
        'src/interfaces/**/*', // Exclude TypeScript interfaces
        'src/types/**/*', // Exclude TypeScript type definitions
        'src/**/index.ts', // Exclude barrel exports
        'src/**/types.ts', // Exclude type-only files
        'src/main.tsx',
        'src/App.tsx', // Entry component, not suitable for unit tests
        'src/vite-env.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
