import { parseArgs } from 'node:util';
import { buildDay } from './build';
import { downloadInputs } from './inputs';
import { fixtureSource } from './sources/fixtures';
import type { TraceSource } from './sources/types';
import { FIXTURE_DATE } from './fixtures/generate';

const REF_INPUTS = 'pipeline/inputs';

function pickSource(name: string): TraceSource {
  if (name === 'fixtures') return fixtureSource;
  throw new Error(`source '${name}' not implemented yet`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
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
      },
    });
    if (!values.date || !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) throw new Error('--date YYYY-MM-DD is required');
    if (!values.source) throw new Error('--source is required');
    if (!values.out) throw new Error('--out is required');
    const window = Number(values.window ?? process.env.DATA_DAYS ?? 3);
    await buildDay({
      date: values.date,
      source: pickSource(values.source),
      outDir: values.out,
      now: new Date(),
      window,
      maxBytesGz: 2_000_000,
      featured: values.featured,
      tzInput: values.tz,
      refInputsDir: REF_INPUTS,
    });
    return;
  }
  throw new Error('usage: cli.ts build|fixture|inputs');
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
