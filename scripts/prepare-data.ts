import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Prepares `public/data` for a build: takes a live OpenSky snapshot, falling back to the
 * committed synthetic fixtures when the network, the rate limit, or the pipeline refuses.
 * Run directly with `tsx scripts/prepare-data.ts`.
 */
function run(args: string[]): void {
  execFileSync('npx', ['tsx', 'pipeline/cli.ts', ...args], { stdio: 'inherit' });
}

try {
  run(['snapshot', '--out', 'public/data', '--count', process.env.DATA_SNAPSHOTS ?? '3', '--interval', '120']);
} catch (error) {
  console.warn(`snapshot ingest failed (${error instanceof Error ? error.message : error}); falling back to fixtures`);
  run(['fixture']);
}

if (!existsSync('public/data/catalog.json')) {
  throw new Error('public/data/catalog.json is missing after both snapshot and fixture runs');
}
