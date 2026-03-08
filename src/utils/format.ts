import { format, formatDistanceToNowStrict } from 'date-fns';

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
  if (!value) {
    return 'Unknown';
  }

  return `${format(new Date(value), 'HH:mm')} UTC`;
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
