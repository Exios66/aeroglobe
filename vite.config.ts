import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [react(), cesium()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    chunkSizeWarningLimit: 3000,
  },
  define: {
    CESIUM_BASE_URL: JSON.stringify('/cesium'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
