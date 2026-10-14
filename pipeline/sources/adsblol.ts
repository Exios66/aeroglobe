import { execFileSync, spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseTraceFile, type ReadsbTrace } from '../readsb';
import type { TraceSource } from './types';

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export function releaseRepo(date: string): string {
  return `adsblol/globe_history_${date.slice(0, 4)}`;
}

export function pickRelease(tags: string[], date: string): string | null {
  const prefix = `v${date.replaceAll('-', '.')}-planes-readsb-prod-`;
  const suffixes = tags
    .filter((t) => t.startsWith(prefix) && /^\d+$/.test(t.slice(prefix.length)))
    .map((t) => Number(t.slice(prefix.length)))
    .sort((a, b) => a - b);
  return suffixes.length ? `${prefix}${suffixes[0]}` : null;
}

/** Split tar parts (`.tar.aa`, `.tar.ab`, ...) or a plain `.tar`, in concatenation order. */
export function selectTarParts<T extends { name: string }>(assets: T[]): T[] {
  return assets
    .filter((a) => /\.tar\.[a-z]{2}$/.test(a.name) || a.name.endsWith('.tar'))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function isTraceFile(basename: string): boolean {
  return basename.startsWith('trace_full_');
}

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export function httpErrorMessage(url: string, status: number, statusText: string, hasToken: boolean): string {
  const base = `GET ${url} failed: ${status} ${statusText}`;
  if (status !== 403 && status !== 429) return base;
  return `${base} — GitHub API rate limit or access denied; ${
    hasToken ? 'GITHUB_TOKEN was set but rejected' : 'set GITHUB_TOKEN to raise the limit'
  }`;
}

async function ghGet(url: string): Promise<Response> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) throw new Error(httpErrorMessage(url, res.status, res.statusText, Boolean(token)));
  return res;
}

interface ReleaseInfo {
  tag_name: string;
  assets?: ReleaseAsset[];
}

const MAX_RELEASE_PAGES = 4;

async function listReleases(repo: string): Promise<ReleaseInfo[]> {
  const all: ReleaseInfo[] = [];
  for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
    const res = await ghGet(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`);
    const batch = (await res.json()) as ReleaseInfo[];
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function download(asset: ReleaseAsset, dest: string): Promise<void> {
  const res = await fetch(asset.browser_download_url);
  if (!res.ok) throw new Error(httpErrorMessage(asset.browser_download_url, res.status, res.statusText, false));
  if (!res.body) throw new Error(`download ${asset.name} failed: empty body`);
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(dest));
}

/** Member filter args: GNU tar needs --wildcards; bsdtar (macOS, Windows) globs member patterns by default. */
function traceFilterArgs(): string[] {
  let version = '';
  try {
    version = execFileSync('tar', ['--version'], { encoding: 'utf8' });
  } catch {
    // Unknown tar: fall through to the bsdtar form; extraction errors surface below.
  }
  return version.includes('GNU tar') ? ['--wildcards', '*trace_full_*'] : ['*trace_full_*'];
}

export async function extract(partPaths: string[], extractDir: string): Promise<void> {
  const tar = spawn('tar', ['-x', '-C', extractDir, ...traceFilterArgs()], { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  tar.stderr.on('data', (d: Buffer) => {
    stderr += d.toString();
  });
  const exited = new Promise<void>((resolve, reject) => {
    tar.on('error', reject);
    tar.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar exited with ${code}: ${stderr.trim()}`))));
  });
  const feed = (async () => {
    for (const p of partPaths) {
      // pipe() (not pipeline()) so per-part listeners are removed on unpipe and don't pile up on stdin.
      await new Promise<void>((resolve, reject) => {
        const src = createReadStream(p);
        src.on('error', (err) => {
          src.destroy();
          reject(err);
        });
        src.on('end', resolve);
        src.pipe(tar.stdin, { end: false });
      });
    }
    tar.stdin.end();
  })();
  // A failed feed must not leave tar waiting on stdin.
  feed.catch(() => tar.stdin.destroy());
  // If tar dies early, writes fail with EPIPE; surface tar's own error first.
  await Promise.all([exited, feed.catch(() => exited)]);
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

export function adsblolSource(workDir: string): TraceSource {
  return {
    name: 'adsblol',
    attribution: '© adsb.lol contributors, ODbL',
    async *traces(date: string): AsyncGenerator<ReadsbTrace> {
      const repo = releaseRepo(date);
      const releases = await listReleases(repo);
      const tag = pickRelease(
        releases.map((r) => r.tag_name),
        date,
      );
      if (!tag) {
        const capped = releases.length >= MAX_RELEASE_PAGES * 100;
        throw new Error(
          `No adsb.lol release for ${date}${capped ? ` (searched the newest ${releases.length} releases)` : ''}`,
        );
      }
      const parts = selectTarParts(releases.find((r) => r.tag_name === tag)?.assets ?? []);
      if (parts.length === 0) throw new Error(`Release ${tag} has no tar assets`);

      await mkdir(workDir, { recursive: true });
      const extractDir = join(workDir, 'x');
      await mkdir(extractDir, { recursive: true });
      const partPaths: string[] = [];
      for (const a of parts) {
        const dest = join(workDir, a.name);
        await download(a, dest);
        partPaths.push(dest);
      }
      await extract(partPaths, extractDir);
      await Promise.all(partPaths.map((p) => rm(p, { force: true })));

      let found = 0;
      for await (const file of walk(extractDir)) {
        if (isTraceFile(basename(file))) {
          found++;
          yield parseTraceFile(await readFile(file));
        }
      }
      if (found === 0) throw new Error(`No trace_full_* files extracted from ${tag}`);
    },
  };
}
