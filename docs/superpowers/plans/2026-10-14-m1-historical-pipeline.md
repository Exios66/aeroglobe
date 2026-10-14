# M1 — Historical Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn one UTC day of adsb.lol ADS-B traces into the static catalog, hourly track chunks, flights index and reference files defined in spec §5. Do it offline-testable on fixtures and publishable by a scheduled GitHub Action.

**Architecture:** `pipeline/` is a Node + TypeScript CLI run with `tsx`, built from small modules with pure functions where possible.
- **Flow:** source → normalise → simplify → segment → chunk/encode → write, plus a catalog merge.
- **Shared format:** the binary-free chunk codec lives in `shared/trackCodec.ts` so the M2 browser decoder uses the same code.
- **Publishing:** `data.yml` builds yesterday's data, force-pushes it as a single-commit orphan `data` branch, then calls `deploy.yml`, which copies it into `dist/data`.

**Tech Stack:** Node 20, TypeScript, tsx, Vitest (node environment), `mapshaper` (time-zone simplification), GitHub Actions with the `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-10-14-aeroglobe-historical-first-design.md` (§4, §5, §6.1, §6.2, §7, §8, §9 row M1)

**Depends on:** M0 merged. M1 needs `deploy.yml`, the `.gitignore` entries `public/data/` and `data-out/`, and a green build.

## Global Constraints

- **Chunk format** (spec §5.2): `{ v: 1, t0, a: [{ id, cs, r, ty, f, p }] }`.
  - `p` is a flat array of 6-int groups `[dt, lat×1e4, lon×1e4, altFt/25 (ground = -1), gsKt, trk]`.
  - The first group is absolute (dt relative to `t0`, may be negative for the overlap sample). Later groups are deltas of the quantised values.
- **Size budget:** ≤ **2.0 MB gzipped** per hourly chunk.
  - Start tolerances at resample spacing ≥ **20 s**, horizontal **150 m**, vertical **100 ft**.
  - On overrun, double the tolerances, at most 4 times.
  - Then drop entries with `f === null` (ground-only).
  - Then fail.
- **Flight segmentation:** start a new flight on ground → airborne, or after a gap of **> 30 min** with an altitude change of **> 5,000 ft**.
- **Airport inference:** use the nearest `ref/airports.json` airport within **5 km** of the first or last flight point that is below **3,000 ft above the airport elevation**.
  - `conf` is `ground` if the flight starts from (or ends at) a ground point.
  - `conf` is `inferred` if it is only low.
  - `conf` is `unknown` otherwise, with `ap: null`.
- **Normalisation:**
  - Drop ids starting with `~`.
  - Drop aircraft whose category starts with `C`.
  - Drop points with a null lat/lon, or a null altitude while airborne.
  - Drop points implying **> 1,200 kt**.
  - Round time to integer seconds and drop same-second duplicates.
- **Flight id:** `${date}/${icao24}/${n}` with `n` starting at 1 per aircraft per day.
- **Catalog window:** default `DATA_DAYS=3`. `featured` days are never removed. Files of removed days are deleted.
- **Determinism:** no wall-clock reads inside pipeline logic. `now` is passed in. Output key order is fixed, and aircraft are sorted by `id` then `f`.
- **Attribution:** every catalog day carries `source` and `attribution` (`"© adsb.lol contributors, ODbL"`). Reference inputs are listed with their licences in `pipeline/inputs/SOURCES.md`.
- Pipeline tests live in `tests/pipeline/` and start with `// @vitest-environment node`.

## Review Focus

1. **Flight crossing UTC midnight.** The day's trace ends mid-air.
   - Expected: the flight is emitted with `arr.conf: 'unknown'`, `arr.ap: null`, and the pipeline does not crash.
   - Pinned by the `segment` test `flight still airborne at end of day` (Task 5).
2. **Aircraft that lands and departs again within one hour.**
   - Expected: two chunk entries with the same `id` and different `f`.
   - Pinned by the `chunk` test `turnaround within an hour yields two entries` (Task 6).
3. **Anti-meridian crossing (lon 179.9 → -179.9).**
   - Expected: simplification does not treat it as a 40,000 km jump. The glitch filter and RDP use wrapped longitude deltas.
   - Pinned by tests in Tasks 3 and 4.
