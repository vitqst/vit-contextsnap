import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, 'desktop'),
  plugins: [react()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    fs: { allow: [import.meta.dirname] },
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: { outDir: 'dist', target: 'safari15.5', emptyOutDir: true },
});
