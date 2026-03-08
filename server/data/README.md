# Data directory layout

Data is organized **by airline operator** and **by airport of departure**.

```
data/
├── index.ts              # Single entry: re-exports shared, mocks, and all operators
├── mockFlights.ts        # Generic mock (used when no operator fallback available)
├── shared/
│   └── airportCoords.ts  # IATA → [lon, lat]; shared across operators
└── operators/
    └── southwest/       # Southwest Airlines (WN)
        ├── index.ts     # getSouthwestOrdFallbackStates(), getSouthwestOrdFlightDetail()
        └── ord/         # Chicago O'Hare departures
            ├── departures.csv
            └── parser.ts
```

- **shared/** – Airport coordinates and other shared reference data.
- **operators/\<operator\>/** – One folder per airline (e.g. `southwest`, `delta`).
- **operators/\<operator\>/\<airport\>/** – One folder per departure airport (e.g. `ord`, `lax`). Each can contain CSVs and a `parser.ts` that turns them into `AircraftState[]` and `FlightDetail`.

To add another operator or airport: add the folder and CSV under `operators/<operator>/<airport>/`, implement the parser, and export from `operators/<operator>/index.ts` and from `data/index.ts`.
