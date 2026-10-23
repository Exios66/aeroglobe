import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cartesian3, EntityCollection, JulianDate, PolylineCollection, SampledPositionProperty, type Viewer } from 'cesium';
import { flightAtTime, playbackBounds } from '../../src/utils/playback';
import { syncFlightTrails, clearFlightTrails, MAX_VISIBLE_TRAILS } from '../../src/globe/trails';
import { syncAircraftEntities } from '../../src/globe/entities';
import type { Flight } from '../../src/types/flight';

beforeEach(() => {
  vi.stubGlobal('ImageBitmap', class {});
  vi.stubGlobal('OffscreenCanvas', class {});
});
afterEach(() => vi.unstubAllGlobals());

const flight: Flight = {
  icao24: 'abc', callsign: 'TEST1', originCountry: '', longitude: -179, latitude: 12,
  baroAltitude: 2000, velocity: 100, trueTrack: 90, onGround: false, lastContact: 120,
  track: [
    { longitude: 179, latitude: 10, altitude: 1000, timestamp: 100 },
    { longitude: -179, latitude: 12, altitude: 2000, timestamp: 120 },
  ],
};

function makeViewer() {
  return {
    entities: new EntityCollection(),
    camera: { positionCartographic: { height: 1_000_000 }, positionWC: Cartesian3.fromDegrees(0, 0, 20_000_000) },
    scene: { primitives: { add: vi.fn((collection: PolylineCollection) => collection), remove: vi.fn() } },
    isDestroyed: () => false,
  };
}

describe('recorded flight playback', () => {
  it('uses recorded bounds and interpolates across the dateline without inventing positions beyond them', () => {
    expect(playbackBounds([flight])).toEqual([100000, 120000]);
    expect(playbackBounds([{ ...flight, track: flight.track!.slice(0, 1) }])).toBeNull();
    const midpoint = flightAtTime(flight, new Date(110000));
    expect(Math.abs(midpoint.longitude)).toBe(180);
    expect(midpoint.latitude).toBe(11);
    expect(midpoint.baroAltitude).toBe(1500);
    expect(flightAtTime(flight, new Date(0)).longitude).toBe(179);
    expect(flightAtTime(flight, new Date(200000)).longitude).toBe(-179);
  });

  it('keeps Cesium sampled positions stable across replay updates and removes all hidden aircraft', () => {
    const viewer = makeViewer();
    const v = viewer as unknown as Viewer;
    syncAircraftEntities(v, [flight, { ...flight, icao24: 'def' }, { ...flight, icao24: 'ghi' }], null);
    const entity = viewer.entities.getById('flight-abc')!;
    expect(entity.position).toBeInstanceOf(SampledPositionProperty);
    const sampled = entity.position;
    const position = sampled!.getValue(JulianDate.fromDate(new Date(110000)));
    expect(position).toBeDefined();
    syncAircraftEntities(v, [flight], 'abc');
    expect(viewer.entities.values.map((item) => item.id)).toEqual(['flight-abc']);
    expect(entity.position).toBe(sampled);
  });

  it('draws clickable recorded trails, emphasizes selection, and removes filtered tracks', () => {
    const viewer = makeViewer();
    const v = viewer as unknown as Viewer;
    syncFlightTrails(v, [flight, { ...flight, icao24: 'single', track: flight.track!.slice(0, 1) }], 'abc');
    const collection = viewer.scene.primitives.add.mock.calls[0][0];
    expect(collection.length).toBe(1);
    expect(collection.get(0).width).toBe(4);
    expect(collection.get(0).id).toEqual({ id: 'flight-abc' });
    expect(collection.get(0).positions).toHaveLength(2);
    syncFlightTrails(v, [], null);
    expect(collection.length).toBe(0);
    clearFlightTrails(v);
    expect(viewer.scene.primitives.remove).toHaveBeenCalledWith(collection);
  });

  it('bounds worldwide trail geometry and always retains the selected flight', () => {
    const viewer = makeViewer();
    const flights = Array.from({ length: MAX_VISIBLE_TRAILS + 3 }, (_, i) => ({ ...flight, icao24: String(i) }));
    syncFlightTrails(viewer as unknown as Viewer, flights, String(MAX_VISIBLE_TRAILS + 2));
    const collection = viewer.scene.primitives.add.mock.calls[0][0];
    expect(collection.length).toBe(MAX_VISIBLE_TRAILS);
    expect(collection.get(0).id).toEqual({ id: `flight-${MAX_VISIBLE_TRAILS + 2}` });
    clearFlightTrails(viewer as unknown as Viewer);
  });
});
