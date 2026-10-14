# AeroGlobe — Historical-First Redesign

- **Date:** 2026-10-14
- **Status:** Draft for review
- **Supersedes:** the delivery model in `aeroglobe plan.docx` v1.0 (live-API-first). Product vision, stack and UI inventory from that plan still stand unless changed here.

## 1. Intent

### What the owner asked for
- Complete the originally planned AeroGlobe: 3D globe viewer, flight tracking, search, filters, route highlighting, 24 h playback, polished globe.
- Add **flight paths and logs**: searchable flight routes and paths, live/flown trails, per-aircraft flight history, historical playback, time-zone segmentation, a sleek modern UI, and (last) a personal logbook.
- **Historical data first.** The app must work without an always-on API. Bulk historical logs are plentiful and free; pull them and serve them statically. Live data is an optional extra.
- Hosting: frontend on GitHub Pages, plus a serverless API only where a server is unavoidable.
- Personal logbook: single user, local-first (browser storage), built last.

### Assumptions (correct these if wrong)
- "Free" means no paid services and no always-running server. A scheduled GitHub Action and a free-tier serverless function are acceptable.
- A rolling window of a few recent days of global traffic, plus a fixed set of "featured" days, is enough. The app does not need every day ever recorded.
- Desktop and tablet are primary targets. Phones should work without breaking but are not optimised.

### Success criteria
1. `main` builds, lints and tests green in CI. Pushing to `main` deploys the site to GitHub Pages and it renders a globe (with or without a Cesium Ion token).
2. With **no backend running**, a visitor can pick a historical day, press play, and watch ≥ 5,000 aircraft move smoothly at ≥ 30 fps on a mid-range laptop.
3. Clicking an aircraft shows its flown trail (altitude-coloured) and the inferred route between airports, with times in UTC and in local time at each end.
4. Searching an airport pair (e.g. `ORD-DEN`), an airline, a callsign or a registration returns matching flights from the loaded days and flies to them.
5. A per-aircraft history panel lists every flight of that airframe in the loaded data. Choosing one replays it.
6. A time-zone overlay can be toggled on. The selected route shows where it crosses time-zone boundaries.

## 2. Audit findings that shape this design

Full reports were produced during the audit. The key items:

| Area | Finding | Consequence |
|---|---|---|
| Build | Commit `39822c4` deleted `src/components/ui/{Toggle,Tooltip,FallbackBanner}.tsx`, `server/data/shared/*`, `server/data/operators/southwest/*` but imports remain. `tsc` fails with 14 TS2307 errors and the API server cannot start. | M0 must fix this before anything else. |
| Repo | `.vite/` (34 MB), `cesium/` (14 MB), `assets/` and a **built** root `index.html` (no `/src/main.tsx`) are committed. | `npm run dev` serves a stale bundle (likely root cause of `BLANK_PAGE_TROUBLESHOOTING.md`). Purge them in M0. |
| Pages | `vite.config.ts` has no `base`. `CESIUM_BASE_URL` is hard-coded to `/cesium`. There is no `deploy.yml`. | The site 404s under `/aeroglobe/`. |
| Globe | Missing or invalid Ion token aborts viewer creation. There is one Entity plus label per aircraft and SVG data URIs are re-encoded every sync. There is no interpolation. The camera re-flies every poll because `selectedFlight` is a fresh object. | Rewrite the aircraft layer on primitives with a clock-driven interpolator (M2). |
| State | `FilterPanel.tsx:13` selector returns a new array, so zustand v5 loops forever. `useVisibleFlights` is unmemoised, runs in three components, and builds a fresh Fuse index each render. | Fix the selector in M0. Move to a single derived index in M2. |
| Backend | `dotenv` loads `.env` but the docs say `.env.local`. OpenSky uses Basic auth (now OAuth2 client-credentials). `?time=` covers about 1 h, so the 24 h scrubber cannot work. The CSV fallback fabricates positions labelled "historical". | Historical playback moves to static data (M1/M2). Express is kept only as a local dev server until M5 replaces it. |
| Paths | Only a planned great-circle arc at 0 m altitude exists, and only when AviationStack returns data. No position history is kept anywhere. | Flown tracks come from historical traces (M1). |
| Plan gaps | No deploy workflow, react-spring animation, aircraft-type filter, arc sweep animation, interpolation, working 24 h replay or Lighthouse check. | Covered across M0–M4. |