4. **A day where the source release is missing or the layout changed.**
   - Expected: the workflow fails before publishing, and the old `data` branch stays live.
   - Pinned by the `pickRelease` null test (Task 10) and the `set -euo pipefail` ordering in `data.yml` (Task 11).
5. **Re-running the same date.**
   - Expected: the catalog has one entry for that date (replaced, not duplicated).
   - Pinned by the `mergeCatalog` test `re-adding a date replaces it` (Task 7).

---

### Task 1: Scaffold + shared track codec

**Files:**
- Create: `shared/trackCodec.ts`
- Create: `pipeline/types.ts`
- Test: `tests/pipeline/trackCodec.test.ts`
- Modify: `tsconfig.json` (`include` adds `"pipeline"`, `"shared"`)
- Modify: `package.json`:
  - Scripts: `"data:inputs": "tsx pipeline/cli.ts inputs"`, `"data:build": "tsx pipeline/cli.ts build"`, `"data:fixture": "tsx pipeline/cli.ts fixture"`.
  - devDependency: `mapshaper`.
- Modify: `.eslintrc*` and the `lint` script so they cover `pipeline` and `shared`.

**Interfaces:**
- Produces (`shared/trackCodec.ts`):
  ```ts
  export interface SamplePoint { t: number; lat: number; lon: number; altFt: number | null /* null = on ground */; gsKt: number; trk: number }
  export interface ChunkEntry { id: string; cs: string | null; r: string | null; ty: string | null; f: string | null; p: number[] }
  export interface HourChunk { v: 1; t0: number; a: ChunkEntry[] }
  export function quantise(p: SamplePoint): SamplePoint            // the lossy values a decode returns
  export function encodeSamples(points: SamplePoint[], t0: number): number[]
  export function decodeSamples(p: number[], t0: number): SamplePoint[]
  ```
- Produces (`pipeline/types.ts`):
  ```ts
  export interface TrackPoint { t: number; lat: number; lon: number; altFt: number | null; ground: boolean; gsKt: number; trk: number; cs: string | null }
  export interface RawTrack { id: string; reg: string | null; type: string | null; category: string | null; points: TrackPoint[] }
  export interface SimplifyOptions { minSpacingS: number; horizM: number; vertFt: number }
  export const DEFAULT_SIMPLIFY: SimplifyOptions = { minSpacingS: 20, horizM: 150, vertFt: 100 }
  export interface AirportEnd { ap: string | null; t: number; conf: 'ground' | 'inferred' | 'unknown' }
  export interface FlightRecord { id: string; icao24: string; cs: string | null; r: string | null; ty: string | null; al: string | null; dep: AirportEnd; arr: AirportEnd; km: number; maxAltFt: number; hours: number[] }
  export interface CatalogHour { h: number; file: string; bytes: number; aircraft: number }
  export interface CatalogDay { date: string; source: string; attribution: string; featured: boolean; hours: CatalogHour[]; flightsFile: string }
  export interface Catalog { schemaVersion: 1; generatedAt: string; days: CatalogDay[]; airportsFile: string; airlinesFile: string; timezonesFile: string }
  ```

- [ ] **Step 1: Write the failing tests.**
  - `round-trips quantised values`:
    - Take 3 points including a ground point (`altFt: null`) and a point at lon 179.95 followed by -179.97.
    - Expect `decodeSamples(encodeSamples(pts, t0), t0)` to deep-equal `pts.map(quantise)`.
  - `first group is absolute and may be negative`: for `t0 = 1000` and a first point `t = 990`, expect `p[0] === -10`.
  - `ground encodes as -1`: expect `encodeSamples([groundPt], t0)[3] === -1`.
  - `quantise`:
    - lat/lon are rounded to 1e-4.
    - `altFt` is rounded to a multiple of 25, with `null` kept.
    - `trk` is rounded and taken mod 360, so 359.6 becomes 0.
- [ ] **Step 2: Run.** `npx vitest run tests/pipeline/trackCodec.test.ts` should FAIL (module missing).
- [ ] **Step 3: Implement the codec.** Quantised ints are:
  - `[round(t - t0), round(lat*1e4), round(lon*1e4), alt === null ? -1 : round(alt/25), round(gs), round(trk) % 360]`
  - Later groups are element-wise differences of those ints.
  - Decode is a prefix sum followed by the inverse scaling.
