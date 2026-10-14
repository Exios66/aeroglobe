// @vitest-environment node
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDay } from '../../pipeline/build';
import { FIXTURE_DATE } from '../../pipeline/fixtures/generate';
import { checkDataDir, publishDataDir, pullDataBranch } from '../../pipeline/publish';
import { fixtureSource } from '../../pipeline/sources/fixtures';
import type { Catalog } from '../../pipeline/types';

const run = promisify(execFile);
const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' };
const git = (args: string[]) => run('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.test', ...args], { env: gitEnv });

let root: string;
let data: string;
let remote: string;
let repo: string;
const savedEnv: Record<string, string | undefined> = {};

async function build(dir: string): Promise<void> {
  await buildDay({
    date: FIXTURE_DATE,
    source: fixtureSource,
    outDir: dir,
    now: new Date('2026-10-13T00:00:00Z'),
    window: 3,
    maxBytesGz: 2_000_000,
    tzInput: 'pipeline/fixtures/timezones.geojson',
    refInputsDir: 'pipeline/inputs',
  });
}
const commits = async (branch = 'data') => (await git(['--git-dir', remote, 'log', '--oneline', branch])).stdout.trim().split('\n').filter(Boolean);

beforeAll(async () => {
  // Keep the code under test off the user's global git config too.
  for (const k of ['GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL']) savedEnv[k] = process.env[k];
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  process.env.GIT_CONFIG_GLOBAL = gitEnv.GIT_CONFIG_GLOBAL;
  root = await mkdtemp(join(tmpdir(), 'aeroglobe-publish-'));
  data = join(root, 'data');
  remote = join(root, 'remote.git');
  repo = join(root, 'repo');
  await build(data);
  await mkdir(repo);
  await git(['init', '--bare', remote]);
  await git(['-C', repo, 'init']);
  await git(['-C', repo, 'remote', 'add', 'origin', remote]);
}, 120_000);

afterAll(async () => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await rm(root, { recursive: true, force: true });
});

describe('checkDataDir', () => {
  it('accepts a freshly built fixture day', async () => {
    const r = await checkDataDir(data);
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.days).toBe(1);
    expect(r.files).toBeGreaterThan(24);
    expect(r.totalBytes).toBeGreaterThan(0);
  });

  it('lists a missing hour file', async () => {
    const dir = join(root, 'missing-hour');
    await build(dir);
    await rm(join(dir, 'tracks', FIXTURE_DATE, '05.json'));
    const r = await checkDataDir(dir);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toContain('05.json');
  });

  it('lists an hour over the byte budget', async () => {
    const dir = join(root, 'big-hour');
    await build(dir);
    const cat = JSON.parse(await readFile(join(dir, 'catalog.json'), 'utf8')) as Catalog;
    cat.days[0].hours[3].bytes = 3_000_000;
    await writeFile(join(dir, 'catalog.json'), JSON.stringify(cat));
    const r = await checkDataDir(dir);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toContain('3000000');
  });

  it('lists a day without an hours array instead of throwing', async () => {
    const dir = join(root, 'no-hours');
    await build(dir);
    const cat = JSON.parse(await readFile(join(dir, 'catalog.json'), 'utf8')) as Catalog;
    delete (cat.days[0] as Partial<Catalog['days'][number]>).hours;
    await writeFile(join(dir, 'catalog.json'), JSON.stringify(cat));
    const r = await checkDataDir(dir);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toContain('no hours array');
  });

  it('lists a missing time-zone file named by the catalog', async () => {
    const dir = join(root, 'missing-tz');
    await build(dir);
    const cat = JSON.parse(await readFile(join(dir, 'catalog.json'), 'utf8')) as Catalog;
    expect(cat.timezonesFile).toBeTruthy();
    await rm(join(dir, cat.timezonesFile));
    const r = await checkDataDir(dir);
    expect(r.ok).toBe(false);
    expect(r.problems).toContain(`missing ${cat.timezonesFile}`);
  });

  it('flags a file over the GitHub size limit', async () => {
    const dir = join(root, 'huge-file');
    await build(dir);
    const big = join(dir, 'ref', 'airports.json');
    await truncate(big, 96_000_000);
    const r = await checkDataDir(dir);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/ref\/airports\.json is 96 MB; GitHub rejects files over 100 MB/);
  });

  it('reports a missing catalog', async () => {
    const r = await checkDataDir(join(root, 'nope'));
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toContain('catalog.json');
  });
});

