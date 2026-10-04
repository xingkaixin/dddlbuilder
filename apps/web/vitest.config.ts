/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const nodeTests = [
  'components/App/aiSchemaPatchTransition',
  'components/App/dialogLayerModel',
  'components/App/er-diagram/tableRelationship',
  'components/App/saved-tables/dnd',
  'components/ImportSqlDialog/importDialogState',
  'features/field-processing',
  'hooks/workspacePersistence/hydration',
  'hooks/workspacePersistence/normalize',
  'i18n/localeParity',
  'services/savedTableSnapshot',
  'services/schemaStateMerge',
  'services/streamingText',
  'stores/editorDocumentMutations',
  'stores/editorDocumentValidation',
  'stores/indexDefinitionMutations',
  'utils/aiSchemaChanges',
  'utils/convertParsedResultToPersistedState',
  'utils/ddlReview',
  'utils/excelArchiveGuard',
  'utils/fieldRenameUtils',
  'utils/fieldTypeRisk',
  'utils/foreignKeyImport',
  'utils/importedFieldIdentity',
  'utils/mockDataConstraints',
  'utils/normalizeAiEnumValue',
  'utils/parsePartialJson',
  'utils/parsePartialTableSchema',
  'utils/persistedStateSignature',
  'utils/schemaLint',
  'utils/structuredImportParser',
  'utils/tabUtils',
  'webmcp/schemaPatch',
].map((file) => `src/__tests__/${file}.test.ts`);

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: { name: 'web-node', environment: 'node', include: nodeTests },
      },
      {
        extends: true,
        test: {
          name: 'web-dom',
          environment: 'jsdom',
          exclude: nodeTests,
          setupFiles: ['./src/__tests__/setup.ts'],
        },
      },
    ],
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
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/__tests__/**/*',
        'src/i18n/locales/en-US/common.ts',
        'src/i18n/locales/ja-JP/common.ts',
        'src/i18n/locales/zh-CN/common.ts',
        'src/components/App/er-diagram/types.ts',
        'src/components/ImportSqlDialog/types.ts',
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
