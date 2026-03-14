export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface SimulatedNearbyVehicle {
  id: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  etaMinutes: number;
  symbol: string;
}

const DEFAULT_CELL_DEGREES = 0.018;
const DEFAULT_MOVE_THRESHOLD_KM = 2.2;
const VEHICLE_SYMBOLS = ['🚚', '🛺', '🚛', '🚚', '🛻'] as const;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function normalizeLongitude(value: number) {
  if (value > 180) {
    return value - 360;
  }
  if (value < -180) {
    return value + 360;
  }
  return value;
}

function snapToCell(value: number, cellSize: number) {
  return Math.round(value / cellSize) * cellSize;
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function offsetCoordinate(point: GeoPoint, distanceKm: number, bearingDeg: number): GeoPoint {
  const earthRadiusKm = 6371;
  const angularDistance = distanceKm / earthRadiusKm;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(point.lat);
  const lng1 = toRadians(point.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: toDegrees(lat2),
    lng: normalizeLongitude(toDegrees(lng2))
  };
}

export function haversineDistanceKm(a: GeoPoint, b: GeoPoint) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const arc =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

export function shouldRecenterSimulatedVehicles(
  currentAnchor: GeoPoint | undefined,
  nextAnchor: GeoPoint,
  minDistanceKm = DEFAULT_MOVE_THRESHOLD_KM
) {
  if (!currentAnchor) {
    return true;
  }
  return haversineDistanceKm(currentAnchor, nextAnchor) >= minDistanceKm;
}

export function buildSimulatedNearbyVehicles(anchor: GeoPoint, count = 4): SimulatedNearbyVehicle[] {
  const safeCount = Math.max(1, Math.min(8, Math.floor(count)));
  const cellCenter = {
    lat: snapToCell(anchor.lat, DEFAULT_CELL_DEGREES),
    lng: snapToCell(anchor.lng, DEFAULT_CELL_DEGREES)
  };

  const cellKey = `${cellCenter.lat.toFixed(4)}:${cellCenter.lng.toFixed(4)}`;
  const random = createSeededRng(hashString(cellKey));
  const vehicles: SimulatedNearbyVehicle[] = [];

  for (let index = 0; index < safeCount; index += 1) {
    const radiusKm = 0.25 + random() * 1.25;
    const bearingDeg = random() * 360;
    const point = offsetCoordinate(cellCenter, radiusKm, bearingDeg);
    const etaMinutes = Math.max(2, Math.min(9, Math.round(radiusKm * 3 + 1 + random() * 2.5)));
    vehicles.push({
      id: `nearby-${cellKey}-${index + 1}`,
      latitude: point.lat,
      longitude: point.lng,
      distanceKm: Number(radiusKm.toFixed(1)),
      etaMinutes,
      symbol: VEHICLE_SYMBOLS[index % VEHICLE_SYMBOLS.length]
    });
  }

  return vehicles;
}
