import path from "path";
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Web build config — replaces the Electron-specific vite.config.ts for browser deployment
export default defineConfig({
  // Use relative base for serving from any path (Worker, backend, etc.)
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'dist-web',
    rollupOptions: {
      input: {
        web: path.resolve(__dirname, 'web.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8790',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
