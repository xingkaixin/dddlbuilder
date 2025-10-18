import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          // 将 Handsontable 单独打包
          handsontable: ["handsontable"],
          // 将 React 相关库单独打包
          "react-vendor": ["react", "react-dom"],
          // 其他大型库也可以单独分离
        },
      },
    },
  },
});
