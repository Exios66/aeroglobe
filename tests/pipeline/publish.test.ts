// @vitest-environment node
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
});
