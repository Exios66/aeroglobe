import type { FilterState, RegionCode } from '../types/filters';

export const DEFAULT_ALTITUDE_RANGE: [number, number] = [0, 45000];
export const DEFAULT_FILTERS: FilterState = {
  airlines: [],
  regions: [],
  altitudeRange: DEFAULT_ALTITUDE_RANGE,
  aircraftTypes: [],
  statuses: [],
  searchQuery: '',
};

export const FLIGHT_POLL_INTERVAL_MS = 15000;
export const RATE_LIMIT_BACKOFF_MS = 60000;
export const SEARCH_DEBOUNCE_MS = 300;

export const REGION_LABELS: Record<RegionCode, string> = {
  'north-america': 'North America',
  'south-america': 'South America',
  europe: 'Europe',
  asia: 'Asia',
  africa: 'Africa',
  oceania: 'Oceania',
  'middle-east': 'Middle East',
};

export const REGION_BOUNDS: Record<RegionCode, { lon: [number, number]; lat: [number, number] }> = {
  'north-america': { lon: [-170, -50], lat: [10, 84] },
  'south-america': { lon: [-90, -30], lat: [-56, 14] },
  europe: { lon: [-12, 40], lat: [35, 72] },
  asia: { lon: [40, 180], lat: [5, 80] },
  africa: { lon: [-20, 55], lat: [-35, 38] },
  oceania: { lon: [110, 180], lat: [-50, 0] },
  'middle-east': { lon: [30, 65], lat: [12, 42] },
};

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'landed', label: 'Landed' },
  { value: 'diverted', label: 'Diverted' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;
