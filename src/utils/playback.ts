import type { Flight } from '../types/flight';

/** Seconds of recorded time per second of playback. Matches the historical clock plan. */
export const PLAYBACK_SPEEDS = [1, 10, 60, 300] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 60;

/** Interpolates only within recorded samples; never extrapolates beyond track bounds. */
export function flightAtTime(flight: Flight, time: Date | null): Flight {
  const track = flight.track;
  if (!time || !track?.length) return flight;
  const seconds = time.getTime() / 1000;
  const index = track.findIndex((point) => point.timestamp >= seconds);
  const end = track[index < 0 ? track.length - 1 : index];
  const start = track[Math.max(0, index < 0 ? track.length - 1 : index - 1)];
  const duration = end.timestamp - start.timestamp;
  const fraction = duration > 0 ? Math.max(0, Math.min(1, (seconds - start.timestamp) / duration)) : 0;
  const deltaLongitude = ((end.longitude - start.longitude + 540) % 360) - 180;
  const longitude = ((start.longitude + deltaLongitude * fraction + 540) % 360) - 180;
  const latitude = start.latitude + (end.latitude - start.latitude) * fraction;
  const dy = (end.latitude - start.latitude) * Math.PI / 180;
  const dx = deltaLongitude * Math.PI / 180 * Math.cos(latitude * Math.PI / 180);
  return {
    ...flight,
    longitude,
    latitude,
    baroAltitude: start.altitude + (end.altitude - start.altitude) * fraction,
    trueTrack: dx || dy ? (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360 : flight.trueTrack,
    lastContact: Math.max(track[0].timestamp, Math.min(seconds, track[track.length - 1].timestamp)),
  };
}

export function playbackBounds(flights: Iterable<Flight>): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const flight of flights) {
    if (!flight.track || flight.track.length < 2) continue;
    min = Math.min(min, flight.track[0].timestamp * 1000);
    max = Math.max(max, flight.track[flight.track.length - 1].timestamp * 1000);
  }
  return Number.isFinite(min) && max > min ? [min, max] : null;
}
