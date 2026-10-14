import { gunzipSync } from 'node:zlib';

/**
 * readsb `trace_full` point:
 * [dtSec, lat, lon, alt: number|'ground'|null, gs|null, track|null, flags, vrate|null,
 *  details: {flight?: string; category?: string}|null, ...rest]
 */
export interface ReadsbTrace {
  icao: string;
  r?: string;
  t?: string;
  /** Unix seconds at the start of the trace; each point's dt is relative to it. */
  timestamp: number;
  trace: unknown[][];
}

/**
 * Parses a trace file, gunzipping first when the buffer starts with the gzip magic bytes.
 * The parsed value is not checked against the trace schema.
 * @throws {Error} If gzip decompression fails.
 * @throws {SyntaxError} If the decoded text is invalid JSON.
 */
export function parseTraceFile(buf: Buffer): ReadsbTrace {
  const raw = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  return JSON.parse(raw.toString('utf8')) as ReadsbTrace;
}
