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
        manualChunks: {
          // 将 Handsontable 单独打包
          handsontable: ['handsontable', '@handsontable/react-wrapper'],
          // 将 node-sql-parser 单独打包（最大的依赖）
          sqlParser: ['node-sql-parser'],
          // 将 React 相关库单独打包
          'react-vendor': ['react', 'react-dom'],
          // UI 组件库
          ui: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
          ],
          // 工具库
          utils: [
            'lucide-react',
            'clsx',
            'class-variance-authority',
            'tailwind-merge',
          ],
        },
      },
    },
  },
});
