// @vitest-environment node
import { execFileSync, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adsblolSource, type ReleaseAsset } from '../../pipeline/sources/adsblol';

// The existing extract tests exercise real tar. Here a child-process double lets
// us isolate source orchestration, including downloads and extraction failures.
vi.mock('node:child_process', () => ({ execFileSync: vi.fn(), spawn: vi.fn() }));

describe('adsblolSource', () => {
  let dir: string;
  let extracted: Record<string, Buffer>;
  let tarExitCode: number;
  let fed: Buffer[];
  const date = '2026-10-12';
  const tag = 'v2026.10.12-planes-readsb-prod-0';
  const trace = { icao: 'abc123', timestamp: 1791763200, trace: [[0, 40, -73, 10000, 200, 90]] };
  const fetchMock = vi.fn<typeof fetch>();
  const asset = (name = 'traces.tar', size = 4): ReleaseAsset => ({ name, size, browser_download_url: `https://downloads.example.test/${name}` });
  const releases = (assets: ReleaseAsset[] = [asset()]) => [{ tag_name: tag, assets }];

  async function collect() {
    const traces = [];
    for await (const item of adsblolSource(dir).traces(date)) traces.push(item);
    return traces;
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aeroglobe-adsblol-source-'));
    extracted = { 'traces/ab/trace_full_abc123.json': Buffer.from(JSON.stringify(trace)) };
    tarExitCode = 0;
    fed = [];
    vi.resetAllMocks();
    vi.stubEnv('GITHUB_TOKEN', undefined);
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(execFileSync).mockReturnValue('tar (GNU tar)');
    vi.mocked(spawn).mockImplementation(() => {
      const child = new EventEmitter();
      const stderr = new PassThrough();
      const stdin = new Writable({ write(chunk, _encoding, done) { fed.push(Buffer.from(chunk)); done(); } });
      stdin.on('finish', () => {
        const unpack = async () => {
          for (const [name, contents] of Object.entries(extracted)) {
            const path = join(dir, 'x', name);
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, contents);
          }
          if (tarExitCode) stderr.write('broken archive');
          child.emit('close', tarExitCode);
        };
        void unpack().catch((error) => child.emit('error', error));
      });
      return Object.assign(child, { stdin, stderr }) as unknown as ReturnType<typeof spawn>;
    });
    fetchMock.mockResolvedValueOnce(Response.json(releases()));
    fetchMock.mockResolvedValueOnce(Response.json([]));
    fetchMock.mockResolvedValueOnce(new Response('part'));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it.each([undefined, 'synthetic-test-token'])('downloads a release, yields traces and deletes parts (token=%s)', async (token) => {
    vi.stubEnv('GITHUB_TOKEN', token);
    const source = adsblolSource(dir);
    expect(source).toMatchObject({ name: 'adsblol', attribution: '© adsb.lol contributors, ODbL' });
    expect(await collect()).toEqual([trace]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.github.com/repos/adsblol/globe_history_2026/releases?per_page=100&page=1', {
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, asset().browser_download_url);
    expect(Buffer.concat(fed).toString()).toBe('part');
    expect(await readdir(dir)).toEqual(['x']);
    expect(await readFile(join(dir, 'x/traces/ab/trace_full_abc123.json'), 'utf8')).toBe(JSON.stringify(trace));
  });

  it('finds a matching release on a later page and feeds split parts in name order', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json([{ tag_name: 'unrelated' }]));
    fetchMock.mockResolvedValueOnce(Response.json(releases([asset('traces.tar.ab', 6), asset('traces.tar.aa', 5)])));
    fetchMock.mockResolvedValueOnce(Response.json([]));
    fetchMock.mockResolvedValueOnce(new Response('first'));
    fetchMock.mockResolvedValueOnce(new Response('second'));
    expect(await collect()).toEqual([trace]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      ...[1, 2, 3].map((page) => `https://api.github.com/repos/adsblol/globe_history_2026/releases?per_page=100&page=${page}`),
      asset('traces.tar.aa').browser_download_url,
      asset('traces.tar.ab').browser_download_url,
    ]);
    expect(Buffer.concat(fed).toString()).toBe('firstsecond');
  });

  it('reuses matching parts but removes stale extracted traces before resuming', async () => {
    await writeFile(join(dir, 'traces.tar'), 'kept');
    await mkdir(join(dir, 'x'));
    await writeFile(join(dir, 'x/trace_full_stale.json'), JSON.stringify({ ...trace, icao: 'stale' }));
    expect(await collect()).toEqual([trace]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Buffer.concat(fed).toString()).toBe('kept');
    expect(await readdir(join(dir, 'x'))).toEqual(['traces']);
  });

  it('replaces a partial download instead of appending to it', async () => {
    await writeFile(join(dir, 'traces.tar'), 'incomplete');
    expect(await collect()).toEqual([trace]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(Buffer.concat(fed).toString()).toBe('part');
  });

  it('yields plain and gzipped traces in path order, skips unreadable traces and ignores other files', async () => {
    const second = { ...trace, icao: 'def456' };
    extracted = {
      'b/trace_full_def456.json': gzipSync(JSON.stringify(second)),
      'a/trace_full_abc123.json': Buffer.from(JSON.stringify(trace)),
      'trace_full_broken.json': Buffer.from('invalid JSON'),
      'trace_full_broken.gz': Buffer.from([0x1f, 0x8b, 0]),
      'trace_recent_ignored.json': Buffer.from(JSON.stringify({ ...trace, icao: 'ignored' })),
    };
    expect(await collect()).toEqual([trace, second]);
    expect(console.warn).toHaveBeenCalledExactlyOnceWith('skipped 2 unreadable trace files');
  });

  it('rejects when every extracted trace is unreadable', async () => {
    extracted = { 'trace_full_bad.json': Buffer.from('invalid') };
    await expect(collect()).rejects.toThrow(`No readable trace_full_* files extracted from ${tag}`);
    expect(console.warn).toHaveBeenCalledWith('skipped 1 unreadable trace files');
  });

  it('rejects when extraction contains no full traces', async () => {
    extracted = { 'trace_recent_abc123.json': Buffer.from(JSON.stringify(trace)) };
    await expect(collect()).rejects.toThrow('No readable trace_full_* files');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('stops release pagination on an empty page and reports a missing date', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json([]));
    await expect(collect()).rejects.toThrow(`No adsb.lol release for ${date}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('caps lookup at four pages and reports the search limit', async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => Response.json(Array.from({ length: 100 }, (_, i) => ({ tag_name: `unrelated-${i}` }))));
    await expect(collect()).rejects.toThrow('No adsb.lol release for 2026-10-12 (searched the newest 400 releases)');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([undefined, [], [asset('notes.txt')]])('rejects a matching release without tar assets: %j', async (assets) => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json([{ tag_name: tag, assets }]));
    fetchMock.mockResolvedValueOnce(Response.json([]));
    await expect(collect()).rejects.toThrow(`Release ${tag} has no tar assets`);
    expect(spawn).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });

  it.each([403, 429])('reports API HTTP %s with a token hint', async (status) => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response('denied', { status }));
    await expect(collect()).rejects.toThrow('set GITHUB_TOKEN to raise the limit');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('authenticates the release API request and reports a rejected token', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'synthetic-test-token');
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response('denied', { status: 403 }));
    await expect(collect()).rejects.toThrow('GITHUB_TOKEN was set but rejected');
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer synthetic-test-token' },
    });
  });

  it('keeps already downloaded parts when a later download fails', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json(releases([asset('traces.tar.aa'), asset('traces.tar.ab')])));
    fetchMock.mockResolvedValueOnce(Response.json([]));
    fetchMock.mockResolvedValueOnce(new Response('part'));
    fetchMock.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    await expect(collect()).rejects.toThrow('failed: 503');
    expect(await readFile(join(dir, 'traces.tar.aa'), 'utf8')).toBe('part');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('rejects an empty download body before extraction', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json(releases()));
    fetchMock.mockResolvedValueOnce(Response.json([]));
    fetchMock.mockResolvedValueOnce(new Response(null));
    await expect(collect()).rejects.toThrow('download traces.tar failed: empty body');
    expect(spawn).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual(['x']);
  });

  it('preserves downloaded parts and surfaces tar diagnostics on extraction failure', async () => {
    tarExitCode = 2;
    await expect(collect()).rejects.toThrow('tar exited with 2: broken archive');
    expect(await readFile(join(dir, 'traces.tar'), 'utf8')).toBe('part');
  });

  it('propagates network errors before extraction', async () => {
    const error = new Error('offline');
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(error);
    await expect(collect()).rejects.toBe(error);
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([
    ['tar (GNU tar)', ['--wildcards', '*trace_full_*']],
    ['bsdtar 3.7', ['*trace_full_*']],
    [null, ['*trace_full_*']],
  ] as const)('uses the trace filter supported by tar version %s', async (version, filter) => {
    if (version === null) vi.mocked(execFileSync).mockImplementation(() => { throw new Error('version unavailable'); });
    else vi.mocked(execFileSync).mockReturnValue(version);
    expect(await collect()).toEqual([trace]);
    expect(spawn).toHaveBeenCalledExactlyOnceWith('tar', ['-x', '-f', '-', '-C', join(dir, 'x'), ...filter], { stdio: ['pipe', 'ignore', 'pipe'] });
  });
});
