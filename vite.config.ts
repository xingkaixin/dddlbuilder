import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import devServer from '@hono/vite-dev-server';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/docs': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: true,
      },
    },
  },
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
    rollupOptions: {},
  },
});