## 3. Approach

The app becomes a **static data pipeline plus a playback client**.

```
                   GitHub Actions (scheduled daily + manual)
  adsb.lol globe_history ─┐
  OpenFlights airports/    ├─► pipeline/ (Node+TS) ─► data branch (orphan, force-pushed)
   airlines                │      normalise · simplify · segment flights ·
  tz-boundary-builder ─────┘      chunk by hour · build indexes · catalog
                                                  │
  main branch ─► deploy.yml: vite build + copy data branch into dist/data ─► GitHub Pages
                                                  │
  Browser:  catalog.json ─► hourly track chunks (lazy) ─► Playback engine (Cesium clock)
            flights/airports/tz indexes ─► search, history panel, tz overlay
            (M5, optional) Worker /live ─► live overlay in the same Track format
            (M6) IndexedDB logbook
```

Rejected alternatives:
- **Serverless API plus database** (D1/Turso). More flexible queries, but it brings always-on infrastructure, quotas and more code, against the stated goal.
- **On-demand third-party APIs** (OpenSky `/tracks`, AviationStack). Rate-limited, about 30 days of shallow history, and always on.

## 4. Data sources

| Source | Use | Licence | Notes |
|---|---|---|---|
| **adsb.lol `globe_history_YYYY`** GitHub releases | Primary: full-day per-aircraft traces (readsb `trace_full` JSON) | ODbL 1.0 | Daily tarballs split into parts. Attribution is required in the UI and README. |
| **OpenFlights** `airports.dat`, `airlines.dat` | Airport coordinates, IATA/ICAO codes, IANA tz. Airline names. | ODbL (database) / DbCL (contents) | Reachable. Snapshot is committed as pipeline input. |
| **timezone-boundary-builder** `timezones-now` (simplified) | Time-zone polygons for overlay and crossings | ODbL | The pipeline simplifies it to ≤ 1.5 MB gzipped TopoJSON. |
| BTS On-Time (CSV already in repo) | Optional enrichment: scheduled times for US carriers | Public domain | Out of scope until after M4. The existing CSVs are deleted in M0. |
| ADS-B Exchange sample days | Optional alternate source | Non-commercial terms; verify before use | Not used by default. |
| OpenSky (M5 only) | Live overlay | OpenSky terms, non-commercial | OAuth2 client-credentials, server-side only. |

The pipeline puts source and licence in every catalog entry. The UI shows an attribution footer generated from the catalog.

## 5. Data model and file format

All files live under `data/` on the Pages site. `VITE_DATA_BASE_URL` can point elsewhere (for example an R2 bucket) without code changes.

### 5.1 `data/catalog.json`
```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-14T03:12:00Z",
  "days": [
    {
      "date": "2026-10-12",              // UTC day
      "source": "adsblol",
      "attribution": "© adsb.lol contributors, ODbL",
      "featured": false,
      "hours": [ { "h": 0, "file": "tracks/2026-10-12/00.json", "bytes": 1840221, "aircraft": 8123 } /* … 24 */ ],
      "flightsFile": "flights/2026-10-12.json"
    }
  ],
  "airportsFile": "ref/airports.json",
  "airlinesFile": "ref/airlines.json",
  "timezonesFile": "ref/timezones.topo.json"
}
```

