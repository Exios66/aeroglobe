import {
  Camera,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  HeightReference,
  Math as CesiumMath,
  NearFarScalar,
  ExtrapolationType,
  JulianDate,
  SampledPositionProperty,
  VerticalOrigin,
  type Entity,
  type Viewer,
} from 'cesium';
import type { Flight } from '../types/flight';
import { metersToFeet } from '../utils/geo';
import { getAircraftDartSvg, getAircraftDotSvg, getAircraftSvg } from '../utils/aircraftIcon';
import { lodForAircraft, lodScale, type IconLod, resolveIconLod } from './iconLod';

const FLIGHT_ENTITY_PREFIX = 'flight-';
const aircraftImages = new Map<string, string>();
const entityTracks = new WeakMap<Entity, Flight['track']>();
const entityStates = new WeakMap<Entity, { flight: Flight; selected: boolean; labelVisible: boolean; lod: IconLod }>();

/** Keeps a sampled position property in sync with the flight's recorded track, or a fixed position when none exists. */
function setRecordedPosition(entity: Entity, flight: Flight): void {  if (flight.track && flight.track.length > 1) {
    if (entityTracks.get(entity) === flight.track) return;
    const position = new SampledPositionProperty();
    position.forwardExtrapolationType = ExtrapolationType.HOLD;
    position.backwardExtrapolationType = ExtrapolationType.HOLD;
    position.addSamples(
      flight.track.map((point) => JulianDate.fromDate(new Date(point.timestamp * 1000))),
      flight.track.map((point) => Cartesian3.fromDegrees(point.longitude, point.latitude, point.altitude)),
    );
    entity.position = position;
    entityTracks.set(entity, flight.track);
  } else {
    entity.position = new ConstantPositionProperty(Cartesian3.fromDegrees(flight.longitude, flight.latitude, flight.baroAltitude ?? 0));
  }
}

/** The Cesium entity id for an aircraft (`flight-<icao24>`). */
function getEntityId(icao24: string): string {
  return `${FLIGHT_ENTITY_PREFIX}${icao24}`;
}

function svgForLod(lod: IconLod, altitudeFeetOrBand: number, selected: boolean): string {
  switch (lod) {
    case 'dot':
      return getAircraftDotSvg(altitudeFeetOrBand, selected);
    case 'dart':
      return getAircraftDartSvg(altitudeFeetOrBand, selected);
    case 'plane':
      return getAircraftSvg(altitudeFeetOrBand, selected);
  }
}

/** The cached LOD-appropriate data-URI billboard for a flight, keyed by tier, band, and selection. */
function getImage(flight: Flight, selectedFlightId: string | null, lod: IconLod): string {
  const feet = metersToFeet(flight.baroAltitude);
  const altitudeBand = feet < 10000 ? 0 : feet < 30000 ? 10000 : 30000;
  const selected = selectedFlightId === flight.icao24;
  const key = `${lod}:${altitudeBand}:${selected}`;
  if (!aircraftImages.has(key)) {
    aircraftImages.set(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgForLod(lod, altitudeBand, selected))}`);
  }
  return aircraftImages.get(key)!;
}

export function getFlightIdFromEntity(entity: Entity | undefined): string | null {
  if (!entity || typeof entity.id !== 'string' || !entity.id.startsWith(FLIGHT_ENTITY_PREFIX)) {
    return null;
  }

  return entity.id.replace(FLIGHT_ENTITY_PREFIX, '');
}

/**
 * The LOD decision uses the density actually on screen: `visibleCount` counts flights inside
 * the camera's view rectangle, not the total loaded catalog (which is independent of zoom).
 */
function countInViewport(viewer: Viewer, flights: Flight[]): number {  if (flights.length <= 1500) return flights.length;
  const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
  if (!rect) return flights.length;
  let visible = 0;
  for (const flight of flights) {
    const lon = CesiumMath.toRadians(flight.longitude);
    const lat = CesiumMath.toRadians(flight.latitude);
    if (lon >= rect.west && lon <= rect.east && lat >= rect.south && lat <= rect.north) {
      visible++;
      if (visible > 12000) break;
    }
  }
  return visible;
}

export function syncAircraftEntities(
  viewer: Viewer,
  flights: Flight[],
  selectedFlightId: string | null,
): void {
  const nextIds = new Set(flights.map((flight) => getEntityId(flight.icao24)));
  const cameraHeight = viewer.camera.positionCartographic.height;
  const lod = resolveIconLod(cameraHeight, countInViewport(viewer, flights));
  // Labels belong to the full plane LOD: in dot/dart mode they are noise that buries shapes.
  const labelVisible = cameraHeight < 2_000_000 && lod === 'plane';

  [...viewer.entities.values].forEach((entity) => {
    if (
      typeof entity.id === 'string' &&
      entity.id.startsWith(FLIGHT_ENTITY_PREFIX) &&
      !nextIds.has(entity.id)
    ) {
      viewer.entities.remove(entity);
    }
  });

  flights.forEach((flight) => {
    const entityId = getEntityId(flight.icao24);
    const position = Cartesian3.fromDegrees(flight.longitude, flight.latitude, flight.baroAltitude ?? 0);
    const existing = viewer.entities.getById(entityId);
    const selected = selectedFlightId === flight.icao24;
    const entityLod = lodForAircraft(lod, selected);

    if (existing) {
      const previous = entityStates.get(existing);
      if (previous?.flight === flight && previous.selected === selected && previous.labelVisible === labelVisible && previous.lod === entityLod) return;
      setRecordedPosition(existing, flight);
      if (existing.billboard) {
        existing.billboard.image = new ConstantProperty(getImage(flight, selectedFlightId, entityLod));
        existing.billboard.scale = new ConstantProperty(lodScale(entityLod));
        // Retained entities keep the scaling they were created with — refresh it with the LOD.
        existing.billboard.scaleByDistance = new ConstantProperty(
          entityLod === 'dot'
            ? new NearFarScalar(200_000, 0.85, 10_000_000, 0.45)
            : new NearFarScalar(200_000, 0.95, 10_000_000, 0.35),
        );
        existing.billboard.rotation = new ConstantProperty(
          -CesiumMath.toRadians(flight.trueTrack ?? 0),
        );
      }
      if (existing.label) {
        existing.label.text = new ConstantProperty(
          flight.callsign?.trim() || flight.icao24.toUpperCase(),
        );
        existing.label.show = new ConstantProperty(labelVisible);
      }
      entityStates.set(existing, { flight, selected, labelVisible, lod: entityLod });
      return;
    }

    const entity = viewer.entities.add({
      id: entityId,
      position,
      billboard: {
        image: getImage(flight, selectedFlightId, entityLod),
        scale: lodScale(entityLod),
        rotation: -CesiumMath.toRadians(flight.trueTrack ?? 0),
        verticalOrigin: VerticalOrigin.CENTER,
        heightReference: HeightReference.NONE,
        eyeOffset: new Cartesian3(0, 0, -40),
        scaleByDistance: entityLod === 'dot'
          ? new NearFarScalar(200_000, 0.85, 10_000_000, 0.45)
          : new NearFarScalar(200_000, 0.95, 10_000_000, 0.35),
      },
      label: {
        text: flight.callsign?.trim() || flight.icao24.toUpperCase(),
        font: '12px Inter, system-ui, sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        showBackground: true,
        backgroundColor: Color.fromCssColorString('#0f172a').withAlpha(0.75),
        pixelOffset: new Cartesian2(0, -28),
        show: labelVisible,
      },
    });
    setRecordedPosition(entity, flight);
    entityStates.set(entity, { flight, selected, labelVisible, lod: entityLod });
  });
}
