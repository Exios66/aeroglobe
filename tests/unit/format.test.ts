import { describe, expect, it } from 'vitest';
import {
  formatAltitude,
  formatFlightCount,
  formatHeading,
  formatLocalTime,
  formatSpeed,
  formatUtcTime,
} from '../../src/utils/format';

describe('format utils', () => {
  it('formats altitude and ground state', () => {
    expect(formatAltitude(0)).toBe('Ground');
    expect(formatAltitude(10668)).toContain('ft');
  });

  it('formats speed and heading', () => {
    expect(formatSpeed(250)).toContain('kts');
    expect(formatHeading(90)).toContain('E');
  });

  it('formats flight count', () => {
    expect(formatFlightCount(42)).toBe('42 aircraft');
  });

  it('formats departure and arrival times in UTC, including offset timestamps', () => {
    expect(formatUtcTime('2026-10-12T08:45:00-05:00')).toBe('13:45 UTC');
    expect(formatUtcTime(new Date('2026-10-12T23:30:00Z'))).toBe('23:30 UTC');
    expect(formatUtcTime(0)).toBe('00:00 UTC');
    expect(formatUtcTime('invalid')).toBe('Unknown');
    expect(formatUtcTime(null)).toBe('Unknown');
  });

  it('formats local times in the airport time zone and degrades when the zone is unknown', () => {
    expect(formatLocalTime('2026-10-12T13:45:00Z', 'America/New_York')).toBe('09:45 (America/New_York local)');
    expect(formatLocalTime('2026-10-12T13:45:00Z', 'Europe/London')).toBe('14:45 (Europe/London local)');
    expect(formatLocalTime(null, 'Europe/London')).toBe('Local time n/a');
    expect(formatLocalTime('2026-10-12T13:45:00Z', null)).toBe('Local time n/a');
    expect(formatLocalTime('2026-10-12T13:45:00Z', 'Not/AZone')).toBe('Unknown');
    expect(formatLocalTime('invalid', 'Europe/London')).toBe('Unknown');
  });
});
