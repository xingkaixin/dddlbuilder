import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(import.meta.dirname, 'api/index.ts'),
      formats: ['es'],
      fileName: () => 'server.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    copyPublicDir: false,
    rollupOptions: {
      external: [],
      output: {
        codeSplitting: false,
      },
    },
    target: 'es2022',
  },
});