- [ ] **Step 4: Run.** The test should PASS. `npx tsc -p tsconfig.json --noEmit` and `npm run lint` should be clean.
- [ ] **Step 5: Commit.** `git commit -m "feat(pipeline): scaffold and shared track codec"`

### Task 2: Reference inputs, airports/airlines builders, AirportIndex

**Files:**
- Create: `pipeline/inputs.ts` (download + filter)
- Create: `pipeline/ref.ts`
- Create: `pipeline/airportIndex.ts`
- Create (committed data):
  - `pipeline/inputs/ourairports-filtered.csv`
  - `pipeline/inputs/openflights-airports.dat`
  - `pipeline/inputs/openflights-airlines.dat`
  - `pipeline/inputs/SOURCES.md`
- Test: `tests/pipeline/ref.test.ts`, `tests/pipeline/airportIndex.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // pipeline/ref.ts
  export type AirportRow = [icao: string, iata: string | null, name: string, city: string, country: string, lat: number, lon: number, elevFt: number, tz: string | null]
  export type AirlineRow = [icao: string, iata: string | null, name: string, callsign: string | null]
  export function buildAirports(ourAirportsCsv: string, openflightsAirportsDat: string): AirportRow[]   // sorted by icao
  export function buildAirlines(openflightsAirlinesDat: string): AirlineRow[]                          // active === 'Y', ICAO /^[A-Z]{3}$/, sorted
  // pipeline/airportIndex.ts
  export class AirportIndex { constructor(rows: AirportRow[]); nearest(lat: number, lon: number, maxKm: number): AirportRow | null }
  // pipeline/inputs.ts
  export async function downloadInputs(dir: string): Promise<void>   // fetches the 3 sources, writes filtered OurAirports
  ```
- Sources:
  - `https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv`
  - `https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat`
  - `https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat`
- Filter (shared by `downloadInputs` and `buildAirports`): keep `type === 'large_airport' || (type === 'medium_airport' && scheduled_service === 'yes')`, where `icao_code` (falling back to `gps_code` when it is 4 letters) is non-empty.
- `tz` is joined from OpenFlights column 12 by ICAO (column 6). `\N` means null.

- [ ] **Step 1: Write the failing tests.**
  - `buildAirports`, using inline 4-row CSV and DAT strings:
    - It keeps a large airport and a scheduled medium airport.
    - It drops an unscheduled medium airport and a heliport.
    - It joins `tz` (`KORD` → `America/Chicago`).
    - `iata` is `null` when empty.
  - `buildAirlines`: keeps `UAL`/`UA`, drops inactive and `\N` ICAO.
  - `AirportIndex.nearest`:
    - A point 3 km from KORD returns KORD with `maxKm` 5.
    - The same point with `maxKm` 1 returns null.
    - A point at lon 179.99 finds an airport at lon -179.99, 2 km away (grid wrap).
- [ ] **Step 2: Run.** `npx vitest run tests/pipeline/ref.test.ts tests/pipeline/airportIndex.test.ts` should FAIL.
- [ ] **Step 3: Implement.**
  - Use an RFC-4180-aware CSV line parser (quoted commas) in `ref.ts`. No dependency is needed.
  - `AirportIndex` buckets rows into a 1° lat/lon grid and searches the 3×3 neighbourhood with longitude wrap, comparing by haversine.
- [ ] **Step 4: Run.** The tests should PASS.
- [ ] **Step 5: Fetch the real inputs.** Run `npx tsx -e "import('./pipeline/inputs.ts').then(m=>m.downloadInputs('pipeline/inputs'))"`.
  - Expected: `ourairports-filtered.csv` with 3,000–6,000 rows, and both `.dat` files present.
  - Write `SOURCES.md` covering source URL, retrieval date and licence for each: OurAirports is public domain, OpenFlights is ODbL/DbCL.
- [ ] **Step 6: Commit.** `git commit -m "feat(pipeline): airport/airline reference builders and inputs"`

### Task 3: Synthetic fixtures + readsb normalisation

