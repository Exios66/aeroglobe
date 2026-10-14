import { describe, expect, it } from 'vitest';
import { shouldPollApi } from '../../src/services/api';

describe('shouldPollApi', () => {
  it('polls in dev regardless of API base URL', () => {
    expect(shouldPollApi({ PROD: false })).toBe(true);
  });

  it('does not poll in a production build without an API base URL', () => {
    expect(shouldPollApi({ PROD: true })).toBe(false);
    expect(shouldPollApi({ PROD: true, VITE_API_BASE_URL: '' })).toBe(false);
  });

  it('polls in a production build with an API base URL', () => {
    expect(shouldPollApi({ PROD: true, VITE_API_BASE_URL: 'https://api.example.com' })).toBe(true);
  });
});
