import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  HeightReference,
  Math as CesiumMath,
  NearFarScalar,
  VerticalOrigin,
  type Entity,
  type Viewer,
} from 'cesium';
import type { Flight } from '../types/flight';
import { metersToFeet } from '../utils/geo';
import { getAircraftSvg } from '../utils/aircraftIcon';

const FLIGHT_ENTITY_PREFIX = 'flight-';

function getEntityId(icao24: string): string {
  return `${FLIGHT_ENTITY_PREFIX}${icao24}`;
}

function getImage(flight: Flight, selectedFlightId: string | null): string {
  const svg = getAircraftSvg(metersToFeet(flight.baroAltitude), selectedFlightId === flight.icao24);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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

  viewer.entities.values.forEach((entity) => {
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

    if (existing) {
      existing.position = new ConstantPositionProperty(position);
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
      return;
    }

    viewer.entities.add({
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
  });
}
