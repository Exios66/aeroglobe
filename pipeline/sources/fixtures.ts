import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseTraceFile, type ReadsbTrace } from '../readsb';
import type { TraceSource } from './types';

const TRACES_DIR = fileURLToPath(new URL('../fixtures/traces/', import.meta.url));

/** Serves the committed synthetic traces, in file-name order, regardless of the requested date. */
export const fixtureSource: TraceSource = {
  name: 'fixtures',
  attribution: 'Synthetic test data',
  async *traces(): AsyncGenerator<ReadsbTrace> {
    const names = (await readdir(TRACES_DIR)).filter((n) => n.endsWith('.json')).sort();
    for (const n of names) yield parseTraceFile(await readFile(join(TRACES_DIR, n)));
  },
};
