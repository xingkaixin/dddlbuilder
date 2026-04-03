import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import devServer from '@hono/vite-dev-server';
import path from 'node:path';
import { readFileSync } from 'node:fs';

function loadDevVars(): Record<string, string> {
  try {
    const content = readFileSync('.dev.vars', 'utf-8');
    const env: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1);
    }
    return env;
  } catch {
    return {};
  }
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
        // VitePress base is /docs/, normalize /docs -> /docs/
        rewrite: (path) => (path === '/docs' ? '/docs/' : path),
      },
    },
  },
  plugins: [
    react(),
    devServer({
      entry: 'api/index.ts',
      env: loadDevVars(),
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
