import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { unzipSync } from 'fflate';

const RELEASE_URL = 'https://api.github.com/repos/evansiroky/timezone-boundary-builder/releases/latest';
const PREFERRED = ['timezones-with-oceans-now.geojson.zip', 'timezones-with-oceans.geojson.zip'];

type Asset = { name: string; browser_download_url: string };

/** Picks the with-oceans time-zone asset, preferring the `-now` variant; null when neither is present. */
export function pickTzAsset(assets: Asset[]): Asset | null {
  for (const name of PREFERRED) {
    const hit = assets.find((a) => a.name === name);
    if (hit) return hit;
  }
  return null;
}

/**
 * Downloads the latest with-oceans time-zone archive and writes its sole JSON/GeoJSON
 * entry to outPath, creating parent directories and replacing the target by rename.
 * Returns outPath. Needs network; GITHUB_TOKEN is used for the release lookup when set.
 * Rejects non-OK responses, a missing asset, or an archive without exactly one JSON entry;
 * network, JSON parsing, ZIP decompression, and filesystem errors also propagate.
 */
export async function downloadTimezones(outPath: string): Promise<string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'aeroglobe-pipeline' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const rel = await fetch(RELEASE_URL, { headers });
  if (!rel.ok) throw new Error(`release lookup failed: HTTP ${rel.status}`);
  const asset = pickTzAsset(((await rel.json()) as { assets?: Asset[] }).assets ?? []);
  if (!asset) throw new Error('no with-oceans time-zone asset in the latest release');
  const zip = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'aeroglobe-pipeline' } });
  if (!zip.ok) throw new Error(`download of ${asset.name} failed: HTTP ${zip.status}`);
  const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  const names = Object.keys(files).filter((n) => /\.(geo)?json$/i.test(n));
  if (names.length !== 1) throw new Error(`expected one json entry in ${asset.name}, found ${names.length}`);
  await mkdir(dirname(outPath), { recursive: true });
  // Write beside the target and rename, so a failed write never leaves a truncated file behind.
  const tmp = `${outPath}.${process.pid}.tmp`;
  try {
    await writeFile(tmp, files[names[0]]);
    await rename(tmp, outPath);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
  return outPath;
}
