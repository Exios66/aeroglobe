# Hillclimb evidence — front-runner screenshots (2026-11-08)

Captured against a `DATA_SOURCE=fixtures` production build served by `npm run preview`,
with the Express API running for the server-side check. Each screenshot evidences a
kept autoresearch iteration; the raw interaction snapshots behind them were verified via
the accessibility tree before capture.

| Front runner | Iteration | Evidence | What it shows |
|---|---|---|---|
| FlightCard UTC + local times | 1 | `it1-flightcard-utc-local-times.png` | UAL2468 card: departure 23:30 UTC + 16:30 (America/Los_Angeles local); arrival degrades honestly to "Local time n/a" when the airport is unknown |
| Route search | 2 | `it2-route-search-ord-den.png` | `ORD-DEN` query returns both day-index flights (UAL123, DAL456) labelled `ORD → DEN` while the previously selected card stays open |
| Aircraft history | 3 | `it3-flightcard-local-times-and-history.png` | DAL456 (two legs): departure 11:00 UTC + 05:00 America/Denver, arrival 12:59 UTC + 05:59 America/Los_Angeles, and "Aircraft history (2)" listing both legs |
| History seek continues | 3 | `it3-history-seek-to-earlier-leg.png` | Clicking the earlier leg moved playback 09:00 → 08:10:00 GMT and the hourly track data follows (the "continues after each experiment" check) |
| Live-path hardening | 4 | `it4-bbox-400-validation.png` | `GET /api/flights/live?bbox=10,91,20,45` → HTTP 400 with the validation message |

Continuation checks recorded at capture time (curl):

```
invalid bbox -> HTTP 400 {"error":"Invalid bbox: expected lon1,lat1,lon2,lat2 with min <= max inside their ranges."}
valid bbox   -> HTTP 200
no bbox      -> HTTP 200
```
