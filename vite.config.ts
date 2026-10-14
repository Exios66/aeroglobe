import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import { existsSync } from 'node:fs';
import { cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.VITE_BASE ?? '/';

// vite-plugin-cesium copies assets to <outDir>/<base>/cesium, but a Pages
// deploy serves dist/ at <base>, so the assets must live at dist/cesium.
function cesiumPlugin() {
  const plugin = cesium();
  const copy = plugin.closeBundle as unknown as (() => Promise<void>) | undefined;
  plugin.closeBundle = async function relocate() {
    await copy?.call(this);
    const prefix = base.replace(/^\/+|\/+$/g, '');
    if (!prefix || prefix.startsWith('.')) return;
    const nested = resolve('dist', prefix);
    if (!existsSync(resolve(nested, 'cesium'))) return;
    await cp(resolve(nested, 'cesium'), resolve('dist', 'cesium'), { recursive: true });
    await rm(nested, { recursive: true, force: true });
  };
  return plugin;
}

export default defineConfig({
  base,
  plugins: [react(), cesiumPlugin()],
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