### 5.2 Hourly track chunk `tracks/<date>/<HH>.json`
A columnar, integer-quantised, delta-encoded layout. It stays plain JSON so Pages' gzip applies and there is no custom decoder dependency.
```jsonc
{
  "v": 1,
  "t0": 1760227200,                 // chunk start, unix seconds
  "a": [                             // one entry per aircraft seen in the hour
    {
      "id": "a1b2c3",                // icao24, lowercase hex
      "cs": "UAL123",                // last callsign in hour or null
      "r": "N12345",                 // registration or null
      "ty": "B738",                  // ICAO type or null
      "f": "2026-10-12/a1b2c3/1",    // flight id (see 5.3) or null when on ground and unsegmented
      "p": [dt, lat, lon, alt, gs, trk,  dt, lat, lon, alt, gs, trk, …]
    }
  ]
}
```
- `p` holds samples in groups of 6. The first group is absolute and later groups are deltas from the previous sample.
  - `dt` is seconds since `t0` (first group) or since the previous sample.
  - `lat`/`lon` are degrees × 1e4 (≈ 11 m).
  - `alt` is barometric feet ÷ 25, with `-1` meaning on ground.
  - `gs` is ground speed in knots.
  - `trk` is degrees, integer.
- Each chunk overlaps the next by one sample per aircraft so interpolation is continuous across the hour boundary.
- **Size budget: ≤ 2.0 MB gzipped per hourly chunk.**
  - The pipeline resamples to ≥ 20 s spacing, then applies Ramer–Douglas–Peucker in 3D (horizontal tolerance starts at 150 m, vertical at 100 ft).
  - If a chunk is over budget, it doubles the tolerance and retries (max 4 times). After that it drops aircraft below 1,000 ft on the ground, and finally fails the build.

### 5.3 Flights index `flights/<date>.json`
Flights are segmented from traces in the pipeline. A new flight starts when on-ground → airborne, or after a data gap > 30 min with an altitude change > 5,000 ft.
```jsonc
{
  "v": 1,
  "flights": [
    {
      "id": "2026-10-12/a1b2c3/1",
      "icao24": "a1b2c3", "cs": "UAL123", "r": "N12345", "ty": "B738",
      "al": "UAL",                         // airline ICAO from callsign prefix, if it is a known airline
      "dep": { "ap": "KORD", "t": 1760230000, "conf": "ground" },   // conf: ground | inferred | unknown
      "arr": { "ap": "KDEN", "t": 1760238000, "conf": "inferred" },
      "km": 1430,
      "maxAltFt": 37000,
      "hours": [3, 4, 5]                   // track chunks that contain this flight
    }
  ]
}
```
Airports are inferred as the nearest airport with a scheduled-service-capable type within 5 km of the first or last point below 3,000 ft AGL. Otherwise `ap` is null and `conf` is `"unknown"`.

### 5.4 Reference files
- `ref/airports.json` is a compact array: `[icao, iata, name, city, country, lat, lon, elevFt, tz]`. Filtered to airports that appear in the catalog's flights plus all large airports.
- `ref/airlines.json` is `[icao, iata, name, callsignPrefix]`.
- `ref/timezones.topo.json` holds simplified IANA zone polygons.

### 5.5 Client-side types (replaces the ad-hoc `AircraftState` use in the globe path)
```ts
interface Track {           // decoded, in memory
  id: string; cs: string | null; r: string | null; ty: string | null; flightId: string | null;
  t: Float64Array;          // absolute unix seconds
  lat: Float32Array; lon: Float32Array; altFt: Float32Array; gsKt: Float32Array; trk: Float32Array;
  onGround: Uint8Array;
}
interface FlightRecord { /* mirrors 5.3 entry */ }
```
`AircraftState` stays as the "snapshot at time T" shape that the UI (cards, list, filters) consumes. The playback engine produces it.

## 6. Components

### 6.1 `pipeline/` (new, Node + TypeScript, run with `tsx`)
Each unit is a pure function over typed data where possible. Download and extract live in the source adapter only.