**Files:**
- Create: `pipeline/readsb.ts` (readsb types plus `parseTraceFile`)
- Create: `pipeline/normalize.ts`
- Create: `pipeline/fixtures/generate.ts`
- Create: `pipeline/fixtures/traces/*.json` (generated, committed)
- Test: `tests/pipeline/normalize.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // pipeline/readsb.ts — trace_full format: point = [dtSec, lat, lon, alt: number|'ground'|null, gs|null, track|null, flags, vrate|null, details: {flight?: string; category?: string}|null, ...rest]
  export interface ReadsbTrace { icao: string; r?: string; t?: string; timestamp: number; trace: unknown[][] }
  export function parseTraceFile(buf: Buffer): ReadsbTrace           // gunzips when buf starts with 0x1f 0x8b
  // pipeline/normalize.ts
  export function normalizeTrace(trace: ReadsbTrace): RawTrack | null // null when dropped entirely
  // pipeline/fixtures/generate.ts
  export const FIXTURE_DATE = '2026-10-12'
  export function generateFixtures(): Record<string, ReadsbTrace>   // filename → trace, deterministic
  ```
- Fixture scenarios: all on 2026-10-12, with ids `f0000N` and real airport coordinates.
  1. `normal`: KORD → KDEN, 03:10–05:20, cruise FL370, ground taxi points at both ends, callsign `UAL123`.
  2. `multileg`: KORD → KDEN → KLAX with a 40-minute ground turnaround at KDEN.
  3. `gap`: airborne, then a 45-minute gap, then 8,000 ft lower. Expected to split into 2 flights.
  4. `groundonly`: taxiing at KORD only.
  5. `antimeridian`: RJAA → PHNL segment crossing lon 180 at FL390.
  6. `nonicao`: id `~abc123`. Must be dropped.
  7. `glitch`: one point 300 km off-track for a single sample.
  8. `hourboundary`: a cruise from 06:50 to 07:20.
  9. `midnight`: departs KLAX at 23:30 and still airborne at 23:59:59.
  10. `turnaround`: lands KDEN at 09:05 and departs at 09:40, same hour.
  - Points are every 5 s while airborne.

- [ ] **Step 1: Write the failing tests.**
  - `parseTraceFile` reads both plain and `gzipSync`'d JSON.
  - `normalizeTrace(nonicao)` is `null`.
  - A `category: 'C1'` trace returns `null`.
  - `'ground'` altitude gives `ground: true, altFt: null`.
  - The glitch point is removed (count = original - 1).
  - The anti-meridian trace keeps every point (no false glitch).
  - Fractional duplicate seconds collapse to one.
  - `cs` is trimmed (`'UAL123  '` → `'UAL123'`). An empty string becomes null.
- [ ] **Step 2: Run.** `npx vitest run tests/pipeline/normalize.test.ts` should FAIL.
- [ ] **Step 3: Implement.**
  - The implied-speed check uses haversine with the longitude delta wrapped to [-180, 180]. It is always compared against the last *kept* point.
  - Carry `cs` forward from the last non-null `details.flight`.
  - `gsKt`/`trk` nulls carry the previous value, with 0 initially.
  - Write fixtures with `npx tsx pipeline/fixtures/generate.ts`. Its `main` writes `pipeline/fixtures/traces/<name>.json`.
- [ ] **Step 4: Run.** The tests should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(pipeline): readsb normalisation and synthetic fixtures"`

### Task 4: Simplification (resample + time-synchronised RDP)

**Files:**
- Create: `pipeline/simplify.ts`
- Test: `tests/pipeline/simplify.test.ts`

**Interfaces:**
- Produces: `simplifyTrack(points: TrackPoint[], opts: SimplifyOptions): TrackPoint[]` and `sedError(p: TrackPoint, a: TrackPoint, b: TrackPoint): { horizM: number; vertFt: number }`.

Algorithm (the tests do not fully determine it):
1. **Resample.** Keep the first and last points. Keep a point when `t - lastKept.t >= minSpacingS` or when `ground` differs from the previous kept point.
2. **RDP using synchronised Euclidean distance (SED).**
   - For a segment `a..b`, interpolate `a → b` linearly at each inner point's time. Lon is interpolated by wrapped delta.
   - `horizM` is the haversine from the point to its interpolated position. `vertFt` is `|alt - interpAlt|`, and it is 0 when the point or either endpoint is on the ground, because ground runs are bounded by the always-kept transition points.
   - Split at the point with the largest `max(horizM/opts.horizM, vertFt/opts.vertFt)` if that ratio is `> 1`.
   - Use an iterative stack, not recursion (traces can exceed 10k points).
