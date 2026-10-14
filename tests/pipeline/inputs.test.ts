// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadInputs, SOURCES } from '../../pipeline/inputs';

describe('downloadInputs', () => {
  let dir: string;
  const fetchMock = vi.fn<typeof fetch>();
  const csv = 'type,icao_code,name\nlarge_airport,KAAA,Kept\nheliport,KHLI,Dropped\n';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aeroglobe-inputs-'));
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url) => new Response(
      url === SOURCES.ourairports ? csv : url === SOURCES.openflightsAirports ? 'airports data\n' : 'airlines data\n',
    ));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(dir, { recursive: true, force: true });
  });

  it('creates the destination and writes filtered airports and verbatim OpenFlights data', async () => {
    const target = join(dir, 'nested', 'inputs');
    await downloadInputs(target);
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual(Object.values(SOURCES).sort());
    expect(await readFile(join(target, 'ourairports-filtered.csv'), 'utf8')).toBe('type,icao_code,name\nlarge_airport,KAAA,Kept\n');
    expect(await readFile(join(target, 'openflights-airports.dat'), 'utf8')).toBe('airports data\n');
    expect(await readFile(join(target, 'openflights-airlines.dat'), 'utf8')).toBe('airlines data\n');
  });

  it.each(Object.values(SOURCES))('does not write partial inputs when %s fails', async (failedUrl) => {
    const success = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) => url === failedUrl
      ? Promise.resolve(new Response('unavailable', { status: 503 }))
      : success(url, init));
    await expect(downloadInputs(dir)).rejects.toThrow(`GET ${failedUrl} failed: 503`);
    expect(await readdir(dir)).toEqual([]);
  });

  it('propagates network failures without writing partial files', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(downloadInputs(dir)).rejects.toThrow('offline');
    expect(await readdir(dir)).toEqual([]);
  });
});
