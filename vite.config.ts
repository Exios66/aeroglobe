import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react(), cesium()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    chunkSizeWarningLimit: 3000,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