3. **Ground transitions.** Always keep points where `ground` changes.

- [ ] **Step 1: Write the failing tests.**
  - A straight constant-speed line of 500 points reduces to 2 points.
  - A 90° turn keeps the corner.
  - A ground → airborne transition point is kept.
  - **Property test:** for every fixture trace, every resampled point's `sedError` against its enclosing simplified segment is ≤ tolerance (horizM ≤ 150 + 1, vertFt ≤ 100 + 1).
  - The anti-meridian fixture simplifies to < 20 % of its points with no point dropped across the crossing.
- [ ] **Step 2: Run.** `npx vitest run tests/pipeline/simplify.test.ts` should FAIL.
- [ ] **Step 3: Implement as specified above.**
- [ ] **Step 4: Run.** The tests should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(pipeline): resample and SED-RDP simplification"`

### Task 5: Flight segmentation + airport inference

**Files:**
- Create: `pipeline/segment.ts`
- Test: `tests/pipeline/segment.test.ts`

**Interfaces:**
- Consumes: `AirportIndex`, `AirlineRow[]` (Task 2), `RawTrack` (Task 1).
- Produces:
  ```ts
  export interface SegmentedTrack { track: RawTrack; flightOf: Int32Array /* per point: index into flights, -1 = none (ground) */; flights: FlightRecord[] }
  export function segmentFlights(track: RawTrack, date: string, airports: AirportIndex, airlineIcaos: Set<string>): SegmentedTrack
  ```
- Rules:
  - A flight is a maximal run of airborne points. A run is split where the gap is > 1,800 s and |Δalt| > 5,000 ft.
  - Ground points get `-1`.
  - `dep.t` / `arr.t` are the first and last airborne times.
  - `km` is the haversine path length, rounded.
  - `maxAltFt` is the maximum altitude.
  - `hours` is the sorted distinct `floor((t - dayStart)/3600)`.
  - `al` is `cs.slice(0,3)` when `cs` matches `/^[A-Z]{3}\d/` and the prefix is in `airlineIcaos`. Otherwise null.
  - Airport inference and `conf` follow the Global Constraints.
  - The lookup point is the adjacent ground point when one exists. Otherwise it is the first or last airborne point.

- [ ] **Step 1: Write the failing tests.** Use the real `pipeline/inputs` reference.
  - `normal`: 1 flight. `dep {ap:'KORD', conf:'ground'}`, `arr {ap:'KDEN', conf:'ground'}`, `km` within ±3 % of 1,430, `maxAltFt` 37,000, `al: 'UAL'`, `hours [3,4,5]`, `id '2026-10-12/f00001/1'`.
  - `multileg`: 2 flights, KORD→KDEN and KDEN→KLAX, ids `/1` and `/2`.
  - `gap`: 2 flights, where the second has `dep.conf: 'unknown'`.
  - `groundonly`: 0 flights, and every `flightOf` is -1.
  - `flight still airborne at end of day` (`midnight` fixture): `arr.conf: 'unknown'`, `arr.ap: null`.
- [ ] **Step 2: Run.** `npx vitest run tests/pipeline/segment.test.ts` should FAIL.
- [ ] **Step 3: Implement as specified.**
- [ ] **Step 4: Run.** The tests should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(pipeline): flight segmentation and airport inference"`

### Task 6: Hourly chunking with size budget

**Files:**
- Create: `pipeline/chunk.ts`
- Test: `tests/pipeline/chunk.test.ts`

**Interfaces:**
- Consumes: `SegmentedTrack` (Task 5), `simplifyTrack` (Task 4), `encodeSamples`/`HourChunk` (Task 1).
- Produces:
  ```ts
  export interface BuiltHour { h: number; json: string; bytesGz: number; aircraft: number }
  export class BudgetError extends Error { constructor(public hour: number, public bytesGz: number) }
  export function buildHour(tracks: SegmentedTrack[], dayStart: number, h: number, opts: { simplify: SimplifyOptions; maxBytesGz: number }): BuiltHour
  ```