| Module | Responsibility |
|---|---|
| `sources/adsblol.ts` | Resolve the release for a date, download and concatenate parts, stream-extract `traces/**/trace_full_*.json`. Yields raw readsb traces. |
| `normalize.ts` | readsb trace → `RawTrack` (absolute times, ft, kt, ground flag). Drops non-aircraft (category C*, `~` non-ICAO ids) and positions with impossible jumps (> 1,200 kt implied). |
| `simplify.ts` | Resample plus 3D RDP with tolerance parameters. |
| `segment.ts` | Split tracks into flights. Infer dep/arr airports. |
| `chunk.ts` | Slice tracks by UTC hour with one-sample overlap. Quantise and delta-encode. Enforce the size budget. |
| `ref.ts` | Build airports, airlines and timezones reference files from committed inputs in `pipeline/inputs/`. |
| `catalog.ts` | Merge new days into the catalog. Apply the rolling window (`DATA_DAYS`, default 3) while keeping `featured` days. Delete files that drop out. |
| `cli.ts` | `npm run data:build -- --date 2026-10-12 [--source adsblol] [--out data-out]` and `npm run data:fixture`. |

`pipeline/fixtures/` holds 20 small hand-trimmed readsb traces (a few KB). They cover a normal flight, a multi-leg day, a gap, ground-only, and an anti-meridian crossing. Every module is unit-tested against them. Local dev never needs network access: `npm run data:fixture` writes a tiny `public/data/` that the dev server serves.

### 6.2 Workflows
- `ci.yml` (existing, extended): lint, typecheck (`tsc -p` for app, server and pipeline), test, build.
- `deploy.yml` (new): on push to `main`, and on `workflow_call` from `data.yml`.
  1. Build with `VITE_CESIUM_ION_TOKEN` from secrets and `base: '/aeroglobe/'`.
  2. Fetch the `data` branch into `dist/data`.
  3. Deploy with `actions/deploy-pages`.
- `data.yml` (new): daily cron plus `workflow_dispatch` with a `date` input.
  1. Run the pipeline for yesterday (UTC).
  2. Commit the result as a **single-commit orphan `data` branch** (force-push), so repo history does not grow.
  3. Call `deploy.yml`.

Pages limits are 1 GB per site and 100 GB per month of bandwidth. Three days × 24 × ≤ 2 MB is about 150 MB, plus reference files, which leaves headroom for featured days.

### 6.3 Frontend: playback engine (`src/playback/`, new)

| Unit | Responsibility |
|---|---|
| `dataClient.ts` | Fetch the catalog and chunks (from `VITE_DATA_BASE_URL`, default `${import.meta.env.BASE_URL}data/`). LRU cache of decoded hours (default 4). Prefetch the next hour at 75 % progress. |
| `decode.ts` | Chunk JSON → `Track[]` (typed arrays). Run in a Web Worker so the main thread never decodes. |
| `trackIndex.ts` | Merge hourly tracks per aircraft and evaluate `sampleAt(t) → AircraftState` by binary search plus linear lat/lon/alt interpolation. Great-circle interpolation is used when the segment is > 50 km. |
| `clock.ts` | Single source of time. Wraps `viewer.clock` with play/pause, speed (1×, 10×, 60×, 300×), seek, and loop within the loaded day. Exposes `currentTime` to React at ≤ 4 Hz through the store. |
| `liveSource.ts` (M5) | Adapts `/live` responses into short `Track`s so the same renderer draws them. |

### 6.4 Frontend: globe (`src/globe/`, reworked)

| Unit | Responsibility |
|---|---|
| `GlobeViewer.tsx` | Create the viewer **synchronously** with the ellipsoid and OSM/Natural Earth imagery, then upgrade to Ion terrain and imagery if the token works. Handles StrictMode double-mount. Sets `requestRenderMode` with explicit `requestRender()` while playing. |
| `aircraftLayer.ts` | One `BillboardCollection` plus one `LabelCollection`. A shared icon atlas holds 5 icons (4 altitude tiers plus selected). It updates positions and rotation in `scene.preUpdate` from `trackIndex.sampleAt(clock.now)`. Uses `alignedAxis: Cartesian3.UNIT_Z` for heading. Labels use `distanceDisplayCondition`. Picking maps billboard `id` → icao24. Hidden-by-filter aircraft use `show = false`. |
| `trailLayer.ts` | Draws the flown trail of the selected aircraft (whole flight up to `now`) as a `PolylineCollection` with per-vertex altitude colour. An optional "comet tails" mode draws the last 5 min for all visible aircraft, capped at 3,000 aircraft. |
| `routeLayer.ts` | Planned and inferred route as a great-circle arc between dep and arr airports, lifted with a parabolic altitude profile. Uses the existing glow plus a sweep animation (material time uniform). Draws tick marks where the arc crosses time-zone boundaries. |
| `tzLayer.ts` | Toggleable time-zone overlay from TopoJSON (`GroundPrimitive` fills, alternating subtle tint, outline). Hovering shows the zone name and its local time at `clock.now`. |
| `camera.ts` | Fly-to on **selection change only** (keyed by icao24, not object identity). "Follow" mode is opt-in. |
| `layers.ts` | Dark and light skins switch imagery, not just base colour. |

