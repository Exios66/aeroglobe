// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../server/env';

const KEY = 'AEROGLOBE_TEST_KEY';

describe('loadEnv', () => {
  let dir: string;

  beforeEach(() => vi.stubEnv(KEY, undefined));

  afterEach(() => {
    vi.unstubAllEnvs();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('preserves process environment variables over both files', () => {
    dir = mkdtempSync(join(tmpdir(), 'aeroglobe-env-'));
    writeFileSync(join(dir, '.env.local'), `${KEY}=local\n`);
    writeFileSync(join(dir, '.env'), `${KEY}=base\n`);
    vi.stubEnv(KEY, 'injected');
    loadEnv(dir);
    expect(process.env[KEY]).toBe('injected');
  });

  it('loads the base file when the local file is missing', () => {
    dir = mkdtempSync(join(tmpdir(), 'aeroglobe-env-'));
    writeFileSync(join(dir, '.env'), `${KEY}=base\n`);
    loadEnv(dir);
    expect(process.env[KEY]).toBe('base');
  });

  it('tolerates both files being absent', () => {
    dir = mkdtempSync(join(tmpdir(), 'aeroglobe-env-'));
    expect(() => loadEnv(dir)).not.toThrow();
    expect(process.env[KEY]).toBeUndefined();
  });

  it('loads keys from .env.local when .env is absent', () => {
    dir = mkdtempSync(join(tmpdir(), 'aeroglobe-env-'));
    writeFileSync(join(dir, '.env.local'), `${KEY}=local\n`);
    loadEnv(dir);
    expect(process.env[KEY]).toBe('local');
  });

  it('.env.local wins over .env', () => {
    dir = mkdtempSync(join(tmpdir(), 'aeroglobe-env-'));
    writeFileSync(join(dir, '.env.local'), `${KEY}=local\n`);
    writeFileSync(join(dir, '.env'), `${KEY}=base\n`);
    loadEnv(dir);
    expect(process.env[KEY]).toBe('local');
  });
});
