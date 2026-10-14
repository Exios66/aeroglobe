// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadTimezones, pickTzAsset } from '../../pipeline/tzDownload';

const a = (name: string) => ({ name, browser_download_url: `https://example.test/${name}` });

describe('pickTzAsset', () => {
  it('prefers the -now variant', () => {
    const assets = [a('timezones-with-oceans.geojson.zip'), a('timezones-with-oceans-now.geojson.zip')];
    expect(pickTzAsset(assets)?.name).toBe('timezones-with-oceans-now.geojson.zip');
  });
  it('falls back to the plain with-oceans asset', () => {
    expect(pickTzAsset([a('other.zip'), a('timezones-with-oceans.geojson.zip')])?.name).toBe('timezones-with-oceans.geojson.zip');
  });
  it('returns null when neither exists', () => {
    expect(pickTzAsset([a('timezones.geojson.zip')])).toBeNull();
  });
});

describe('downloadTimezones', () => {
  let dir: string;
  let out: string;
  const fetchMock = vi.fn<typeof fetch>();
  const asset = a('timezones-with-oceans-now.geojson.zip');
  const geojson = '{"type":"FeatureCollection","features":[]}\n';

  function zipResponse(entries: Record<string, string>): Response {
    const bytes = zipSync(Object.fromEntries(Object.entries(entries).map(([name, text]) => [name, strToU8(text)])));
    return new Response(new Uint8Array(bytes));
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aeroglobe-tz-download-'));
    out = join(dir, 'timezones.geojson');
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GITHUB_TOKEN', undefined);
    fetchMock.mockResolvedValueOnce(Response.json({ assets: [asset] }));
    fetchMock.mockResolvedValueOnce(zipResponse({ 'nested/combined.geojson': geojson, 'LICENSE.txt': 'license' }));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  it('creates parent directories and writes the sole GeoJSON entry verbatim', async () => {
    out = join(dir, 'nested', 'boundaries.geojson');
    expect(await downloadTimezones(out)).toBe(out);
    expect(await readFile(out, 'utf8')).toBe(geojson);
    expect(await readdir(join(dir, 'nested'))).toEqual(['boundaries.geojson']);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.github.com/repos/evansiroky/timezone-boundary-builder/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'aeroglobe-pipeline' },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, asset.browser_download_url, { headers: { 'User-Agent': 'aeroglobe-pipeline' } });
  });

  it('authenticates only the release API request and atomically replaces an existing output', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'synthetic-test-token');
    await writeFile(out, 'previous output');
    await downloadTimezones(out);
    expect(await readFile(out, 'utf8')).toBe(geojson);
    expect(await readdir(dir)).toEqual(['timezones.geojson']);
    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.any(String), {
      headers: expect.objectContaining({ Authorization: 'Bearer synthetic-test-token' }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, asset.browser_download_url, { headers: { 'User-Agent': 'aeroglobe-pipeline' } });
  });

  it('accepts an uppercase JSON extension in the fallback asset', async () => {
    const fallback = a('timezones-with-oceans.geojson.zip');
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json({ assets: [fallback] }));
    fetchMock.mockResolvedValueOnce(zipResponse({ 'combined.JSON': geojson }));
    await downloadTimezones(out);
    expect(await readFile(out, 'utf8')).toBe(geojson);
    expect(fetchMock.mock.calls[1][0]).toBe(fallback.browser_download_url);
  });

  it.each([{}, { assets: [] }, { assets: [a('timezones.geojson.zip')] }])('rejects a release without a supported asset: %j', async (release) => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json(release));
    await expect(downloadTimezones(out)).rejects.toThrow('no with-oceans time-zone asset');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await readdir(dir)).toEqual([]);
  });

  it.each([
    [true, 403, 'release lookup failed: HTTP 403'],
    [false, 503, `download of ${asset.name} failed: HTTP 503`],
  ] as const)('preserves existing data on an HTTP error (release=%s)', async (releaseFails, status, message) => {
    await writeFile(out, 'previous output');
    fetchMock.mockReset();
    if (!releaseFails) fetchMock.mockResolvedValueOnce(Response.json({ assets: [asset] }));
    fetchMock.mockResolvedValueOnce(new Response('failed', { status }));
    await expect(downloadTimezones(out)).rejects.toThrow(message);
    expect(fetchMock).toHaveBeenCalledTimes(releaseFails ? 1 : 2);
    expect(await readFile(out, 'utf8')).toBe('previous output');
    expect(await readdir(dir)).toEqual(['timezones.geojson']);
  });

  it.each([
    [{ 'README.txt': 'no json' }, 0],
    [{ 'one.json': geojson, 'two.geojson': geojson }, 2],
  ] as const)('rejects an archive with %j and preserves the destination', async (entries, count) => {
    await writeFile(out, 'previous output');
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json({ assets: [asset] }));
    fetchMock.mockResolvedValueOnce(zipResponse(entries));
    await expect(downloadTimezones(out)).rejects.toThrow(`expected one json entry in ${asset.name}, found ${count}`);
    expect(await readFile(out, 'utf8')).toBe('previous output');
    expect(await readdir(dir)).toEqual(['timezones.geojson']);
  });

  it('propagates a network failure without overwriting the destination', async () => {
    await writeFile(out, 'previous output');
    const error = new Error('offline');
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(error);
    await expect(downloadTimezones(out)).rejects.toBe(error);
    expect(await readFile(out, 'utf8')).toBe('previous output');
  });

  it('rejects a corrupt zip before writing output', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json({ assets: [asset] }));
    fetchMock.mockResolvedValueOnce(new Response('not a zip'));
    await expect(downloadTimezones(out)).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });

  it('removes the temporary file if replacing the destination fails', async () => {
    await mkdir(out);
    await writeFile(join(out, 'keep.txt'), 'keep');
    await expect(downloadTimezones(out)).rejects.toThrow();
    expect(await readdir(dir)).toEqual(['timezones.geojson']);
    expect(await readFile(join(out, 'keep.txt'), 'utf8')).toBe('keep');
  });
});
