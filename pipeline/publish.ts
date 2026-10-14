import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Catalog } from './types';

const run = promisify(execFile);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface DataDirCheck {
  ok: boolean;
  problems: string[];
  days: number;
  files: number;
  totalBytes: number;
}

/** Runs Git in cwd and returns trimmed stdout; command failures become errors with stderr or the original message. */
async function git(args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await run('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
    return stdout.trim();
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    const sub = args.find((a, i) => !a.startsWith('-') && !['-c', '-C'].includes(args[i - 1] ?? ''));
    throw new Error(`git ${sub ?? args[0]} failed: ${(err.stderr ?? err.message ?? '').trim()}`);
  }
}

/** Recursively counts non-directory entries and sums their on-disk byte sizes, propagating filesystem errors. */
async function countFiles(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const sub = await countFiles(p);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files++;
      bytes += (await stat(p)).size;
    }
  }
  return { files, bytes };
}

const MAX_FILE_BYTES = 95_000_000;

/** Lists non-directory entries beneath rel with paths relative to dir and byte sizes; filesystem errors propagate. */
async function listFiles(dir: string, rel = ''): Promise<{ rel: string; size: number }[]> {
  const out: { rel: string; size: number }[] = [];
  for (const e of await readdir(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(dir, r)));
    else out.push({ rel: r, size: (await stat(join(dir, r))).size });
  }
  return out;
}

/** Returns whether p can be statted; any stat error, including access denial, returns false. */
async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks catalog metadata and the presence of reference, time-zone, flights, and all 24 hour files.
 * Compares catalog-reported gzip hour sizes with maxHourBytesGz (default 2,000,000 bytes)
 * and flags on-disk files larger than 95,000,000 bytes; referenced file contents are not validated.
 * Returns detected problems, the catalog day count, and recursive file counts and on-disk byte totals.
 * Catalog read/JSON errors become problems; filesystem traversal errors and malformed
 * catalog entries can still reject.
 */
export async function checkDataDir(dir: string, opts: { maxHourBytesGz?: number } = {}): Promise<DataDirCheck> {
  const max = opts.maxHourBytesGz ?? 2_000_000;
  const problems: string[] = [];
  /** Combines detected problems and the day count with directory totals; file-counting errors propagate. */
  const finish = async (days: number): Promise<DataDirCheck> => {
    let files = 0;
    let totalBytes = 0;
    if (await exists(dir)) ({ files, bytes: totalBytes } = await countFiles(dir));
    return { ok: problems.length === 0, problems, days, files, totalBytes };
  };

  let catalog: Catalog;
  try {
    catalog = JSON.parse(await readFile(join(dir, 'catalog.json'), 'utf8')) as Catalog;
  } catch (e) {
    problems.push(`catalog.json missing or unreadable: ${e instanceof Error ? e.message : String(e)}`);
    return finish(0);
  }
  if (catalog.schemaVersion !== 1) problems.push(`catalog.json schemaVersion is ${String(catalog.schemaVersion)}, expected 1`);
  const days = Array.isArray(catalog.days) ? catalog.days : [];
  if (!Array.isArray(catalog.days)) problems.push('catalog.json has no days array');

  for (const ref of ['ref/airports.json', 'ref/airlines.json']) {
    if (!(await exists(join(dir, ref)))) problems.push(`missing ${ref}`);
  }
  if (catalog.timezonesFile && !(await exists(join(dir, catalog.timezonesFile)))) problems.push(`missing ${catalog.timezonesFile}`);
  for (const f of await listFiles(dir)) {
    if (f.size > MAX_FILE_BYTES) problems.push(`${f.rel} is ${Math.round(f.size / 1e6)} MB; GitHub rejects files over 100 MB`);
  }
  for (const day of days) {
    if (!DATE_RE.test(String(day.date))) {
      problems.push(`invalid date '${String(day.date)}'`);
      continue;
    }
    if (!Array.isArray(day.hours)) problems.push(`${day.date}: catalog has no hours array`);
    const byHour = new Map((Array.isArray(day.hours) ? day.hours : []).map((h) => [h.h, h]));
    for (let h = 0; h < 24; h++) {
      const entry = byHour.get(h);
      const file = entry?.file ?? `tracks/${day.date}/${String(h).padStart(2, '0')}.json`;
      if (!entry) problems.push(`${day.date}: catalog has no entry for hour ${h}`);
      if (!(await exists(join(dir, file)))) problems.push(`${day.date}: missing hour file ${file}`);
      if (entry && entry.bytes > max) problems.push(`${day.date} hour ${h}: ${entry.bytes} bytes exceeds ${max}`);
    }
    const flights = day.flightsFile || `flights/${day.date}.json`;
    if (!(await exists(join(dir, flights)))) problems.push(`${day.date}: missing flights file ${flights}`);
  }
  return finish(days.length);
}

