# AeroGlobe Hillclimb — autoresearch configuration

This file adapts the **autoresearch** skill (`.claude/skills/autoresearch/`, MIT, uditgoenka/autoresearch) to this repository. It is the single source of truth for the standing goal, the mechanical metric, and the backlog. When you invoke `/autoresearch` in this repo, feed it the `Goal` / `Metric` / `Verify` blocks below verbatim.

## Goal

> Turn AeroGlobe into a complete, hardened, polished flight-tracking app: implement **every** feature laid out in `docs/superpowers/specs/2026-10-14-aeroglobe-historical-first-design.md` and promised by `README.md`, keep the verification suite green, and climb quality until the backlog is empty and the suite stays green for a full cycle.

Archetype: `ship-ready` + `build-feature` (orchestrator loop).

## Metric & Verify (mechanical, run in this order)

The floor. Every iteration **must** pass these before a change is kept:

```bash
npm run lint                 # exit 0, no errors
npx tsc -p tsconfig.json     # exit 0 (typecheck incl. tests/pipeline via configs)
npm test                     # all test files pass
DATA_SOURCE=fixtures npm run build     # exit 0 (offline-deterministic build)
npm run build:check          # exit 0 (built assets, Cesium files, trails verified)
```

Keep rule: keep a change only if all five pass and it advances the backlog (a kept improvement may never green the floor by deleting a planned feature). Discard otherwise (restore via git before continuing). Session artifacts and iteration logs go under `autoresearch/` (gitignored).

## Full verify (run at every plateau / before closing the session)

In addition to the floor: grep-verified backlog items marked `done` still hold their done-when condition, and `npm audit --omit=dev` has no high-severity findings (or the finding is documented below with a mitigation).

## Backlog (climb order: correctness → features → hardening → polish)

Derived from the historical-first spec §9 milestones, the audit in §2, and README promises. Anything already implemented is listed with its status; unimplemented items are the climb targets. A milestone item is `done` only when its done-when condition is checked off in a results log.

| # | Item | Source | Done-when | Status |
|---|------|--------|-----------|--------|
| 1 | Verification floor green (lint, tsc, tests, build, build:check) | CI contract | All five commands exit 0 from a clean tree | done 2026-11-08 |
| 2 | Time-zone overlay (`tzLayer.ts`): toggleable simplified TopoJSON polygons; route arcs show tick marks where they cross boundaries; hover shows zone + local time | spec 6.4/M3, criterion 6 | Toggle renders zones on the globe; crossing ticks visible on a route arc | todo |
| 3 | Route search: explicit `AAA-BBB` / `AAA to BBB` / `AAA→BBB` parsing over the loaded flight index; airport search by ICAO/IATA/city | spec 6.5/M3, criterion 4 | Querying `ORD-DEN` on the loaded day routes/flights match and fly-to works | todo |
| 4 | Per-aircraft history (flights index): a panel listing every flight of the airframe in loaded data; choosing one replays it | spec 6.5/M4, criterion 5 | Panel lists flights of selected airframe across loaded day(s); click seeks + replays | todo |
| 5 | Local + UTC times in FlightCard: dep/arr times shown in UTC and in local time at each end | spec criterion 3 | FlightCard shows UTC and both local times | todo |
| 6 | Personal logbook (IndexedDB via `idb`): entries, arcs for all entries, stats (count/km/hours/airports/countries/longest), JSON+CSV import/export, link-to-historical-flight replay | spec 6.7/M6 | Add/edit/delete entries; arcs + stats render; export round-trips; link replays track | todo |
| 7 | Hardening: error states for catalog/chunk fetch failures listed in spec §7 (retry screen, per-hour unavailability marks, no fabricated positions) | spec §7 | Each listed failure mode has a test or verified behaviour | todo |
| 8 | Accessibility polish: full-flow keyboard nav, focus management on panels, `inert` on closed side panels | spec 6.5 | Panels are reachable and operable via keyboard; closed panels inert | todo |
| 9 | Live overlay hardening (current live path): verify poller backoff, cached detail behaviour, and bbox validation on server routes | README + spec §7 | Unit tests pin backoff/bbox validation | todo |
| 10 | Documentation truth: README/spec correspond to shipped behaviour; CHANGELOG entry for the climb | repo hygiene | Docs match implementation; changelog updated | todo |

## Protocol notes

- Default invocation: `/autoresearch:fix` for correctness items, then the classic loop with the Goal above, `Iterations: bounded`, until the backlog clears or plateaus with a documented reason.
- Fork-and-flush rounds pull from the backlog order; guided branches take the next unstarted backlog item, random branches pick any item whose done-when is nearest.
- Never auto-approve push/deploy (`gh-pages`, `data` branch, Vercel). Human approval required, per the skill's safety invariants.
- A kept iteration must carry its docs in the same change.