- Behaviour:
  - For hour `h` (`t0 = dayStart + h*3600`), each track's points are split into runs of the same `flightOf` value.
  - Each run's points in `[t0, t0+3600)` form one entry, plus one overlap sample on each side: the last point before `t0` and the first at or after `t0+3600`, when they belong to the same run.
  - `f` is the flight id or null. `cs` is the last non-null callsign in the run.
  - `aircraft` counts distinct `id`s.
  - The budget loop is in the Global Constraints: tolerance multipliers `1, 2, 4, 8, 16`, then drop `f === null` entries, then `throw new BudgetError`.
  - `bytesGz` is `zlib.gzipSync(json, { level: 9 }).length`.
  - Entries are sorted by `id`, then `f`.

- [ ] **Step 1: Write the failing tests.**
  - `hourboundary` in hour 6: the entry's last decoded sample has `t ≥ t0+3600` (overlap). In hour 7, the first sample has `t < t0` (negative `dt`).
  - `turnaround within an hour yields two entries`: in hour 9, the `turnaround` fixture has 2 airborne entries with the same `id` and different `f`, plus a ground entry with `f: null`.
  - Budget fallback order:
    - With `maxBytesGz` set just below the unconstrained size, the result is under budget.
    - With a budget only met by dropping ground entries, those are dropped.
    - With `maxBytesGz: 50`, it throws `BudgetError` with `hour === h`.
  - Output is deterministic: two calls give identical `json`.
- [ ] **Step 2: Run.** `npx vitest run tests/pipeline/chunk.test.ts` should FAIL.
- [ ] **Step 3: Implement as specified.** Simplify per entry run, after slicing.
- [ ] **Step 4: Run.** The tests should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(pipeline): hourly chunk builder with gzip budget"`

### Task 7: Catalog merge + rolling window

**Files:**
- Create: `pipeline/catalog.ts`
- Test: `tests/pipeline/catalog.test.ts`

**Interfaces:**
- Produces: `mergeCatalog(existing: Catalog | null, day: CatalogDay, opts: { window: number; now: Date }): { catalog: Catalog; removed: CatalogDay[] }`.
  - Days are sorted descending by date.
  - Non-featured days beyond `window` (counting newest first) are removed.
  - `generatedAt` is `opts.now.toISOString()`.
  - The ref file paths are the fixed values `ref/airports.json`, `ref/airlines.json` and `ref/timezones.topo.json`.

- [ ] **Step 1: Write the failing tests.**
  - Adding to `null` creates a catalog with `schemaVersion 1`.
  - `re-adding a date replaces it`.
  - Window 3 with 4 days removes the oldest and returns it in `removed`.
  - A featured old day survives.
- [ ] **Step 2: Run.** It should FAIL.
- [ ] **Step 3: Implement as specified.**
- [ ] **Step 4: Run.** The tests should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(pipeline): catalog merge with rolling window"`

### Task 8: Time-zone reference build

**Files:**
- Create: `pipeline/timezones.ts`
- Create: `pipeline/fixtures/timezones.geojson` (2 rough rectangles: `America/Chicago` lon -97 to -85, `America/Denver` lon -114 to -97, lat 25–49, property `tzid`)
- Test: `tests/pipeline/timezones.test.ts`

**Interfaces:**
- Produces: `buildTimezones(inGeojsonPath: string, outTopoPath: string, opts?: { simplifyPct?: number /* default 2 */ }): Promise<{ bytesGz: number; zones: number }>`.
  - Shells out to `npx mapshaper -i <in> -simplify <pct>% keep-shapes -o format=topojson quantization=1e5 <out>`.
  - Throws if `bytesGz > 1.5 MB`.

- [ ] **Step 1: Write the failing test.** Run on the fixture into a temp file. Expect valid TopoJSON (`type: 'Topology'`), 2 geometries with `properties.tzid`, and `zones === 2`.
- [ ] **Step 2: Run.** It should FAIL.
- [ ] **Step 3: Implement.** Use `execFile` with no shell.
- [ ] **Step 4: Run.** The test should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(pipeline): time-zone topojson builder"`

### Task 9: `buildDay` orchestrator, fixture source, CLI, golden test

