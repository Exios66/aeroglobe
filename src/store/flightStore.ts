import { create } from 'zustand';
import type { Flight, FlightDetail } from '../types/flight';

interface FlightStoreState {
  flights: Map<string, Flight>;
  selectedFlightId: string | null;
  lastUpdated: Date | null;
  setFlights: (states: Flight[], updatedAt?: Date | null) => void;
  setFlightDetail: (icao24: string, detail: FlightDetail) => void;
  selectFlight: (icao24: string | null) => void;
}

export const useFlightStore = create<FlightStoreState>((set) => ({
  flights: new Map(),
  selectedFlightId: null,
  lastUpdated: null,
  setFlights: (states, updatedAt) =>
    set((state) => {
      const next = new Map<string, Flight>();
      for (const flight of states) {
        if (!Number.isFinite(flight.longitude) || !Number.isFinite(flight.latitude)) {
          continue;
        }

        const existing = state.flights.get(flight.icao24);
        next.set(flight.icao24, {
          ...flight,
          detail: flight.detail ?? existing?.detail,
          track: flight.track ?? existing?.track,
        });
      }
      return { flights: next, lastUpdated: updatedAt === undefined ? new Date() : updatedAt };
    }),
  setFlightDetail: (icao24, detail) =>
    set((state) => {
      const current = state.flights.get(icao24);
      if (!current) {
        return state;
      }
      const next = new Map(state.flights);
      next.set(icao24, { ...current, detail });
      return { flights: next };
    }),
  selectFlight: (selectedFlightId) => set({ selectedFlightId }),
}));
