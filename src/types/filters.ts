import type { FlightStatus } from './flight';

export type RegionCode =
  | 'north-america'
  | 'south-america'
  | 'europe'
  | 'asia'
  | 'africa'
  | 'oceania'
  | 'middle-east';

export interface FilterState {
  airlines: string[];
  regions: RegionCode[];
  altitudeRange: [number, number];
  aircraftTypes: string[];
  statuses: FlightStatus[];
  searchQuery: string;
}
