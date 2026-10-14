# AeroGlobe

AeroGlobe is a browser-based 3D flight tracking experience built with `React`, `TypeScript`, `CesiumJS`, `Zustand`, and an `Express` API proxy. It renders a live globe, tracks active commercial aircraft, supports search and multi-axis filtering, and provides route-focused detail panels with historical playback controls.

## Deploying to GitHub Pages

The site is deployed by the `Deploy` GitHub Actions workflow (`.github/workflows/deploy.yml`) on every push to `main` (or manually via **Run workflow**). GitHub Actions must be enabled for the repository, since CI and deploy both run there.

1. In **Settings → Pages**, set **Source** to **GitHub Actions** (not a branch).
2. Optional: add the repository secret `VITE_CESIUM_ION_TOKEN` (Settings → Secrets and variables → Actions). It is optional; without it the globe falls back to OpenStreetMap imagery.
3. Push to `main`. The site is served at `https://<username>.github.io/aeroglobe/`.

The build sets `VITE_BASE=/aeroglobe/`; local development keeps the default `/`.

The historical-data pipeline (M1) is planned per `docs/superpowers/specs/2026-10-14-aeroglobe-historical-first-design.md`. Until the historical-data milestones (M1/M2) land, the GitHub Pages build shows the globe only, with no aircraft, because the static site has no API server. Locally, `npm run dev:all` serves live OpenSky data or generated sample data.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 7, Tailwind CSS |
| Globe | CesiumJS |
| State | Zustand, React Query |
| Backend | Node.js, Express |
| Data | OpenSky Network, AviationStack, generated sample data fallback |
| Testing | Vitest, Testing Library |
| CI | GitHub Actions (lint, typecheck, test, build, Pages deploy) |

## Prerequisites

- `Node.js` 20+
- `npm` 10+
- A WebGL-capable browser
- Optional API credentials:
  - Cesium Ion token
  - OpenSky username/password for historical playback
  - AviationStack key for richer route detail

## Environment Variables

Copy `.env.example` to `.env.local` (read by both Vite and the server, falling back to `.env`) and provide values as needed:

```bash
cp .env.example .env.local
```

## Local Setup

```bash
npm install
npm run dev:all
```

Services:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## Scripts

- `npm run dev` starts the Vite frontend
- `npm run server` starts the Express API
- `npm run dev:all` runs both services together
- `npm run lint` checks TypeScript and React source
- `npm test` runs unit and component tests
- `npm run build` creates a production build

## Architecture

The frontend polls `/api/flights/live` every 15 seconds, stores aircraft state in `Zustand`, then synchronizes visible flights to Cesium entities. Search and filter UI derive a visible set from the live store, while selected aircraft trigger detail lookups via `/api/flights/:icao24/detail`.

Primary folders:

- `src/` React app, state, hooks, Cesium integration, UI
- `server/` Express app, route handlers, caches, mock/live data access
- `tests/` unit and component coverage

## API Keys

- [Cesium Ion signup](https://ion.cesium.com/signup)
- [OpenSky registration](https://opensky-network.org/index.php?option=com_users&view=registration)
- [AviationStack documentation](https://aviationstack.com/documentation)
- [AeroDataBox on RapidAPI](https://rapidapi.com/aedbx-aedbx/api/aerodatabox)

## Live data verification

After adding real keys to `.env.local`:

1. **Cesium Ion** (optional): set `VITE_CESIUM_ION_TOKEN` for Cesium imagery. Without it the globe uses OpenStreetMap imagery.
2. **OpenSky** (live positions): no key needed for live `/states/all`; set `OPENSKY_USER` and `OPENSKY_PASS` for historical playback.
3. **AviationStack** (route details): set `AVIATIONSTACK_KEY` for flight detail when clicking an aircraft.

Verification steps:

```bash
# Terminal 1: start API
npm run server

# Terminal 2: start frontend
npm run dev
```

- Open `http://localhost:5173`. You should see the globe and, after ~15s, aircraft (live from OpenSky or mock fallback).
- Click an aircraft: FlightCard should appear; with AviationStack key, route/origin/destination and schedule load.
- Use search (e.g. a callsign) and filters (region, altitude, airline) to confirm filtering.
- Use "Timeline" in the top bar to open the 24h scrubber; with OpenSky credentials, moving the scrubber uses historical positions.
- Toggle "Dark/Light skin" and "Filters" / "Flights" sidebars to confirm UI.
- Run `curl -s http://localhost:3001/api/flights/live | head -c 500` to confirm the API returns JSON.

When the live OpenSky feed is unavailable or returns no data, the app falls back to generated sample data. The source label shows "Sample data".

## Contributing

1. Create a feature branch from `main`.
2. Run `npm run lint`, `npm test`, and `npm run build`.
3. Open a pull request with a concise summary and test plan.

## License

MIT. See `LICENSE`.