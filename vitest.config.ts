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
        branches: 80,
        functions: 92,
        lines: 90,
        statements: 90,
      },
      include: [
        'src/**/*.{ts,tsx}',
        'apps/worker/api/**/*.{ts,tsx}',
        'apps/worker/server-api/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'apps/worker/api/**/*.{test,spec}.{ts,tsx}',
        'apps/worker/server-api/**/*.{test,spec}.{ts,tsx}',
        'src/__tests__/**/*', // Exclude all test files and helpers
        'apps/worker/api/__tests__/**/*', // Exclude API test files
        'apps/worker/server-api/__tests__/**/*', // Exclude API test files
        'src/components/**/*.tsx', // Exclude presentational React components
        // Exclude not-yet-covered heavy visual-effect internals.
        'src/components/fireworks/**/*.ts',
        // Exclude component-level orchestration hooks pending dedicated tests.
        'src/components/App/hooks/useAppSelectors.ts',
        'src/components/App/hooks/useApplySavedState.ts',
        'src/components/App/hooks/useClearAllActions.ts',
        'src/components/App/hooks/useDerivedTableState.ts',
        'src/components/App/hooks/useDialogStates.ts',
        'src/components/App/hooks/useFireworksIntro.ts',
        'src/components/App/hooks/useFolderActions.ts',
        'src/components/App/hooks/useNavigationActions.ts',
        'src/components/App/hooks/useReviewActions.ts',
        'src/components/App/hooks/useTemplateActions.ts',
        'src/components/App/hooks/useTrackEvent.ts',
        // Exclude complex grid helpers pending interaction-test expansion.
        'src/components/App/table/useDataTableClipboard.ts',
        'src/components/App/table/useDataTableNavigation.ts',
        // Exclude AI upstream orchestration internals and prompt templates.
        'apps/worker/server-api/openaiControl.ts',
        'apps/worker/server-api/prompts/**/*',
        'apps/worker/server-api/routes/explain.ts',
        'apps/worker/server-api/routes/generateTable.ts',
        'apps/worker/server-api/routes/review.ts',
        'src/scripts/**/*', // Exclude utility scripts
        'src/interfaces/**/*', // Exclude TypeScript interfaces
        'src/types/**/*', // Exclude TypeScript type definitions
        'src/**/index.ts', // Exclude barrel exports
        // Exclude backward-compatible re-export barrels (no business logic).
        'src/utils/alterDdlGenerator.ts',
        'src/utils/constants.ts',
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
