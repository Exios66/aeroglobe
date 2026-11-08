import { create } from 'zustand';
import type { AirlineRow, AirportRow, FlightRecord } from '../services/staticData';

/**
 * Reference data for the loaded catalog day: the segmented flights index plus the airport
 * and airline reference rows. Populated by `useFlightData` after each static load and
 * consumed by the route search and detail panels.
 */
interface CatalogStoreState {
  records: FlightRecord[];
  airports: Map<string, AirportRow>;
  airlines: Map<string, AirlineRow>;
  dayDate: string | null;
  setIndex: (
    records: FlightRecord[],
    airports: Map<string, AirportRow>,
    airlines: Map<string, AirlineRow>,
    dayDate: string | null,
  ) => void;
}

export const useCatalogStore = create<CatalogStoreState>((set) => ({
  records: [],
  airports: new Map(),
  airlines: new Map(),
  dayDate: null,
  setIndex: (records, airports, airlines, dayDate) => set({ records, airports, airlines, dayDate }),
}));