**Files:**
- Create: `pipeline/sources/types.ts`, `pipeline/sources/fixtures.ts`, `pipeline/build.ts`, `pipeline/cli.ts`
- Create: `pipeline/fixtures/golden/**` (generated)
- Test: `tests/pipeline/build.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // sources/types.ts
  export interface TraceSource { name: string; attribution: string; traces(date: string): AsyncIterable<ReadsbTrace> }
  // sources/fixtures.ts
  export const fixtureSource: TraceSource       // name 'fixtures', attribution 'Synthetic test data'
  // build.ts
  export interface BuildOptions { date: string; source: TraceSource; outDir: string; now: Date; window: number; maxBytesGz: number; featured?: boolean; tzInput?: string; refInputsDir: string }
  export async function buildDay(o: BuildOptions): Promise<Catalog>
  ```
- `buildDay` steps:
  1. Load the ref inputs, then write `ref/airports.json` and `ref/airlines.json`. If `tzInput` is given, also write `ref/timezones.topo.json`.
  2. Stream traces, then normalise, then segment, holding `SegmentedTrack[]` in memory.
  3. Run `buildHour` for 0..23. Hours with zero entries are written with an empty `a` and still listed.
  4. Write `tracks/<date>/<HH>.json`.
  5. Write `flights/<date>.json` as `{ v: 1, flights }`, sorted by `dep.t` then `id`.
  6. Read any existing `catalog.json` in `outDir`, merge it, and delete the files of removed days.
  7. Write the catalog with 2-space JSON.
- CLI:
  - `build --date YYYY-MM-DD --source adsblol|fixtures --out DIR [--window N] [--featured] [--tz PATH]`. `now = new Date()`, `maxBytesGz = 2_000_000`, `window` comes from `DATA_DAYS` or 3.
  - `fixture`: equivalent to `build --date 2026-10-12 --source fixtures --out public/data --tz pipeline/fixtures/timezones.geojson`.
  - `inputs`: runs `downloadInputs('pipeline/inputs')`.

- [ ] **Step 1: Write the failing golden test.**
  - Run `buildDay({ date: FIXTURE_DATE, source: fixtureSource, outDir: tmp, now: new Date('2026-10-13T00:00:00Z'), window: 3, maxBytesGz: 2_000_000, tzInput: fixture tz, refInputsDir: 'pipeline/inputs' })`.
  - Expect the sorted list of written files, and each file's bytes, to equal `pipeline/fixtures/golden/`.
  - When `process.env.UPDATE_GOLDEN === '1'`, copy the output to golden instead and pass.
  - Second test: the catalog has 24 hours, the `flights` file holds **11** flights (normal 1 + multileg 2 + gap 2 + antimeridian 1 + glitch 1 + hourboundary 1 + midnight 1 + turnaround 2; groundonly and nonicao contribute 0), and the `nonicao` id appears nowhere.
- [ ] **Step 2: Run.** `npx vitest run tests/pipeline/build.test.ts` should FAIL (module missing).
- [ ] **Step 3: Implement `buildDay`, `fixtureSource` and the CLI as specified.**
- [ ] **Step 4: Generate the golden output.** Run `UPDATE_GOLDEN=1 npx vitest run tests/pipeline/build.test.ts`. Inspect `golden/flights/2026-10-12.json` by hand against the scenarios, then run without the flag. It should PASS.
- [ ] **Step 5: Smoke the offline dev path.** Run `npm run data:fixture && ls public/data && node -e "console.log(require('./public/data/catalog.json').days.length)"`. Expected: `catalog.json flights ref tracks` and `1`.
- [ ] **Step 6: Commit.** `git commit -m "feat(pipeline): buildDay orchestrator, CLI, golden fixture test"`

### Task 10: adsb.lol source adapter

**Files:**
- Create: `pipeline/sources/adsblol.ts`
- Test: `tests/pipeline/adsblol.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function releaseRepo(date: string): string                  // 'adsblol/globe_history_' + year
  export function pickRelease(tags: string[], date: string): string | null
  //   prefers `v${YYYY.MM.DD}-planes-readsb-prod-0`, else any `v${YYYY.MM.DD}-planes-readsb-prod-*` (lowest suffix); null if none
  export function adsblolSource(workDir: string): TraceSource
  //   traces(date):
  //     1. `gh release list --repo <repo> --limit 400 --json tagName`
  //     2. pickRelease; throws `No adsb.lol release for <date>` when null
  //     3. `gh release download <tag> --repo <repo> --pattern '*.tar.*' --dir <workDir>`
  //     4. `cat parts | tar -x -C <workDir>/x --wildcards '*trace_full_*'` (spawn with bash -c, set -o pipefail)
  //     5. delete the tar parts, then walk the x/ tree yielding parseTraceFile(buf) per file
  //   name 'adsblol', attribution '© adsb.lol contributors, ODbL'
  ```

