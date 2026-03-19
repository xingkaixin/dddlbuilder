import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'api/index.ts'),
      formats: ['es'],
      fileName: () => 'server.js',
    },
    outDir: 'dist',
    emptyOutDir: false, // 保留客户端构建结果
    copyPublicDir: false, // 不复制 public 目录到输出
    rollupOptions: {
      // Cloudflare Workers 提供内置全局变量，不需要打包
      external: [],
      output: {
        codeSplitting: false,
      },
    },
    target: 'es2022',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
