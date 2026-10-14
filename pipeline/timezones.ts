import { execFile } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

const execFileAsync = promisify(execFile);
const MAPSHAPER = fileURLToPath(
  new URL("../node_modules/.bin/mapshaper-xl", import.meta.url),
);
const MAX_BYTES_GZ = 1_500_000;

export interface TimezoneOpts {
  /** Simplification percentage kept by mapshaper (default 2). */
  simplifyPct?: number;
  /** Gzipped size limit in bytes (default 1.5 MB). */
  maxBytesGz?: number;
  /** Heap size for mapshaper-xl in GB (default 4). */
  memGb?: number;
}

/** Simplifies a time-zone GeoJSON into quantised TopoJSON; throws if the gzipped output is too large. */
export async function buildTimezones(
  inGeojsonPath: string,
  outTopoPath: string,
  opts: TimezoneOpts = {},
): Promise<{ bytesGz: number; zones: number }> {
  const pct = opts.simplifyPct ?? 2;
  const limit = opts.maxBytesGz ?? MAX_BYTES_GZ;
  // mapshaper-xl does not propagate the child's exit code, so clear stale output and rely on the read below.
  rmSync(outTopoPath, { force: true });
  await execFileAsync(
    MAPSHAPER,
    [
      `${opts.memGb ?? 4}gb`,
      "-quiet",
      "-i",
      inGeojsonPath,
      "-simplify",
      `${pct}%`,
      "keep-shapes",
      "-o",
      "format=topojson",
      "quantization=1e5",
      outTopoPath,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const raw = readFileSync(outTopoPath);
  const bytesGz = gzipSync(raw).length;
  if (bytesGz > limit)
    throw new Error(
      `timezones topojson is ${bytesGz} bytes gz, over limit ${limit}`,
    );
  const topo = JSON.parse(raw.toString("utf8")) as {
    objects: Record<string, { geometries: unknown[] }>;
  };
  const zones = Object.values(topo.objects).reduce(
    (n, o) => n + o.geometries.length,
    0,
  );
  return { bytesGz, zones };
}