- [ ] **Step 1: Write the failing tests.**
  - `releaseRepo('2026-10-12') === 'adsblol/globe_history_2026'`.
  - `pickRelease` prefers `-prod-0` over `-prod-1`.
  - `pickRelease` ignores tags for other dates and `-staging-` tags.
  - `pickRelease([], d) === null`.
- [ ] **Step 2: Run.** It should FAIL.
- [ ] **Step 3: Implement as specified.** Add `--source adsblol` to the CLI, with `workDir` = `os.tmpdir()/adsblol-<date>`.
- [ ] **Step 4: Run.** The tests should PASS. The real download can only be verified in Actions (the sandbox blocks it), which is Task 11 Step 4.
- [ ] **Step 5: Commit.** `git commit -m "feat(pipeline): adsb.lol release source adapter"`

### Task 11: `data.yml`, deploy data step, docs, first real run

**Files:**
- Create: `.github/workflows/data.yml`
- Modify: `.github/workflows/deploy.yml` (build job)
- Modify: `README.md` (Data section: sources, attribution, `npm run data:fixture`, `DATA_DAYS`, featured days)

**Interfaces:**
- `data.yml`:
  - Triggers: `schedule: cron '17 3 * * *'`, and `workflow_dispatch` with inputs `date` (optional, default yesterday UTC) and `featured` (boolean).
  - Job `build-data`:
    - `permissions: contents: write`
    - `env: GH_TOKEN: ${{ github.token }}, NODE_OPTIONS: --max-old-space-size=6144`
    - Steps:
      1. checkout main, setup-node 20, `npm ci`.
      2. Compute `DATE`.
      3. Download time zones: `gh release download --repo evansiroky/timezone-boundary-builder --pattern 'timezones-with-oceans-now.geojson.zip' -O tz.zip && unzip -p tz.zip > tz.geojson`.
      4. Restore the data branch: `git fetch origin data --depth 1 && git worktree add data-out FETCH_HEAD || mkdir -p data-out`.
      5. `npm run data:build -- --date $DATE --source adsblol --out data-out --tz tz.geojson ${{ inputs.featured && '--featured' || '' }}`.
      6. Publish:
         ```
         cd data-out && rm -rf .git && git init -b data && git add -A
         git -c user.name=aeroglobe-bot -c user.email=actions@users.noreply.github.com commit -m "data $DATE"
         git push --force https://x-access-token:$GH_TOKEN@github.com/${{ github.repository }} data
         ```
    - All `run:` blocks use `shell: bash` with `set -euo pipefail`.
  - Job `deploy`: `needs: build-data`, `uses: ./.github/workflows/deploy.yml`, `permissions: pages: write, id-token: write, contents: read`.
- `deploy.yml` build job: after `npm run build`, add a step:
  ```
  git fetch origin data --depth 1 && mkdir -p dist/data && git --work-tree=dist/data checkout FETCH_HEAD -- . || echo "no data branch yet"
  ```
  Then run `test -f dist/data/catalog.json || echo "::warning::deploying without data"`.

- [ ] **Step 1: Write both workflow changes and the README section.**
- [ ] **Step 2: Validate.** `python3 -c "import yaml,sys;[yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/*.yml` should exit 0. Then `npm run lint && npm test && npm run build` should PASS.
- [ ] **Step 3: Commit, push and open the PR.** `git commit -m "ci: daily historical data workflow and Pages data publish"`
- [ ] **Step 4: First real run (record in the PR).** After merge, or from the PR branch via `workflow_dispatch`, run `data.yml` with a recent date. Confirm:
  - Every `catalog.json` hour has `bytes ≤ 2,000,000`.
  - The flights file has > 20,000 flights.
  - `deploy` succeeds and `https://<owner>.github.io/aeroglobe/data/catalog.json` is served.
  - If the release layout differs (no `trace_full_*` files, or a different tag scheme), fix `adsblol.ts` and its `pickRelease` tests in the same PR before merging.