### 6.5 Frontend: state and UI
- **Stores.** `playbackStore` (day, time, speed, playing, mode `historical | live`) replaces `uiStore.playbackTime`. `flightStore` holds the selection and the snapshot for the visible set only. A new `catalogStore` holds the catalog and reference data. Selectors return primitives or stable references only. The derived visible set is computed once per tick in a store action, not in components.
- **Search** (`src/search/`, new). One prebuilt index per loaded day over flights (callsign, flight number, airline name/IATA/ICAO, registration, type, dep/arr IATA/ICAO/city). Route queries `AAA-BBB` / `AAA to BBB` / `AAA→BBB` are parsed explicitly. Everything else goes through Fuse. Built in the worker. Results are grouped as Flights, Routes and Airports. Choosing an airport shows its departures and arrivals for the loaded day.
- **Components (redesign in M4).**
  - Day picker and transport bar: replaces TimeScrubber. It has a 24 h histogram of aircraft count per hour, play/pause, speed, and "Live" when M5 is enabled.
  - FlightCard gets UTC and local times at both ends, the tz-crossing count, distance, max altitude, and links to the history and route views.
  - **AircraftHistory panel**: every flight of this airframe across loaded days. Choosing one seeks the clock and selects it.
  - RoutePanel: all flights on a route pair, with a duration distribution.
  - FilterPanel gains an aircraft-type filter. Region boxes are replaced by non-overlapping continent polygons, with a point-in-polygon check on a coarse grid lookup.
- **Design language.** Dark glass panels (existing palette), Inter/system font, 8-pt spacing, `prefers-reduced-motion` respected. Panel motion is CSS transitions (react-spring is removed as unused). The search is an ARIA 1.2 combobox with arrow keys. FlightCard is a non-modal dialog with focus management. Closed panels use `inert`. Below 768 px the side panels become a bottom sheet.

### 6.6 Live overlay (M5, optional)
A Cloudflare Worker (`worker/`) exposes `/live?bbox=`. It calls OpenSky with OAuth2 client credentials (secrets in Worker env), caches for 10 s, and returns the `AircraftState[]` contract. The frontend enables the Live mode only when `VITE_LIVE_API_URL` is set. Express (`server/`) is deleted in M5. Until then it stays as the local dev proxy and is fixed to start.

### 6.7 Personal logbook (M6, last)
IndexedDB (via `idb`) store `logbook` with entries:
```
{ id, date, flightNumber?, depIcao, arrIcao, aircraftType?, registration?, seat?, notes?, linkedFlightId? }
```
- Arcs for all entries, plus stats: count, km, hours, airports, countries, longest flight.
- JSON and CSV import/export.
- When a historical flight matches, "Add to logbook" links it so its real track is replayed.

## 7. Error handling
- **Catalog fetch fails.** Show a full-screen state with retry. The globe still renders. In dev, a hint suggests `npm run data:fixture`.
- **Chunk fetch fails.** Mark that hour unavailable in the histogram and keep playing other hours. Never fabricate positions.
- **Budget exceeded in the pipeline.** Fail the workflow with the offending hour and size. The previous `data` branch stays deployed.
- **Ion token missing or invalid.** Fall back to OSM imagery and the ellipsoid. A one-line notice appears in the settings menu, not a blocking banner.
- **Worker unavailable (M5).** Disable the Live toggle with a tooltip. Historical mode is unaffected.
- **Bad query params on the Worker.** Validate `bbox` (4 finite numbers in range). Respond 400 on invalid input.

