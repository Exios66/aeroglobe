// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../../server/env';

const KEY = 'AEROGLOBE_TEST_KEY';

describe('loadEnv', () => {
  let dir: string;

  afterEach(() => {
    delete process.env[KEY];
    if (dir) rmSync(dir, { recursive: true, force: true });
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
