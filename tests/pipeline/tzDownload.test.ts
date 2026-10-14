// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pickTzAsset } from '../../pipeline/tzDownload';

const a = (name: string) => ({ name, browser_download_url: `https://example.test/${name}` });

describe('pickTzAsset', () => {
  it('prefers the -now variant', () => {
    const assets = [a('timezones-with-oceans.geojson.zip'), a('timezones-with-oceans-now.geojson.zip')];
    expect(pickTzAsset(assets)?.name).toBe('timezones-with-oceans-now.geojson.zip');
  });
  it('falls back to the plain with-oceans asset', () => {
    expect(pickTzAsset([a('other.zip'), a('timezones-with-oceans.geojson.zip')])?.name).toBe('timezones-with-oceans.geojson.zip');
  });
  it('returns null when neither exists', () => {
    expect(pickTzAsset([a('timezones.geojson.zip')])).toBeNull();
  });
});
