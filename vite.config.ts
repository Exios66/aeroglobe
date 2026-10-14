import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import { existsSync } from 'node:fs';
import { cp, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const base = process.env.VITE_BASE ?? '/';

// vite-plugin-cesium copies assets to <outDir>/<base>/cesium, but a Pages
// deploy serves dist/ at <base>, so the assets must live at dist/cesium.
/**
 * Returns the Cesium plugin with a build hook that moves assets to dist/cesium for
 * non-root, non-relative bases and removes empty parent directories. The hook propagates
 * failures from the original asset copy and subsequent filesystem operations.
 */
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
    await rm(resolve(nested, 'cesium'), { recursive: true, force: true });
    // Remove now-empty parents up to (not including) dist; never a non-empty one.
    const dist = resolve('dist');
    let dir = resolve(nested, 'cesium');
    while ((dir = dirname(dir)) !== dist && dir.startsWith(dist)) {
      if ((await readdir(dir)).length > 0) break;
      await rm(dir, { recursive: true });
    }
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
