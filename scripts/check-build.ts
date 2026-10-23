import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeSamples, type HourChunk } from '../shared/trackCodec';
import { latestDay, latestHour, type Catalog } from '../src/services/staticData';

const base = process.env.VITE_BASE ?? '/';
const html = await readFile('dist/index.html', 'utf8');
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = match[1];
  if (/^https?:/.test(url)) continue;
  assert(url.startsWith(base), `asset outside app base: ${url}`);
  await access(join('dist', url.slice(base.length)));
}
for (const asset of ['Cesium.js', 'Widgets/widgets.css', 'Workers', 'Assets', 'ThirdParty']) {
  await access(join('dist/cesium', asset));
}
const catalog: Catalog = JSON.parse(await readFile('dist/data/catalog.json', 'utf8'));
const day = latestDay(catalog);
const hour = day && latestHour(day);
assert(hour, 'build has no aircraft hour');
const chunk: HourChunk = JSON.parse(await readFile(join('dist/data', hour.file), 'utf8'));
assert(chunk.a.some((entry) => decodeSamples(entry.p, chunk.t0).some((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))), 'build has no renderable aircraft');
const observedTrails = chunk.a.filter((entry) => {
  const points = decodeSamples(entry.p, chunk.t0);
  const first = points[0];
  return first && points.some((point) => point.t > first.t && (point.lat !== first.lat || point.lon !== first.lon));
}).length;
assert(observedTrails > 0, 'build has no observed flight trails');
for (const file of [catalog.airportsFile, catalog.airlinesFile, catalog.timezonesFile]) {
  await access(join('dist/data', file));
}
for (const catalogDay of catalog.days) {
  for (const file of [catalogDay.flightsFile, ...catalogDay.hours.map((entry) => entry.file)]) {
    await access(join('dist/data', file));
  }
}
console.log(`Build verified at ${base}: Cesium assets and ${chunk.a.length} aircraft entries, ${observedTrails} observed trails.`);