## 8. Testing
- **Pipeline:** unit tests per module against fixtures. A golden-file test produces the fixture's catalog and chunks byte-for-byte. A property test checks that RDP error stays within tolerance.
- **Playback:** decode round-trip (encode → decode = quantised input). `sampleAt` at sample points, midpoints, gaps and the anti-meridian.
- **Search:** route parsing, ranking order for exact callsign versus fuzzy.
- **Components:** a smoke render of `Shell` with a mocked Cesium (this would have caught the M0 breakage), FlightCard local-time display, combobox keyboard navigation, history panel selection.
- **CI typecheck** covers `src`, `server`, `pipeline` and `worker`.
- **Performance check (manual, recorded in the PR):** 5,000-aircraft fixture-scaled chunk at ≥ 30 fps, and Lighthouse performance ≥ 75 on the deployed site.

## 9. Milestones

Each milestone is its own implementation plan and PR. Later milestones get their plan written when they start, against this spec.

| # | Milestone | Done when |
|---|---|---|
| **M0** | **Stabilise** | All of the following: <ul><li>The missing modules are resolved: `Toggle` and `Tooltip` restored from `39822c4^`, `FallbackBanner` and the CSV data layer removed, and the server's mock fallback kept.</li><li>Build artifacts purged and `.gitignore` extended.</li><li>Source `index.html` restored.</li><li>`base` and `CESIUM_BASE_URL` fixed, and `dotenv` loads `.env.local`.</li><li>The zustand selector loop is fixed, and the camera no longer re-flies on poll.</li><li>The Ion fallback works.</li><li>`deploy.yml` added and a Shell smoke test added.</li><li>Stale docs updated. `aeroglobe plan.docx` moved to `docs/`.</li><li>CI is green and Pages renders.</li></ul> |
| **M1** | Historical data pipeline | `pipeline/` modules plus fixtures and tests. `npm run data:fixture` works offline. `data.yml` produces a real day on the `data` branch within budget. Reference files are built. |
| **M2** | Playback engine and aircraft layer | Worker decode, `trackIndex`, clock, primitive-based aircraft layer, and a day picker with a transport bar. Express polling is no longer used by the globe. Success criterion 2 is met. |
| **M3** | Paths, routes, search, time zones | Trail, route and tz layers. The new search index with route queries. FlightCard local times. Success criteria 3, 4 and 6 are met. |
| **M4** | UI redesign and history | AircraftHistory and RoutePanel, the redesigned shell, accessibility, bottom sheet, type filter and continent polygons. Success criterion 5 is met. Lighthouse ≥ 75. |
| **M5** | Live overlay (optional) | The Worker with OpenSky OAuth2, the Live mode, and Express removed. |
| **M6** | Personal logbook | IndexedDB logbook, arcs and stats, import/export, linking to historical flights. |

## 10. Out of scope
- Accounts, multi-user sync, server-side databases.
- Scheduled-vs-actual delay analytics (BTS enrichment) until after M4.
- Paid data APIs. AviationStack and AeroDataBox detail lookups are removed in M2. Route and airline come from the flights index instead.
- Native mobile apps.

## 11. Open risks
- **adsb.lol release layout may change.** The source adapter is isolated and the fixture tests pin the expected format. The workflow fails loudly rather than publishing partial data.
- **Global traffic may exceed the 2 MB/hour budget at peak hours.** The adaptive tolerance handles it. If it is still too large, an optional `--region` bounding box limits ingest and the catalog records the region.
- **This development sandbox cannot reach adsb.lol, OpenSky or ADS-B Exchange.** Pipeline development relies on fixtures. The first real run happens in GitHub Actions (`workflow_dispatch`) and must be checked in the M1 PR.
