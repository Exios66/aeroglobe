import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { buildDay } from './build';
import { checkDataDir, publishDataDir, pullDataBranch } from './publish';
import { downloadTimezones } from './tzDownload';
import { downloadInputs } from './inputs';
import { adsblolSource } from './sources/adsblol';
import { fixtureSource } from './sources/fixtures';
import { fetchOpenSkySnapshot, snapshotsToTraceSource, type OpenSkySnapshot } from './sources/opensky';
import type { TraceSource } from './sources/types';
import { FIXTURE_DATE } from './fixtures/generate';

const REF_INPUTS = 'pipeline/inputs';

/** Attribution carried by OpenSky-derived catalog days. */
const OPENSKY_ATTRIBUTION = '© OpenSky Network (opensky-network.org), CC BY-NC 4.0';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves a trace source by name (adsblol downloads into workDir), throwing for unknown names. */
function pickSource(name: string, workDir: string): TraceSource {
  if (name === 'fixtures') return fixtureSource;
  if (name === 'adsblol') return adsblolSource(workDir);
  throw new Error(`source '${name}' not implemented yet`);
}

/**
 * Runs a pipeline command from argv (inputs, fixture, snapshot, build, pull, publish, tz-download, check).
 * Rejects unknown commands, invalid build arguments, and failures from downloading or building data.
 */
export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const [cmd, ...rest] = argv;
  if (cmd === 'inputs') {
    await downloadInputs(REF_INPUTS);
    return;
  }
  if (cmd === 'fixture') {
    await buildDay({
      date: FIXTURE_DATE,
      source: fixtureSource,
      outDir: 'public/data',
      now: new Date(),
      window: 3,
      maxBytesGz: 2_000_000,
      tzInput: 'pipeline/fixtures/timezones.geojson',
      refInputsDir: REF_INPUTS,
    });
    return;
  }
  if (cmd === 'snapshot') {
    const { values } = parseArgs({
      args: rest,
      options: {
        out: { type: 'string' },
        count: { type: 'string' },
        interval: { type: 'string' },
        window: { type: 'string' },
      },
    });
    const outDir = values.out ?? 'public/data';
    const count = Number(values.count ?? 1);
    const intervalS = Number(values.interval ?? 0);
    const window = Number(values.window ?? process.env.DATA_DAYS ?? 3);
    if (!Number.isInteger(count) || count < 1) throw new Error(`--count must be an integer >= 1, got '${values.count}'`);
    if (!Number.isFinite(intervalS) || intervalS < 0) throw new Error(`--interval must be seconds >= 0, got '${values.interval}'`);
    if (!Number.isInteger(window) || window < 1) throw new Error(`--window / DATA_DAYS must be an integer >= 1, got '${values.window ?? process.env.DATA_DAYS}'`);

    const snapshots: OpenSkySnapshot[] = [];
    for (let i = 0; i < count; i++) {
      if (i > 0 && intervalS > 0) await sleep(intervalS * 1000);
      const snap = await fetchOpenSkySnapshot();
      snapshots.push(snap);
      console.log(`snapshot ${i + 1}/${count}: ${snap.states?.length ?? 0} states at ${new Date(snap.time * 1000).toISOString()}`);
    }
    const last = snapshots[snapshots.length - 1];
    const date = new Date(last.time * 1000).toISOString().slice(0, 10);
    const catalog = await buildDay({
      date,
      source: snapshotsToTraceSource(snapshots, {
        name: 'opensky',
        attribution: OPENSKY_ATTRIBUTION,
        // With one snapshot each aircraft has a single point; keep them dense instead.
        minSpacingS: 0,
      }),
      outDir,
      now: new Date(),
      window,
      maxBytesGz: 2_000_000,
      refInputsDir: REF_INPUTS,
    });
    console.log(`wrote ${catalog.days.map((d) => d.date).join(', ')} to ${outDir}`);
    return;
  }
  if (cmd === 'build') {
    const { values } = parseArgs({
      args: rest,
      options: {
        date: { type: 'string' },
        source: { type: 'string' },
        out: { type: 'string' },
        window: { type: 'string' },
        featured: { type: 'boolean', default: false },
        tz: { type: 'string' },
        'work-dir': { type: 'string' },
      },
    });
    if (!values.date || !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) throw new Error('--date YYYY-MM-DD is required');
    if (!values.source) throw new Error('--source is required');
    if (!values.out) throw new Error('--out is required');
    const window = Number(values.window ?? process.env.DATA_DAYS ?? 3);
    if (!Number.isInteger(window) || window < 1) throw new Error(`--window / DATA_DAYS must be an integer >= 1, got '${values.window ?? process.env.DATA_DAYS}'`);
    const workDir = values['work-dir'] ?? join(tmpdir(), `adsblol-${values.date}`);
    const source = pickSource(values.source, workDir);
    if (source === fixtureSource && values.date !== FIXTURE_DATE) {
      throw new Error(`source 'fixtures' only supports ${FIXTURE_DATE}`);
    }
    try {
      await buildDay({
        date: values.date,
        source,
        outDir: values.out,
        now: new Date(),
        window,
        maxBytesGz: 2_000_000,
        featured: values.featured,
        tzInput: values.tz,
        refInputsDir: REF_INPUTS,
      });
    } catch (e) {
      console.error(`kept downloads in ${workDir}; re-run to resume`);
      throw e;
    }
    await rm(workDir, { recursive: true, force: true });
    return;
  }
  if (cmd === 'pull') {
    const { values } = parseArgs({ args: rest, options: { into: { type: 'string' } } });
    if (!values.into) throw new Error('--into <dir> is required');
    const r = await pullDataBranch({ repoDir: process.cwd(), into: values.into });
    console.log(r === 'cloned' ? `restored data branch into ${values.into}` : `no data branch yet; created empty ${values.into}`);
    return;
  }
  if (cmd === 'publish') {
    const { values } = parseArgs({ args: rest, options: { from: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } });
    if (!values.from) throw new Error('--from <dir> is required');
    const r = await publishDataDir({ repoDir: process.cwd(), from: values.from, dryRun: values['dry-run'] });
    console.log(values['dry-run'] ? `dry run: would publish commit ${r.commit}` : `published commit ${r.commit}`);
    return;
  }
  if (cmd === 'tz-download') {
    const { values } = parseArgs({ args: rest, options: { out: { type: 'string' } } });
    const out = await downloadTimezones(values.out ?? 'pipeline/inputs/cache/timezones.geojson');
    console.log(`wrote ${out}`);
    return;
  }
  if (cmd === 'check') {
    const { values } = parseArgs({ args: rest, options: { dir: { type: 'string' } } });
    if (!values.dir) throw new Error('--dir <dir> is required');
    const r = await checkDataDir(values.dir);
    if (!r.ok) throw new Error(`${r.problems.length} problem(s):\n${r.problems.join('\n')}`);
    console.log(`ok: ${r.days} day(s), ${r.files} files, ${r.totalBytes} bytes`);
    return;
  }
  throw new Error('usage: cli.ts build|fixture|inputs|snapshot|pull|publish|tz-download|check');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
