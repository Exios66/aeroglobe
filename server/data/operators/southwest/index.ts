/**
 * Southwest Airlines (WN) fallback data.
 * Organized by departure airport: ord/ (Chicago O'Hare), las/ (Las Vegas).
 */
export { getSouthwestOrdFallbackStates, getSouthwestOrdFlightDetail } from './ord/parser';
export { getSouthwestLasFallbackStates, getSouthwestLasFlightDetail } from './las/parser';
