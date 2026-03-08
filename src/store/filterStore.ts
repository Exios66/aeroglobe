import Fuse from 'fuse.js';
import { create } from 'zustand';
import type { FilterState } from '../types/filters';
import type { Flight } from '../types/flight';
import { DEFAULT_FILTERS } from '../utils/constants';
import { getRegionForCoordinates, isWithinAltitudeRange, metersToFeet } from '../utils/geo';

interface FilterStoreState extends FilterState {
  setFilter: (partial: Partial<FilterState>) => void;
  resetFilters: () => void;
  filteredFlights: (flights: Map<string, Flight>) => Flight[];
}

function getAirlineCode(flight: Flight): string {
  return flight.detail?.airlineIata || flight.callsign?.slice(0, 3)?.trim() || 'UNK';
}

export const useFilterStore = create<FilterStoreState>((set, get) => ({
  ...DEFAULT_FILTERS,
  setFilter: (partial) => set(partial),
  resetFilters: () => set({ ...DEFAULT_FILTERS }),
  filteredFlights: (flights) => {
    const state = get();
    let list = Array.from(flights.values());

    if (state.airlines.length > 0) {
      list = list.filter((flight) => state.airlines.includes(getAirlineCode(flight)));
    }

    if (state.regions.length > 0) {
      list = list.filter((flight) => {
        const region = getRegionForCoordinates(flight.longitude, flight.latitude);
        return region ? state.regions.includes(region) : false;
      });
    }

    list = list.filter((flight) => {
      return isWithinAltitudeRange(metersToFeet(flight.baroAltitude), state.altitudeRange);
    });

    if (state.aircraftTypes.length > 0) {
      list = list.filter((flight) => {
        const type = flight.detail?.aircraftType ?? 'Unknown';
        return state.aircraftTypes.includes(type);
      });
    }

    if (state.statuses.length > 0) {
      list = list.filter((flight) => {
        const status = flight.detail?.status ?? (flight.onGround ? 'landed' : 'active');
        return state.statuses.includes(status);
      });
    }

    if (!state.searchQuery.trim()) {
      return list;
    }

    const fuse = new Fuse(list, {
      keys: [
        { name: 'callsign', weight: 0.5 },
        { name: 'detail.flightNumber', weight: 0.7 },
        { name: 'detail.airline', weight: 0.4 },
        { name: 'detail.originIata', weight: 0.5 },
        { name: 'detail.destinationIata', weight: 0.5 },
        { name: 'detail.originCity', weight: 0.3 },
        { name: 'detail.destinationCity', weight: 0.3 },
      ],
      threshold: 0.35,
    });

    return fuse.search(state.searchQuery).map((result) => result.item);
  },
}));
