# Departure fallback data

Aggregated BTS Detailed Statistics Departures in a small JSON format for visualization and parser fallback.

## JSON files (one per origin + carrier)

- **las-wn-departures-fallback.json** — LAS (Harry Reid), Southwest (WN), 2020–2025
- **ord-wn-departures-fallback.json** — ORD (O'Hare), Southwest (WN), 2016–2025
- **ord-f9-departures-fallback.json** — ORD (O'Hare), Frontier (F9), 2024–2025

## Converting more CSVs to JSON

From the project root:

```bash
python3 scripts/extract-las-departures-fallback.py "/path/to/Detailed_Statistics_Departures.csv"
```

Output is written to `data/{origin}-{carrier}-departures-fallback.json`. Origin and carrier are read from the CSV header.

## Parsing JSON or CSV in the app

Use the parser so the system accepts either format:

```js
import { parseDeparturesFallback, parseDeparturesFallbackFromJson, parseDeparturesFallbackFromCsv } from "./data/parse-departures-fallback.js";

// Prefer JSON (small, fast)
const data = await fetch("/data/ord-wn-departures-fallback.json").then((r) => r.json());
const fallback = parseDeparturesFallback(data);

// Or parse CSV text (e.g. from upload or file)
const fallbackFromCsv = parseDeparturesFallbackFromCsv(csvText);
```

Both return the same shape: `{ meta, routes, byMonth, byHour }`. Use `meta.origin` and `meta.carrier` to identify the dataset.
