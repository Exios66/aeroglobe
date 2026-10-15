// @vitest-environment node
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { extract, httpErrorMessage, isTraceFile, needsDownload, pickRelease, releaseRepo, selectTarParts } from '../../pipeline/sources/adsblol';

describe('releaseRepo', () => {
  it('uses the year of the date', () => {
    expect(releaseRepo('2026-10-12')).toBe('adsblol/globe_history_2026');
  });
});

describe('pickRelease', () => {
  it('prefers -prod-0 over -prod-1', () => {
    const tags = ['v2026.10.12-planes-readsb-prod-1', 'v2026.10.12-planes-readsb-prod-0'];
    expect(pickRelease(tags, '2026-10-12')).toBe('v2026.10.12-planes-readsb-prod-0');
  });
  it('falls back to the lowest suffix', () => {
    const tags = ['v2026.10.12-planes-readsb-prod-3', 'v2026.10.12-planes-readsb-prod-1'];
    expect(pickRelease(tags, '2026-10-12')).toBe('v2026.10.12-planes-readsb-prod-1');
  });
  it('ignores other dates and staging tags', () => {
    const tags = ['v2026.10.11-planes-readsb-prod-0', 'v2026.10.12-planes-readsb-staging-0'];
    expect(pickRelease(tags, '2026-10-12')).toBeNull();
  });
  it('returns null for no tags', () => {
    expect(pickRelease([], '2026-10-12')).toBeNull();
  });
  it('sorts suffixes numerically and rejects non-integer suffixes', () => {
    const prefix = 'v2026.10.12-planes-readsb-prod-';
    expect(pickRelease(['10', '2', '1.5', '-1', '0backup', ''].map((suffix) => prefix + suffix), '2026-10-12')).toBe(`${prefix}2`);
  });
});

describe('selectTarParts', () => {
  it('keeps split and plain tar assets, sorted by name', () => {
    const mk = (name: string) => ({ name, browser_download_url: `https://x/${name}` });
    const out = selectTarParts([mk('b.tar.ab'), mk('notes.txt'), mk('b.tar.aa'), mk('c.tar'), mk('b.tar.gz.sha')]);
    expect(out.map((a) => a.name)).toEqual(['b.tar.aa', 'b.tar.ab', 'c.tar']);
  });
  it('rejects unsupported extensions and preserves the input asset order', () => {
    const assets = ['x.tar.ab', 'x.tar.a', 'x.tar.aaa', 'x.tar.AA', 'x.tar.gz.sha', 'x.tar.aa'].map((name) => ({ name }));
    const before = assets.map((a) => a.name);
    expect(selectTarParts(assets)).toEqual([assets[5], assets[0]]);
    expect(assets.map((a) => a.name)).toEqual(before);
  });
});

describe('isTraceFile', () => {
  it('matches trace_full_ basenames only', () => {
    expect(isTraceFile('trace_full_abc123.json')).toBe(true);
    expect(isTraceFile('trace_recent_abc123.json')).toBe(false);
    expect(isTraceFile('heatmap.bin.ttf')).toBe(false);
  });
});

describe('httpErrorMessage', () => {
  const url = 'https://api.github.com/x';
  it('hints at setting GITHUB_TOKEN on 403/429 without a token', () => {
    expect(httpErrorMessage(url, 403, 'Forbidden', false)).toBe(
      `GET ${url} failed: 403 Forbidden — GitHub API rate limit or access denied; set GITHUB_TOKEN to raise the limit`,
    );
    expect(httpErrorMessage(url, 429, 'Too Many Requests', false)).toContain('set GITHUB_TOKEN');
  });
  it('says the token was rejected when one was set', () => {
    expect(httpErrorMessage(url, 403, 'Forbidden', true)).toContain('GITHUB_TOKEN was set but rejected');
  });
  it('adds no hint for other statuses', () => {
    expect(httpErrorMessage(url, 404, 'Not Found', false)).toBe(`GET ${url} failed: 404 Not Found`);
  });
});

describe('needsDownload', () => {
  it('downloads when missing or when the size differs', () => {
    expect(needsDownload(null, 100)).toBe(true);
    expect(needsDownload(50, 100)).toBe(true);
  });
  it('reuses a file whose size matches', () => {
    expect(needsDownload(100, 100)).toBe(false);
  });
});

describe('extract', () => {
  it('extracts only trace_full files from split parts, even with TAPE set', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'adsblol-test-'));
    const savedTape = process.env.TAPE;
    try {
      const src = join(dir, 'src');
      await mkdir(join(src, 'traces', 'ab'), { recursive: true });
      await writeFile(join(src, 'traces', 'ab', 'trace_full_abc123.json'), '{"icao":"abc123"}'.repeat(200));
      await writeFile(join(src, 'other.txt'), 'x');
      const tarPath = join(dir, 'all.tar');
      await promisify(execFile)('tar', ['-cf', tarPath, '-C', src, 'traces', 'other.txt']);
      const bytes = await readFile(tarPath);
      const mid = Math.floor(bytes.length / 2);
      const p1 = join(dir, 'p.tar.aa');
      const p2 = join(dir, 'p.tar.ab');
      await writeFile(p1, bytes.subarray(0, mid));
      await writeFile(p2, bytes.subarray(mid));
      const out = join(dir, 'out');
      await mkdir(out);
      process.env.TAPE = '/dev/nonexistent';
      await extract([p1, p2], out);
      expect(existsSync(join(out, 'traces', 'ab', 'trace_full_abc123.json'))).toBe(true);
      expect(existsSync(join(out, 'other.txt'))).toBe(false);
    } finally {
      if (savedTape === undefined) delete process.env.TAPE;
      else process.env.TAPE = savedTape;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('finishes when tar exits before the trailing part is fed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'adsblol-test-'));
    try {
      const src = join(dir, 'src');
      await mkdir(src);
      await writeFile(join(src, 'trace_full_abc123.json'), '{}');
      const tarPath = join(dir, 'all.tar');
      await promisify(execFile)('tar', ['-cf', tarPath, '-C', src, 'trace_full_abc123.json']);
      // tar stops at the end-of-archive marker; zero padding after it is never read.
      const pad = join(dir, 'pad');
      await writeFile(pad, Buffer.alloc(8_000_000));
      const out = join(dir, 'out');
      await mkdir(out);
      await extract([tarPath, pad], out);
      expect(existsSync(join(out, 'trace_full_abc123.json'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 4000);

  it('rejects with tar exit info for non-tar input', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'adsblol-test-'));
    try {
      const part = join(dir, 'bad.tar');
      await writeFile(part, Buffer.from('this is definitely not a tar archive'.repeat(50)));
      await expect(extract([part], dir)).rejects.toThrow(/tar exited/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
