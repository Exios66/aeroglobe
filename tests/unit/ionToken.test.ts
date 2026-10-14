import { describe, expect, it } from 'vitest';
import { resolveIonToken } from '../../src/globe/ionToken';

describe('resolveIonToken', () => {
  it('returns null for undefined, empty, whitespace and placeholder values', () => {
    expect(resolveIonToken(undefined)).toBeNull();
    expect(resolveIonToken('')).toBeNull();
    expect(resolveIonToken('  ')).toBeNull();
    expect(resolveIonToken('your_cesium_ion_token_here')).toBeNull();
  });

  it('returns the trimmed token otherwise', () => {
    expect(resolveIonToken(' abc.def ')).toBe('abc.def');
  });
});
