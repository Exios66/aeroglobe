# M0 — Stabilise AeroGlobe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get `main` building, testing and deploying green, with a globe that renders on GitHub Pages with or without a Cesium Ion token.

**Architecture:** This milestone repairs code and does not change architecture.
- Restore or remove the modules deleted in `39822c4`.
- Purge committed build output and restore the source `index.html`.
- Fix the Pages base path, env loading, the zustand selector loop and the camera re-fly bug.
- Add an Ion-less imagery fallback and a Pages deploy workflow.
- Express stays as the local dev proxy, with mock fallback only.

**Tech Stack:** React 18, TypeScript 5.9, Vite 7, vite-plugin-cesium, CesiumJS 1.135, Zustand 5, Express 5, Vitest 3, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-14-aeroglobe-historical-first-design.md` (§2 audit table, §9 row M0)

## Global Constraints

- Node 20 (CI), `npm ci` is the install.
- Never fabricate positions. The CSV "historical" fallback is removed, and server fallback is `source: 'mock'` only.
- The Pages URL is `https://<owner>.github.io/aeroglobe/`, so the production build uses `base: '/aeroglobe/'`.
- `VITE_CESIUM_ION_TOKEN` comes from env or GitHub secret and is never hard-coded.
- Server env: load `.env.local` first, then `.env`.
- Pipeline and data work belong to M1 and are not touched here.
- Every commit must leave `npm run lint && npm test && npm run build` passing. Exception: Task 1's first two steps, which are red by design.

## Review Focus

1. **Globe on Pages with no `VITE_CESIUM_ION_TOKEN` secret set.**
   - Expected: the site shows an OSM-imagery globe, not a blank page or "Globe failed to load".
   - Pinned by Task 5's `resolveIonToken` test plus the manual Pages check in Task 7.
2. **Pages assets and Cesium workers under `/aeroglobe/`.**
   - Expected: `dist/index.html` references `/aeroglobe/assets/…`, and `CESIUM_BASE_URL` resolves to `/aeroglobe/cesium/`.
   - Pinned by the grep check in Task 4.
3. **OpenSky unreachable or returning empty.**
   - Expected: the API answers 200 with `source: 'mock'`, and the TopBar says "Sample data", not "Historical (ORD, LAS, Frontier)".
   - Pinned by `tests/server/opensky.test.ts` in Task 2.
4. **A poll arrives while a flight is selected.**
   - Expected: the camera stays where the user put it, and only a new selection flies.
   - Pinned by `tests/hooks/useGlobe.test.tsx` in Task 6.