describe('publishDataDir / pullDataBranch', () => {
  it('dry run leaves the remote untouched', async () => {
    const r = await publishDataDir({ repoDir: repo, from: data, dryRun: true });
    expect(r.commit).toMatch(/^[0-9a-f]{40}$/);
    await expect(commits()).rejects.toThrow();
  });

  it('force-pushes a single-commit branch, repeatedly', async () => {
    await publishDataDir({ repoDir: repo, from: data });
    expect(await commits()).toHaveLength(1);
    await publishDataDir({ repoDir: repo, from: data, message: 'data: again' });
    const log = await commits();
    expect(log).toHaveLength(1);
    expect(log[0]).toContain('data: again');
  });

  it('refuses to publish an invalid directory', async () => {
    await expect(publishDataDir({ repoDir: repo, from: join(root, 'missing-hour'), dryRun: true })).rejects.toThrow(/05\.json/);
  });

  it('pulls the branch without a .git dir', async () => {
    const into = join(root, 'pulled');
    expect(await pullDataBranch({ repoDir: repo, into })).toBe('cloned');
    expect(existsSync(join(into, 'catalog.json'))).toBe(true);
    expect(existsSync(join(into, '.git'))).toBe(false);
  });

  it('returns empty for a missing branch', async () => {
    const into = join(root, 'pulled-empty');
    expect(await pullDataBranch({ repoDir: repo, into, branch: 'nonexistent' })).toBe('empty');
    expect(existsSync(into)).toBe(true);
  });

  it('throws when the target is non-empty', async () => {
    await expect(pullDataBranch({ repoDir: repo, into: data })).rejects.toThrow();
  });

  it('round-trips exact data bytes through a custom remote and branch without touching the caller or gh-pages', async () => {
    const from = join(root, 'custom data');
    await cp(data, from, { recursive: true });
    const payload = Buffer.from('first\r\nsecond\nlast\r\n');
    await writeFile(join(from, 'notes.txt'), payload);
    await publishDataDir({ repoDir: repo, from: data, branch: 'gh-pages', message: 'preserve pages' });
    const pagesBefore = (await git(['--git-dir', remote, 'rev-parse', 'gh-pages'])).stdout;
    await git(['-C', repo, 'remote', 'add', 'data-storage', remote]);
    await writeFile(join(repo, 'user-work.txt'), 'keep my work');
    const statusBefore = (await git(['-C', repo, 'status', '--porcelain=v1'])).stdout;
    const headBefore = await readFile(join(repo, '.git', 'HEAD'), 'utf8');
    const refsBefore = (await git(['-C', repo, 'for-each-ref'])).stdout;
    const result = await publishDataDir({ repoDir: repo, from, remote: 'data-storage', branch: 'archive-data', message: 'custom publication' });
    const into = join(root, 'custom pull');
    await mkdir(into);
    expect(await pullDataBranch({ repoDir: repo, into, remote: 'data-storage', branch: 'archive-data' })).toBe('cloned');
    expect(await readFile(join(into, 'notes.txt'))).toEqual(payload);
    expect(await readFile(join(into, 'catalog.json'))).toEqual(await readFile(join(from, 'catalog.json')));
    expect((await checkDataDir(into)).ok).toBe(true);
    expect(existsSync(join(into, '.git'))).toBe(false);
    expect((await git(['--git-dir', remote, 'rev-parse', 'archive-data'])).stdout.trim()).toBe(result.commit);
    expect((await git(['--git-dir', remote, 'rev-list', '--count', 'archive-data'])).stdout.trim()).toBe('1');
    expect((await git(['--git-dir', remote, 'log', '-1', '--format=%s', 'archive-data'])).stdout.trim()).toBe('custom publication');
    expect((await git(['--git-dir', remote, 'rev-parse', 'gh-pages'])).stdout).toBe(pagesBefore);
    expect((await git(['-C', repo, 'status', '--porcelain=v1'])).stdout).toBe(statusBefore);
    expect((await git(['-C', repo, 'for-each-ref'])).stdout).toBe(refsBefore);
    expect(await readFile(join(repo, '.git', 'HEAD'), 'utf8')).toBe(headBefore);
    expect(await readFile(join(repo, 'user-work.txt'), 'utf8')).toBe('keep my work');
  });

  it('overrides global signing, excludes and autocrlf settings when publishing', async () => {
    const globalConfig = join(root, 'global.gitconfig');
    const excludes = join(root, 'global-ignore');
    await writeFile(excludes, '*.json\n*.txt\n');
    await git(['config', '--file', globalConfig, 'commit.gpgsign', 'true']);
    await git(['config', '--file', globalConfig, 'gpg.program', 'nonexistent-aeroglobe-test-signer']);
    await git(['config', '--file', globalConfig, 'core.autocrlf', 'true']);
    await git(['config', '--file', globalConfig, 'core.excludesFile', excludes]);
    const previous = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = globalConfig;
    try {
      await publishDataDir({ repoDir: repo, from: data, branch: 'config-test' });
      const contents = await git(['--git-dir', remote, 'show', 'config-test:catalog.json']);
      expect(contents.stdout).toBe(await readFile(join(data, 'catalog.json'), 'utf8'));
      const into = join(root, 'config-pull');
      await pullDataBranch({ repoDir: repo, into, branch: 'config-test' });
      expect((await checkDataDir(into)).ok).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = previous;
    }
  });

  it('does not disguise a remote lookup failure as an empty branch', async () => {
    const missingRemote = join(root, 'does-not-exist.git');
    await git(['-C', repo, 'remote', 'add', 'broken', missingRemote]);
    const into = join(root, 'failed-pull');
    await expect(pullDataBranch({ repoDir: repo, into, remote: 'broken' })).rejects.toThrow('git ls-remote failed:');
    expect(existsSync(into)).toBe(false);
  });

  it('keeps a non-empty pull target intact', async () => {
    const into = join(root, 'preserved-target');
    await mkdir(into);
    await writeFile(join(into, 'keep.txt'), 'user content');
    await expect(pullDataBranch({ repoDir: repo, into })).rejects.toThrow('refusing to pull into non-empty directory');
    expect(await readdir(into)).toEqual(['keep.txt']);
    expect(await readFile(join(into, 'keep.txt'), 'utf8')).toBe('user content');
  });
});
