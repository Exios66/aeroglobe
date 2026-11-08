import { formatDistanceToNowStrict } from 'date-fns';

export function formatAltitude(valueMeters: number | null | undefined): string {
  if (valueMeters == null) {
    return 'Unknown';
  }

  const feet = Math.round(valueMeters * 3.28084);
  if (feet <= 0) {
    return 'Ground';
  }

  return `${feet.toLocaleString()} ft (FL${Math.round(feet / 100)})`;
}

export function formatSpeed(valueMs: number | null | undefined): string {
  if (valueMs == null) {
    return 'Unknown';
  }

  return `${Math.round(valueMs * 1.94384)} kts`;
}

export function formatHeading(value: number | null | undefined): string {
  if (value == null) {
    return 'Unknown';
  }

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(value / 45) % 8;
  return `${Math.round(value)}° ${directions[index]}`;
}

export function formatUtcTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return 'Unknown';
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.toISOString().slice(11, 16)} UTC` : 'Unknown';
}

/**
 * Formats an instant as the wall-clock time in an airport's IANA time zone, e.g.
 * "06:45 (America/New_York local)". Returns "Local time n/a" when the zone is unknown
 * and "Unknown" for unparsable values or invalid time zones.
 */
export function formatLocalTime(value: string | number | Date | null | undefined, tz: string | null | undefined): string {
  if (value === null || value === undefined || value === '' || !tz) {
    return 'Local time n/a';
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return 'Unknown';
  }

  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    return `${formatted} (${tz} local)`;
  } catch {
    return 'Unknown';
  }
}

export function formatRelativeTime(value: Date | null): string {
  if (!value) {
    return 'Never';
  }

  return `${formatDistanceToNowStrict(value)} ago`;
}

export function formatFlightCount(count: number): string {
  return `${count.toLocaleString()} aircraft`;
}
