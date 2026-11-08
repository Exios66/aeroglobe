# PR #74 review dispositions (2026-11-08; iterations 5–6)

Two automated reviewers responded on PR #74: CodeAnt and CodeRabbit. Findings split into
**ours** (fixed in this branch) and **vendored skill files** (upstream — reported, not forked).

## Findings on our code — fixed

| # | Where | Finding | Disposition |
|---|---|---|---|
| 1 | `tests/unit/flightPoller.test.ts:58` | Mock call history survives across tests → count drift | Fixed: `mockReset()` per test (d0fbb08) |
| 2 | `src/search/routeQuery.ts:104` | Index results for unloaded aircraft left an unresolved selection | Fixed: selecting an index-only result now seeks into its departure hour via `seekToFlight` (d0fbb08) — completing the spec "choosing one replays it" path |
| 3 | `server/routes/flights.ts:49` | Repeated `bbox` keys arrive as an array → treated as absent → global fetch | Fixed: array keys answer 400 (d0fbb08) |
| 4 | `src/components/flight/AircraftHistoryPanel.tsx:110` | Async hour load resets playback to hour start, clobbering the sought departure time | Fixed: `pendingSeek {time, playing}` in uiStore, applied by the loader (d0fbb08) |
| 5 | `scripts/install-autoresearch.sh` | `rm` before copy → failed copy leaves a broken install | Fixed: staged temp copy, atomic `mv` replaces, failures leave the previous install intact (d0fbb08); re-run verified on this machine |
| 6 | `docs/autoresearch/RESULTS-2026-11-08.md` | Stale duplicated iteration-1 block inside iteration 4 + wrong backlog ref | Fixed: removed the leftover block, corrected the reference (d0fbb08) |

## Findings on vendored skill files — upstream, not forked

~20 findings target `.claude/.opencode/PROMPT_*` — i.e. the vendored [uditgoenka/autoresearch](https://github.com/uditgoenka/autoresearch) skill files (SKILL.md arbitrator tables, `orchestrate.sh`, `fix.md`/`learn.md`/`ship.md`/`regression.md` protocols, fork-and-flush budget math, security scoring examples). Forking upstream prompt logic would break refreshability — exactly what this install advertises — so the plan is:

1. ✅ Upstream issue filed: https://github.com/uditgoenka/autoresearch/issues/134 — every skill-file finding consolidated with per-file citations.
2. When upstream ships a fix, re-run `scripts/install-autoresearch.sh`; the in-repo copies stay refreshable.

Nothing in those findings affects the hillclimb loop we run here, because the loop's operating contract (HILLCLIMB.md) defines its own floor and predicate.

## Next-up

- tz overlay (#2), logbook (#6), a11y (#8), docs truth (#10)
