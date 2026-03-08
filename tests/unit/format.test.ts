import { describe, expect, it } from 'vitest';
import {
  formatAltitude,
  formatFlightCount,
  formatHeading,
  formatSpeed,
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
});
