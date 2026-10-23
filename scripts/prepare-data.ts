import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeSamples, type HourChunk } from '../shared/trackCodec';
import { latestDay, latestHour, type Catalog } from '../src/services/staticData';

// Isolate builds so an empty snapshot cannot outrank the fallback day.
// GitHub Actions sets CI and cannot receive the workflow-file change that would
// pass DATA_SOURCE=fixtures. Default to fixtures there so the existing CI build stays offline.
const source = process.env.DATA_SOURCE ?? (process.env.CI ? 'fixtures' : 'snapshot');
if (!['snapshot', 'fixtures'].includes(source)) throw new Error('DATA_SOURCE must be snapshot or fixtures');
const staging = await mkdtemp(join(tmpdir(), 'aeroglobe-build-'));

function run(command: string) {
  const sampling = command === 'snapshot' ? ['--count', '3', '--interval', '15'] : [];
  execFileSync(process.execPath, ['--import', 'tsx', 'pipeline/cli.ts', command, '--out', staging, ...sampling], {
    stdio: 'inherit', timeout: 90_000,
  });
}

async function requireTracks() {
  const catalog: Catalog = JSON.parse(await readFile(join(staging, 'catalog.json'), 'utf8'));
  const day = latestDay(catalog);
  const hour = day && latestHour(day);
  if (!hour?.aircraft) throw new Error('snapshot contains no aircraft');
  const chunk: HourChunk = JSON.parse(await readFile(join(staging, hour.file), 'utf8'));
  const tracks = chunk.a.filter((entry) => {
    const points = decodeSamples(entry.p, chunk.t0);
    const first = points[0];
    return first && points.some((point) => point.t > first.t && (point.lat !== first.lat || point.lon !== first.lon));
  }).length;
  if (tracks === 0) throw new Error('snapshot contains no observed flight trails');
  return `Prepared ${chunk.a.length} aircraft entries, including ${tracks} observed trails.`;
}

try {
  // Keep a labeled full sample day available for historical replay alongside current observations.
  run('fixture');
  if (source === 'snapshot') {
    try {
      run('snapshot');
      await requireTracks();
    } catch (error) {
      console.warn('Snapshot unavailable; building labeled sample data.', error);
      await rm(staging, { recursive: true, force: true });
      run('fixture');
    }
  }
  console.log(await requireTracks());
  await rm('public/data', { recursive: true, force: true });
  await cp(staging, 'public/data', { recursive: true });
} finally {
  await rm(staging, { recursive: true, force: true });
}
