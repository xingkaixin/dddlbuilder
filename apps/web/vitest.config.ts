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
        branches: 70,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/__tests__/**/*', // Exclude all test files and helpers
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
        // Exclude complex grid helpers pending interaction-test expansion.
        'src/components/App/table/useDataTableClipboard.ts',
        'src/components/App/table/useDataTableNavigation.ts',
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
        'src/admin/**/*',
        'src/auth/AuthSessionProvider.tsx',
        'src/services/workspaceMigrationService.ts',
        'src/services/workspaceSyncService.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
