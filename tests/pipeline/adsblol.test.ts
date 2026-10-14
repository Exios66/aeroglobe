// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extract, httpErrorMessage, isTraceFile, pickRelease, releaseRepo, selectTarParts } from '../../pipeline/sources/adsblol';

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
});

describe('selectTarParts', () => {
  it('keeps split and plain tar assets, sorted by name', () => {
    const mk = (name: string) => ({ name, browser_download_url: `https://x/${name}` });
    const out = selectTarParts([mk('b.tar.ab'), mk('notes.txt'), mk('b.tar.aa'), mk('c.tar'), mk('b.tar.gz.sha')]);
    expect(out.map((a) => a.name)).toEqual(['b.tar.aa', 'b.tar.ab', 'c.tar']);
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

describe('extract', () => {
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
