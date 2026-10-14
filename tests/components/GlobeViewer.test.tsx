import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobeViewer } from '../../src/globe/GlobeViewer';

const cesium = vi.hoisted(() => ({
  Viewer: vi.fn(),
  ImageryLayer: Object.assign(vi.fn(), { fromWorldImagery: vi.fn() }),
  OpenStreetMapImageryProvider: vi.fn(),
  createWorldTerrainAsync: vi.fn(),
  Ion: { defaultAccessToken: '' },
}));
const applyDarkSkin = vi.hoisted(() => vi.fn());
vi.mock('cesium', () => cesium);
vi.mock('../../src/globe/layers', () => ({ applyDarkSkin }));

function makeViewer() {
  let destroyed = false;
  const osm = { name: 'osm' };
  const ion = {
    name: 'ion',
    readyEvent: { addEventListener: vi.fn() },
    errorEvent: { addEventListener: vi.fn() },
    imageryProvider: { errorEvent: { addEventListener: vi.fn() } },
  };
  const layers: object[] = [osm];
  return {
    osm, ion,
    scene: { globe: {}, skyAtmosphere: {}, fog: {} },
    terrainProvider: undefined as object | undefined,
    imageryLayers: {
      get: vi.fn((i: number) => layers[i]),
      add: vi.fn((layer: object, i: number) => layers.splice(i, 0, layer)),
      contains: vi.fn((layer: object) => layers.includes(layer)),
      remove: vi.fn((layer: object) => {
        const index = layers.indexOf(layer);
        if (index >= 0) layers.splice(index, 1);
      }),
    },
    isDestroyed: vi.fn(() => destroyed),
    destroy: vi.fn(() => { destroyed = true; }),
  };
}

let viewer: ReturnType<typeof makeViewer>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('VITE_CESIUM_ION_TOKEN', '');
  cesium.Ion.defaultAccessToken = '';
  viewer = makeViewer();
  cesium.Viewer.mockImplementation(function () { return viewer; });
  cesium.ImageryLayer.mockImplementation(function () { return viewer.osm; });
  cesium.ImageryLayer.fromWorldImagery.mockReturnValue(viewer.ion);
  cesium.createWorldTerrainAsync.mockResolvedValue({ name: 'terrain' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GlobeViewer fallback and lifecycle', () => {
  it.each(['', '  ', ' your_cesium_ion_token_here '])('renders OSM without Ion requests for token %j', (token) => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', token);
    const onReady = vi.fn();
    const { unmount } = render(<GlobeViewer onReady={onReady} />);
    expect(cesium.OpenStreetMapImageryProvider).toHaveBeenCalledWith({ url: 'https://tile.openstreetmap.org/' });
    expect(cesium.Viewer).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ baseLayer: viewer.osm }));
    expect(applyDarkSkin).toHaveBeenCalledWith(viewer);
    expect(onReady).toHaveBeenCalledExactlyOnceWith(viewer);
    expect(cesium.createWorldTerrainAsync).not.toHaveBeenCalled();
    expect(cesium.ImageryLayer.fromWorldImagery).not.toHaveBeenCalled();
    unmount();
    expect(onReady).toHaveBeenLastCalledWith(null);
    expect(viewer.destroy).toHaveBeenCalledTimes(1);
  });

  it('keeps OSM underneath Ion imagery and installs resolved terrain', async () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', ' synthetic-token ');
    render(<GlobeViewer />);
    expect(cesium.Ion.defaultAccessToken).toBe('synthetic-token');
    expect(viewer.imageryLayers.add).toHaveBeenCalledWith(viewer.ion, 0);
    expect(viewer.imageryLayers.remove).not.toHaveBeenCalled();
    act(() => viewer.ion.readyEvent.addEventListener.mock.calls[0][0]());
    expect(viewer.imageryLayers.remove).not.toHaveBeenCalled();
    expect(viewer.imageryLayers.contains(viewer.osm)).toBe(true);
    await act(async () => {});
    expect(viewer.terrainProvider).toEqual({ name: 'terrain' });
  });

  it('hides the Ion layer on a tile error after ready so OSM shows through', () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'synthetic-token');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<GlobeViewer />);
    expect(viewer.ion.imageryProvider.errorEvent.addEventListener).not.toHaveBeenCalled();
    act(() => viewer.ion.readyEvent.addEventListener.mock.calls[0][0]());
    act(() => viewer.ion.imageryProvider.errorEvent.addEventListener.mock.calls[0][0]());
    expect(viewer.imageryLayers.remove).toHaveBeenCalledExactlyOnceWith(viewer.ion);
    expect(viewer.imageryLayers.contains(viewer.osm)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('preserves OSM and warns once when both Ion terrain and imagery fail', async () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'synthetic-token');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cesium.createWorldTerrainAsync.mockRejectedValue(new Error('terrain unavailable'));
    render(<GlobeViewer />);
    act(() => viewer.ion.errorEvent.addEventListener.mock.calls[0][0]());
    await act(async () => {});
    expect(viewer.imageryLayers.remove).toHaveBeenCalledExactlyOnceWith(viewer.ion);
    expect(viewer.imageryLayers.contains(viewer.osm)).toBe(true);
    expect(viewer.terrainProvider).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('ignores terrain and imagery completion after unmount', async () => {
    vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'synthetic-token');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let resolveTerrain!: (terrain: object) => void;
    cesium.createWorldTerrainAsync.mockReturnValue(new Promise((resolve) => { resolveTerrain = resolve; }));
    const { unmount } = render(<GlobeViewer />);
    unmount();
    await act(async () => { resolveTerrain({ name: 'late terrain' }); });
    act(() => {
      viewer.ion.readyEvent.addEventListener.mock.calls[0][0]();
      viewer.ion.errorEvent.addEventListener.mock.calls[0][0]();
    });
    expect(viewer.terrainProvider).toBeUndefined();
    expect(viewer.imageryLayers.remove).not.toHaveBeenCalled();
    expect(viewer.destroy).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not destroy an already destroyed viewer during cleanup', () => {
    const { unmount } = render(<GlobeViewer />);
    viewer.destroy();
    unmount();
    expect(viewer.destroy).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new Error('WebGL unavailable'), 'WebGL unavailable'],
    ['unsupported', 'Globe failed to initialize in this browser.'],
  ])('reports initialization failure: %s', (error, message) => {
    cesium.Viewer.mockImplementation(function () { throw error; });
    const onReady = vi.fn();
    render(<GlobeViewer onReady={onReady} />);
    expect(screen.getByText(`Globe failed to load. ${message}`)).toBeInTheDocument();
    expect(onReady).toHaveBeenCalledExactlyOnceWith(null);
    expect(cesium.createWorldTerrainAsync).not.toHaveBeenCalled();
  });
});
