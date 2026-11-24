import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

function getNodeModulePackageName(id: string): string | null {
  const marker = 'node_modules/';
  const index = id.lastIndexOf(marker);

  if (index === -1) return null;
  const rest = id.slice(index + marker.length);
  const parts = rest.split('/');

  return parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1] ?? ''}` : (parts[0] ?? null);
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    proxy: {
      '/docs': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: true,
        // The docs site lives under /docs/, normalize /docs -> /docs/
        rewrite: (path) => (path === '/docs' ? '/docs/' : path),
      },
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  plugins: [react()],
  worker: { format: 'es' },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    outDir: 'dist/client',
    assetsDir: 'static',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 16_000,
          groups: [
            {
              name: 'vendor-react',
              test: (id) => {
                const pkg = getNodeModulePackageName(id);

                return pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler';
              },
              priority: 40,
            },
            {
              name: 'vendor-app-core',
              test: (id) => {
                const pkg = getNodeModulePackageName(id);

                return (
                  pkg === '@tanstack/react-query' ||
                  pkg === '@tanstack/query-core' ||
                  pkg === 'zustand' ||
                  pkg === 'next-themes' ||
                  pkg === 'sonner' ||
                  pkg === 'clsx' ||
                  pkg === 'tailwind-merge' ||
                  pkg === 'class-variance-authority'
                );
              },
              priority: 35,
            },
            {
              name: 'vendor-i18n',
              test: (id) => {
                const pkg = getNodeModulePackageName(id);

                return pkg === 'i18next' || pkg === 'react-i18next';
              },
              priority: 35,
            },
            {
              name: 'vendor-effect',
              test: (id) => getNodeModulePackageName(id) === 'effect',
              priority: 35,
            },
            {
              name: 'app-boot-utils',
              test: (id) =>
                id.includes('/apps/web/src/lib/utils.ts') ||
                id.includes('/apps/web/src/services/apiError.ts') ||
                id.includes('/apps/web/src/services/workspaceCacheRegistry.ts') ||
                id.includes('/apps/web/src/services/creditService.ts') ||
                id.includes('/apps/web/src/services/errorReporter.ts') ||
                id.includes('/apps/web/src/stores/appUiStore.ts') ||
                id.includes('/apps/web/src/stores/pathnameStore.ts') ||
                id.includes('/apps/web/src/config/featureFlags.ts') ||
                id.includes('/apps/web/src/utils/indexedDbTransaction.ts') ||
                id.includes('/apps/web/src/utils/localStorage.ts') ||
                id.includes('/apps/web/src/components/ui/button.tsx') ||
                id.includes('/apps/web/src/components/ui/sketch.tsx'),
              priority: 32,
            },
            {
              name: 'vendor-base-ui',
              test: (id) => {
                const pkg = getNodeModulePackageName(id);

                return (
                  pkg === '@base-ui/react' ||
                  pkg === '@base-ui/utils' ||
                  (pkg !== null && pkg.startsWith('@floating-ui/'))
                );
              },
              priority: 25,
            },
            {
              name: 'vendor-yjs',
              test: (id) => getNodeModulePackageName(id) === 'yjs',
              priority: 25,
            },
            {
              name: 'vendor-dnd',
              test: (id) => {
                const pkg = getNodeModulePackageName(id);

                return pkg !== null && pkg.startsWith('@dnd-kit/');
              },
              priority: 25,
            },
            {
              name: 'app-shared-types',
              test: (id) => id.includes('/packages/shared-types/src/'),
              priority: 20,
            },
          ],
        },
      },
    },
  },
});
