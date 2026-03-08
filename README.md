# AeroGlobe

AeroGlobe is a browser-based 3D flight tracking experience built with `React`, `TypeScript`, `CesiumJS`, `Zustand`, and an `Express` API proxy. It renders a live globe, tracks active commercial aircraft, supports search and multi-axis filtering, and provides route-focused detail panels with historical playback controls.

## Deploying to GitHub Pages

**Automatic:** Pushing to `main` runs the [Deploy to GitHub Pages](.github/workflows/deploy.yml) workflow. It builds with the correct base path (`/aeroglobe/`) and publishes the `dist/` folder to the `gh-pages` branch.

**Manual:** Build and push the site yourself (use the base path so assets and Cesium load correctly):

```bash
# Optional: set VITE_CESIUM_ION_TOKEN in .env.local for terrain
VITE_APP_BASE=/aeroglobe/ npm run build && npx gh-pages -d dist
```

In the repo **Settings → Pages**, set **Source** to "Deploy from a branch", branch `gh-pages`, folder `/ (root)`. The site will be at `https://<username>.github.io/aeroglobe/`.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 7, Tailwind CSS |
| Globe | CesiumJS |
| State | Zustand, React Query |
| Backend | Node.js, Express |
| Data | OpenSky Network, AviationStack, Southwest ORD CSV fallback |
| Testing | Vitest, Testing Library |
| CI | GitHub Actions (lint, test, build) |

## Prerequisites

- `Node.js` 20+
- `npm` 10+
- A WebGL-capable browser
- Optional API credentials:
  - Cesium Ion token
  - OpenSky username/password for historical playback
  - AviationStack key for richer route detail

## Environment Variables

Copy `.env.example` to `.env.local` and provide values as needed:

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
- `npm run deploy` builds and pushes the site to the `gh-pages` branch (simple GitHub Pages; no workflow)

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

1. **Cesium Ion** (required for globe imagery): set `VITE_CESIUM_ION_TOKEN`. Without it the globe may not load correctly.
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

When the live OpenSky feed is unavailable or returns no data, the app falls back to **Southwest Airlines Chicago O'Hare (ORD) departures** from the detailed statistics CSV (`server/data/operators/southwest/ord/departures.csv`). A banner appears and the source label shows "Southwest ORD (sample)". Clicking a flight shows route and schedule from the CSV.

## Contributing

1. Create a feature branch from `main`.
2. Run `npm run lint`, `npm test`, and `npm run build`.
3. Open a pull request with a concise summary and test plan.

## License

MIT. See `LICENSE`.