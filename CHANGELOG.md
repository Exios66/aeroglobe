# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project does not yet guarantee semantic versioning — releases track the `gh-pages` deploy cadence.

## [Unreleased] — feature hillclimb 2026-11-08

Two stacked PRs driven by the in-repo autoresearch loop (see `docs/autoresearch/`).

### Added

- **Time-zone overlay** (#74 follow-up): simplified TopoJSON zones draped from the data catalog, boundary outlines, hover chip with local time, and route boundary-tick marks; the camera frames the route when crossings exist. (spec criterion 6)
- **Personal logbook** (spec §6.7): local-first IndexedDB entries, arc visualization, stats (flights/distance/hours/airports/countries/longest), JSON + CSV round-tripping, "Add to logbook" from any flight card.
- **Aircraft history panel**: every indexed flight of an airframe with seek-to-leg replay. (spec criterion 5)
- **Route search**: explicit `AAA-BBB` / `AAA to BBB` / `AAA→BBB` queries against the loaded day's flights index; prefix search over callsign/registration/type/airline; index-only results seek into their departure hour. (spec criterion 4)
- **Airport-local times** in the FlightCard. (spec criterion 3)
- **Accessibility**: inert closed panels, ARIA combobox search, Esc-closable non-modal dialogs, focus management, `prefers-reduced-motion`; hour-chunk failure fallback with unavailable-hour marking and a Retry control on catalog errors; live `bbox` request validation (400).
- **autoresearch infrastructure**: in-repo skill (Claude Code + OpenCode), cross-session installer (`scripts/install-autoresearch.sh`), hillclimb contract `docs/autoresearch/HILLCLIMB.md`, and evidence screenshots in `docs/autoresearch/evidence/`.

### Testing

- Expanded from 402 to 449 tests across 55 suites; the verification floor is `lint → tsc → test → fixtures build → build:check`, exercised by every kept iteration.

## [1.0.0] — 2026-10

Initial release: 3D globe flight tracker (React, TypeScript, CesiumJS, Zustand), historical-first static data pipeline (`pipeline/`), Express dev proxy for OpenSky/AviationStack, snapshot/sample ingests, GitHub Pages deployment, CI (lint/typecheck/test/build) and Pages build verification.

[Unreleased]: https://github.com/Exios66/aeroglobe/compare/main...HEAD
[1.0.0]: https://github.com/Exios66/aeroglobe/releases/tag/v1.0.0