5. **Only `.env.local` exists (the README's instruction).**
   - Expected: server keys load.
   - Pinned by `tests/server/env.test.ts` in Task 2.

---

### Task 1: Shell smoke test + restore deleted UI primitives

**Files:**
- Create: `tests/components/Shell.test.tsx`
- Restore: `src/components/ui/Toggle.tsx`, `src/components/ui/Tooltip.tsx` (from `39822c4^`)
- Modify: `src/components/layout/Shell.tsx:16,52` (drop `FallbackBanner`)
- Modify: `src/components/layout/TopBar.tsx:36` (source label)

**Interfaces:**
- Produces: `Toggle({active?, ...buttonProps})` and `Tooltip({text, children})`, unchanged from history.
- Produces: TopBar source labels `opensky → "Live · OpenSky"`, `mock → "Sample data"`, `null → "warming up"`.

- [ ] **Step 1: Write the failing smoke test.** In `tests/components/Shell.test.tsx`:
  - `vi.mock('../../src/globe/GlobeViewer', () => ({ GlobeViewer: () => <div data-testid="globe" /> }))`.
  - `vi.mock('../../src/hooks/useGlobe', () => ({ useGlobe: () => {} }))`.
  - Stub `global.fetch` to resolve `{ flights: [], source: 'mock', stale: true }`.
  - Wrap in `QueryClientProvider`.
  - Test `renders the shell without crashing`: expects `getByTestId('globe')`, `getByPlaceholderText(/search/i)` and the text `AeroGlobe`.
- [ ] **Step 2: Run it.** `npx vitest run tests/components/Shell.test.tsx` should FAIL with `Failed to resolve import "../ui/FallbackBanner"`.
- [ ] **Step 3: Restore and remove.**
  - Run `git checkout 39822c4^ -- src/components/ui/Toggle.tsx src/components/ui/Tooltip.tsx`.
  - Delete the `FallbackBanner` import and JSX in `Shell.tsx`.
  - Replace the `TopBar.tsx:36` expression with a `SOURCE_LABELS: Record<string, string>` lookup holding the three labels above.
- [ ] **Step 4: Run it.** `npx vitest run tests/components/Shell.test.tsx` should PASS. If it fails on the `FilterPanel` render loop ("Maximum update depth"), do Task 3 Step 3 first, then return.
- [ ] **Step 5: Commit.** `git commit -m "fix: restore Toggle/Tooltip, drop FallbackBanner, add Shell smoke test"`

### Task 2: Server: remove CSV data layer, load `.env.local`

**Files:**
- Delete:
  - `server/data/operators/`
  - `server/data/README.md`
  - top-level `data/` (`parse-departures-fallback.js`, `ORD/`, `las-wn-departures-fallback.json`)
  - `scripts/extract-las-departures-fallback.py`
- Modify:
  - `server/data/index.ts`: re-export only `getMockAircraftStates`, `getMockFlightDetail`, `searchMockFlights` from `./mockFlights`.
  - `server/services/opensky.ts:96-141`: remove both `getAllFallbackStates` branches. The return type becomes `source: 'opensky' | 'mock'`.
  - `server/services/flightDetails.ts:3,111`: remove the `getFallbackFlightDetail` use.
  - `src/services/api.ts:5`: `source: 'opensky' | 'mock'`.
- Create: `server/env.ts`. Modify `server/app.ts:2,8` to call it instead of `dotenv.config()`.
- Test: `tests/server/opensky.test.ts`, `tests/server/env.test.ts` (both start with `// @vitest-environment node`).

**Interfaces:**
- Produces: `loadEnv(cwd?: string): void`. Calls `dotenv.config({ path: [join(cwd, '.env.local'), join(cwd, '.env')], quiet: true })`. Earlier files win, which is dotenv 17 array semantics.
- Produces: `fetchLiveAircraftStates(options?) → Promise<{ flights: AircraftState[]; source: 'opensky' | 'mock'; stale: boolean }>`.

- [ ] **Step 1: Write the failing tests.**
  - `opensky.test.ts`:
    - `falls back to mock when fetch rejects`: stub `fetch` to reject. Expect `source === 'mock'`, `stale === true`, `flights.length > 0`.
    - `falls back to mock when OpenSky returns no states`: stub `{ ok: true, json: async () => ({ time: 0, states: [] }) }`. Same expectations.
  - `env.test.ts`:
    - `loads keys from .env.local when .env is absent`: write `AEROGLOBE_TEST_KEY=local` to a temp dir's `.env.local`, call `loadEnv(tmp)`, and expect `process.env.AEROGLOBE_TEST_KEY === 'local'`.
    - `.env.local wins over .env`: write both files and expect the local value.
    - Delete the env var in `afterEach`.
- [ ] **Step 2: Run.** `npx vitest run tests/server` should FAIL: env.ts is missing, and the opensky import chain fails on `./shared/airportCoords`.
- [ ] **Step 3: Implement.** Make the deletions and modifications listed above. Run `grep -rn "historical\|Southwest\|Frontier" src server` and remove any leftovers, except comments that describe M1.
- [ ] **Step 4: Run.** `npx vitest run tests/server && npx tsc -p tsconfig.json --noEmit` should PASS with 0 errors.
- [ ] **Step 5: Smoke the server.** Run `PORT=3999 timeout 8 npx tsx server/index.ts & sleep 5; curl -s localhost:3999/api/flights/live | head -c 200`. Expected: JSON with `"source":"mock"` or `"opensky"`.
- [ ] **Step 6: Commit.** `git commit -m "fix(server): drop fabricated CSV fallback, load .env.local"`

### Task 3: Fix zustand selector loop in FilterPanel

**Files:**
- Modify: `src/components/filters/FilterPanel.tsx:13`
- Test: `tests/components/FilterPanel.test.tsx`

- [ ] **Step 1: Write the failing test.** Test `renders with flights in the store without an update loop`:
  - Call `useFlightStore.getState().setFlights([...2 AircraftState fixtures with callsigns "UAL1", "DAL2"])`.
  - Call `useUiStore.setState({ filterPanelOpen: true })`.
  - Render `<FilterPanel />`.
  - Expect buttons named `UAL` and `DAL`, and no thrown error.
- [ ] **Step 2: Run.** `npx vitest run tests/components/FilterPanel.test.tsx` should FAIL with "Maximum update depth exceeded" or "getSnapshot should be cached".
- [ ] **Step 3: Implement.** Select the Map itself (`state.flights`). Derive `airlineOptions` with `useMemo(() => …, [flightsMap])` from `flightsMap.values()`.
- [ ] **Step 4: Run.** The test should PASS, and `tests/components/Shell.test.tsx` should still PASS.
- [ ] **Step 5: Commit.** `git commit -m "fix: stable zustand selector in FilterPanel"`

### Task 4: Repo hygiene, source `index.html`, Pages base path

**Files:**
- Delete (git rm): `.vite/`, `cesium/`, `assets/`, `BLANK_PAGE_TROUBLESHOOTING.md`.
- Replace: `index.html` with the source version from `d62ae0e`. Change the favicon href to `%BASE_URL%favicon.ico`.
- Move: `aeroglobe plan.docx` → `docs/aeroglobe-plan-v1.docx`.
- Modify: `.gitignore` (add `.vite/`, `/cesium/`, `/assets/`, `public/data/`, `data-out/`).
- Modify: `vite.config.ts`. `base: process.env.VITE_BASE ?? '/'`. Remove the `define.CESIUM_BASE_URL` block, because vite-plugin-cesium derives it from `base`.
- Modify: `package.json`. Remove `react-spring`, `node-fetch` and `gh-pages`, and the `deploy` script. Run `npm install` to update the lockfile.

- [ ] **Step 1: Make the changes listed.** Run `git rm -r --cached` then delete for the build dirs. Run `git show d62ae0e:index.html > index.html`.
- [ ] **Step 2: Verify the dev entry.** Run `timeout 15 npx vite --port 5199 & sleep 8; curl -s localhost:5199/ | grep -c 'src/main.tsx'`. Expected: `1`.
- [ ] **Step 3: Verify the Pages build paths.** Run `VITE_BASE=/aeroglobe/ npm run build && grep -o '/aeroglobe/[a-z]*/' dist/index.html | sort -u && grep -rho 'aeroglobe/cesium' dist/index.html dist/assets/*.js | head -1`.
  - Expected: `/aeroglobe/assets/` is listed and `aeroglobe/cesium` is found.
  - If the plugin does not emit it, set `define: { CESIUM_BASE_URL: JSON.stringify(\`${base}cesium\`) }` with `base` from the same env, and re-run.
- [ ] **Step 4: Verify the full suite.** `npm run lint && npm test && npm run build` should all PASS. `git ls-files | wc -l` should be under 120.
- [ ] **Step 5: Commit.** `git commit -m "chore: purge committed build output, restore source index.html, configurable base"`

### Task 5: Globe renders without an Ion token

**Files:**
- Create: `src/globe/ionToken.ts`
- Modify: `src/globe/GlobeViewer.tsx:20-60`
- Test: `tests/unit/ionToken.test.ts`

**Interfaces:**
- Produces: `resolveIonToken(raw: string | undefined): string | null`. Returns `null` for `undefined`, an empty or whitespace string, or any value starting with `your_`. Otherwise it returns the trimmed value.

- [ ] **Step 1: Write the failing test.** Cases: `undefined → null`, `'' → null`, `'  ' → null`, `'your_cesium_ion_token_here' → null`, `' abc.def '` → `'abc.def'`.
- [ ] **Step 2: Run.** `npx vitest run tests/unit/ionToken.test.ts` should FAIL (module missing).
- [ ] **Step 3: Implement.** Write `resolveIonToken`, then restructure `GlobeViewer`:
  - Create the `Viewer` synchronously with:
    - `baseLayer: new ImageryLayer(new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }))`
    - the default ellipsoid terrain
    - the same widget flags
  - Keep the scene setup.
  - Then, only if the token resolves:
    - Set `Ion.defaultAccessToken`.
    - `createWorldTerrainAsync().then(t => { if (!viewer.isDestroyed()) viewer.terrainProvider = t; })`.
    - `ImageryLayer.fromWorldImagery({})` replaces layer 0.
    - Catch both promises: log one `console.warn` and keep OSM.
  - The cleanup destroys the viewer it created, which makes it safe under StrictMode.
- [ ] **Step 4: Run.** `npx vitest run tests/unit/ionToken.test.ts` should PASS. `npm run build` should PASS.
- [ ] **Step 5: Manual check.** Run `npm run dev` with `VITE_CESIUM_ION_TOKEN` unset. Expected: an OSM globe and no error overlay. Note the result in the PR.
- [ ] **Step 6: Commit.** `git commit -m "fix(globe): render with OSM imagery when no Ion token"`

### Task 6: Camera flies only on selection change

**Files:**
- Modify: `src/hooks/useGlobe.ts:16-56`
- Test: `tests/hooks/useGlobe.test.tsx`

- [ ] **Step 1: Write the failing test.**
  - `vi.mock` the modules `../../src/globe/{entities,layers,paths,camera}` with `vi.fn()` exports.
  - Build the fake viewer as `{ screenSpaceEventHandler: { setInputAction: vi.fn(), removeInputAction: vi.fn() } } as unknown as Viewer`.
  - Test `flies once per selection, not per poll`:
    1. `setFlights([A])`, then `selectFlight('a')`, then `renderHook(() => useGlobe(viewer))`.
    2. In `act`, call `setFlights([{...A, latitude: A.latitude + 0.1}])` twice.
    3. Expect `flyToFlight` to have been called 1 time.
    4. In `act`, add B and call `selectFlight('b')`. Expect 2 calls.
  - Test `clears paths when the selected flight disappears`:
    1. `setFlights([])` after selecting A.
    2. Expect `clearFlightPaths` to have been called, with no new `flyToFlight` call.
- [ ] **Step 2: Run.** `npx vitest run tests/hooks/useGlobe.test.tsx` should FAIL (flyToFlight called 3 times).
- [ ] **Step 3: Implement.** Split the selection effect:
  - Effect A, deps `[selectedFlightId, viewer]`, flies using the current `selectedFlight` read through a ref.
  - Effect B, deps `[selectedFlightId, hasDetail, viewer]`, draws or clears the path. `hasDetail = Boolean(selectedFlight?.detail)`.
- [ ] **Step 4: Run.** The test should PASS, and `npm test` should be all green.
- [ ] **Step 5: Commit.** `git commit -m "fix(globe): fly camera on selection change only"`

### Task 7: Deploy workflow, CI typecheck, docs

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/ci.yml` (add `- run: npx tsc -p tsconfig.json --noEmit` before tests, and add `workflow_call:` to `on`)
- Modify: `README.md` (deploy section, env file, data-source section), `.env.example` (add `CLIENT_ORIGIN=http://localhost:5173`)
- Modify: `IMPLEMENTATION_SUMMARY.md`. Prepend a one-paragraph "Superseded by docs/superpowers/specs/2026-10-14-aeroglobe-historical-first-design.md" note.

**Interfaces:**
- Produces: `deploy.yml` with these jobs. M1 extends `build` with a data-fetch step.
  - Triggers: `push: branches: [main]`, `workflow_dispatch`, `workflow_call`.
  - Permissions: `pages: write`, `id-token: write`, `contents: read`.
  - Concurrency: `group: pages, cancel-in-progress: false`.
  - Job `build`:
    1. checkout
    2. setup-node 20 with npm cache
    3. `npm ci`
    4. `npm run build` with env `VITE_BASE: /aeroglobe/` and `VITE_CESIUM_ION_TOKEN: ${{ secrets.VITE_CESIUM_ION_TOKEN }}`
    5. `actions/upload-pages-artifact@v3` with `path: dist`
  - Job `deploy`: `needs: build`, `environment: github-pages`, `actions/deploy-pages@v4`.

- [ ] **Step 1: Write the workflows and docs as specified.** The README must state:
  - Pages source is **GitHub Actions**, not a branch.
  - The secret `VITE_CESIUM_ION_TOKEN` is optional (OSM fallback).
  - Env goes in `.env.local`.
  - Until M1 lands, the server falls back to sample data.
- [ ] **Step 2: Validate.** `npx --yes yaml-lint .github/workflows/*.yml` (or `python3 -c "import yaml,sys;[yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/*.yml`) should exit 0. Then `npm run lint && npm test && npm run build` should PASS.
- [ ] **Step 3: Commit and push.** Commit with `git commit -m "ci: add Pages deploy workflow and typecheck; refresh docs"`, then push the branch and open the PR.
- [ ] **Step 4: Post-merge check (record in the PR).**
  1. Settings → Pages → Source: GitHub Actions.
  2. `deploy.yml` succeeds.
  3. `https://<owner>.github.io/aeroglobe/` shows a globe, and the network tab shows no 404s for `/aeroglobe/cesium/Workers/*`.
