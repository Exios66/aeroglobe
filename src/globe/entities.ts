import {
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
import { getAircraftSvg } from '../utils/aircraftIcon';

const FLIGHT_ENTITY_PREFIX = 'flight-';
const aircraftImages = new Map<string, string>();
const entityTracks = new WeakMap<Entity, Flight['track']>();
const entityStates = new WeakMap<Entity, { flight: Flight; selected: boolean; labelVisible: boolean }>();

function setRecordedPosition(entity: Entity, flight: Flight): void {
  if (flight.track && flight.track.length > 1) {
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

function getEntityId(icao24: string): string {
  return `${FLIGHT_ENTITY_PREFIX}${icao24}`;
}

function getImage(flight: Flight, selectedFlightId: string | null): string {
  const feet = metersToFeet(flight.baroAltitude);
  const altitudeBand = feet < 10000 ? 0 : feet < 30000 ? 10000 : 30000;
  const selected = selectedFlightId === flight.icao24;
  const key = `${altitudeBand}:${selected}`;
  if (!aircraftImages.has(key)) {
    const svg = getAircraftSvg(altitudeBand, selected);
    aircraftImages.set(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  }
  return aircraftImages.get(key)!;
}

export function getFlightIdFromEntity(entity: Entity | undefined): string | null {
  if (!entity || typeof entity.id !== 'string' || !entity.id.startsWith(FLIGHT_ENTITY_PREFIX)) {
    return null;
  }

  return entity.id.replace(FLIGHT_ENTITY_PREFIX, '');
}

export function syncAircraftEntities(
  viewer: Viewer,
  flights: Flight[],
  selectedFlightId: string | null,
): void {
  const nextIds = new Set(flights.map((flight) => getEntityId(flight.icao24)));
  const labelVisible = viewer.camera.positionCartographic.height < 2_000_000;

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

    if (existing) {
      const previous = entityStates.get(existing);
      if (previous?.flight === flight && previous.selected === selected && previous.labelVisible === labelVisible) return;
      setRecordedPosition(existing, flight);
      if (existing.billboard) {
        existing.billboard.image = new ConstantProperty(getImage(flight, selectedFlightId));
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
      entityStates.set(existing, { flight, selected, labelVisible });
      return;
    }

    const entity = viewer.entities.add({
      id: entityId,
      position,
      billboard: {
        image: getImage(flight, selectedFlightId),
        scale: 0.6,
        rotation: -CesiumMath.toRadians(flight.trueTrack ?? 0),
        verticalOrigin: VerticalOrigin.CENTER,
        heightReference: HeightReference.NONE,
        eyeOffset: new Cartesian3(0, 0, -40),
        scaleByDistance: new NearFarScalar(200_000, 0.95, 10_000_000, 0.35),
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
    entityStates.set(entity, { flight, selected, labelVisible });
  });
}
