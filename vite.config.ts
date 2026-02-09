import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import devServer from '@hono/vite-dev-server';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    devServer({
      entry: 'api/index.ts',
      // Only intercept /api/* routes, let Vite handle everything else
      exclude: [
        /.*\.ts$/,
        /.*\.tsx$/,
        /.*\.css$/,
        /.*\.js$/,
        /.*\.jsx$/,
        /.*\.json$/,
        /.*\.html$/,
        /.*\.ico$/,
        /.*\.svg$/,
        /.*\.png$/,
        /.*\.woff2?$/,
        /^\/@.*/,
        /^\/node_modules\/.*/,
        /^\/src\/.*/,
        /^\/$/,
        /^(?!\/api).*/,
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          const includesAny = (patterns: string[]) =>
            patterns.some((pattern) => id.includes(pattern));

          if (includesAny(['node-sql-parser'])) return 'vendor-sql-parser';
          if (includesAny(['handsontable', '@handsontable/'])) {
            return 'vendor-handsontable';
          }
          if (
            includesAny([
              'react-markdown',
              'remark-gfm',
              'remark-',
              'rehype-',
              'mdast',
              'micromark',
              'hast-',
              'unist-',
              'unified',
              'vfile',
            ])
          ) {
            return 'vendor-markdown';
          }
          if (
            includesAny([
              'react-syntax-highlighter',
              'highlight.js',
              'lowlight',
              'refractor',
              'prismjs',
            ])
          ) {
            return 'vendor-code-highlight';
          }
          if (includesAny(['@radix-ui/'])) return 'vendor-radix';
          if (includesAny(['@vercel/analytics'])) return 'vendor-analytics';
          if (includesAny(['/react/', '/react-dom/', 'scheduler'])) {
            return 'vendor-react';
          }
          if (
            includesAny([
              'lucide-react',
              'clsx',
              'class-variance-authority',
              'tailwind-merge',
            ])
          ) {
            return 'vendor-utils';
          }

          return 'vendor-misc';
        },
      },
    },
  },
});
