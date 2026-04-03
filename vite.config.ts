import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import devServer from '@hono/vite-dev-server';
import path from 'node:path';

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
        // VitePress base is /docs/, normalize /docs -> /docs/
        rewrite: (path) => (path === '/docs' ? '/docs/' : path),
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
    outDir: 'dist/client',
    chunkSizeWarningLimit: 1500,
    emptyOutDir: false, // 保留服务端构建结果
    rollupOptions: {},
  },
});
