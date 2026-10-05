import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig(({ mode }) => ({
  publicDir: '../web/dist/client',
  envDir: mode === 'e2e' ? false : '.',
  plugins: [
    cloudflare({
      types: { generate: false },
      inspectorPort: false,
      remoteBindings: false,
      experimental: { headersAndRedirectsDevModeSupport: true },
      persistState: {
        path: path.resolve(
          import.meta.dirname,
          '../..',
          mode === 'e2e'
            ? '.wrangler/state/e2e'
            : (process.env.CF_PERSIST_DIR ??
                process.env.WRANGLER_PERSIST_DIR ??
                '.wrangler/state/dev'),
        ),
      },
    }),
  ],
  server: { host: '127.0.0.1', strictPort: true },
}));
