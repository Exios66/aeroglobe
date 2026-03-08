import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// GitHub Pages: set VITE_APP_BASE=/aeroglobe/ in the deploy workflow so assets and Cesium load from the repo subpath.
const base = process.env.VITE_APP_BASE || '/';
const cesiumBaseUrl = base === '/' ? '/cesium' : `${base.replace(/\/$/, '')}/cesium`;

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
  define: {
    CESIUM_BASE_URL: JSON.stringify(cesiumBaseUrl),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