/**
 * Restores the published branch into `into` without .git, using the named remote from repoDir
 * (defaults: remote `origin`, branch `data`). Returns `cloned` after restoration or `empty`
 * after creating an empty target when the branch is absent.
 * Rejects a non-empty target and propagates Git or filesystem failures.
 */
export async function pullDataBranch(o: { repoDir: string; into: string; remote?: string; branch?: string }): Promise<'cloned' | 'empty'> {
  const remote = o.remote ?? 'origin';
  const branch = o.branch ?? 'data';
  const url = await git(['-C', o.repoDir, 'remote', 'get-url', remote]);
  if (await exists(o.into)) {
    if ((await readdir(o.into)).length > 0) throw new Error(`refusing to pull into non-empty directory ${o.into}`);
  }
  const heads = await git(['ls-remote', '--heads', url, `refs/heads/${branch}`]);
  if (!heads) {
    await mkdir(o.into, { recursive: true });
    return 'empty';
  }
  await git(['clone', '--depth', '1', '--branch', branch, url, o.into]);
  await rm(join(o.into, '.git'), { recursive: true, force: true });
  return 'cloned';
}

/**
 * Validates `from`, commits its contents in a temporary repository, and force-pushes a
 * fresh history to the named remote and branch (defaults: `origin` and `data`).
 * Uses repoDir to resolve the remote without changing its working tree.
 * dryRun still validates and creates a commit but skips pushing; returns the commit hash
 * in either case. The default commit message uses the catalog's generatedAt value.
 * Rejects failed data checks and propagates Git, catalog parsing, and filesystem errors,
 * attempting to remove the temporary repository on both success and failure.
 */
export async function publishDataDir(o: {
  repoDir: string;
  from: string;
  remote?: string;
  branch?: string;
  message?: string;
  dryRun?: boolean;
}): Promise<{ commit: string | null }> {
  const remote = o.remote ?? 'origin';
  const branch = o.branch ?? 'data';
  const check = await checkDataDir(o.from);
  if (!check.ok) throw new Error(`data directory failed checks:\n${check.problems.join('\n')}`);
  const url = await git(['-C', o.repoDir, 'remote', 'get-url', remote]);
  const catalog = JSON.parse(await readFile(join(o.from, 'catalog.json'), 'utf8')) as Catalog;
  const message = o.message ?? `data: ${catalog.generatedAt}`;
  const tmp = await mkdtemp(join(tmpdir(), 'aeroglobe-publish-'));
  try {
    const work = join(tmp, 'repo');
    await cp(o.from, work, { recursive: true });
    await git(['init', '-b', branch], work);
    await git(['-c', 'core.autocrlf=false', '-c', 'core.excludesFile=', 'add', '-A'], work);
    await git(['-c', 'user.name=aeroglobe-data', '-c', 'user.email=aeroglobe-data@users.noreply.github.com', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', 'commit', '--no-verify', '-m', message], work);
    const commit = await git(['rev-parse', 'HEAD'], work);
    if (!o.dryRun) await git(['push', '--no-verify', '--force', url, `${branch}:${branch}`], work);
    return { commit };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
