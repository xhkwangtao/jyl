import type { CoordinatePair } from '../types'

export interface ProjectedPoint {
  x: number
  y: number
}

export function outOfChina(longitude: number, latitude: number): boolean {
  return !(longitude > 73.66 && longitude < 135.05 && latitude > 3.86 && latitude < 53.55)
}

function transformLatitude(x: number, y: number): number {
  let result =
    -100.0 +
    2.0 * x +
    3.0 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x))
  result += ((20.0 * Math.sin(6.0 * x * Math.PI)) + (20.0 * Math.sin(2.0 * x * Math.PI))) * 2.0 / 3.0
  result += ((20.0 * Math.sin(y * Math.PI)) + (40.0 * Math.sin(y / 3.0 * Math.PI))) * 2.0 / 3.0
  result += ((160.0 * Math.sin(y / 12.0 * Math.PI)) + (320.0 * Math.sin(y * Math.PI / 30.0))) * 2.0 / 3.0
  return result
}

function transformLongitude(x: number, y: number): number {
  let result =
    300.0 +
    x +
    2.0 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x))
  result += ((20.0 * Math.sin(6.0 * x * Math.PI)) + (20.0 * Math.sin(2.0 * x * Math.PI))) * 2.0 / 3.0
  result += ((20.0 * Math.sin(x * Math.PI)) + (40.0 * Math.sin(x / 3.0 * Math.PI))) * 2.0 / 3.0
  result += ((150.0 * Math.sin(x / 12.0 * Math.PI)) + (300.0 * Math.sin(x / 30.0 * Math.PI))) * 2.0 / 3.0
  return result
}

export function wgs84ToGcj02(longitude: number, latitude: number): CoordinatePair {
  if (outOfChina(longitude, latitude)) {
    return [longitude, latitude]
  }

  const semiMajorAxis = 6378245.0
  const eccentricity = 0.00669342162296594323
  let deltaLatitude = transformLatitude(longitude - 105.0, latitude - 35.0)
  let deltaLongitude = transformLongitude(longitude - 105.0, latitude - 35.0)
  const radianLatitude = latitude * Math.PI / 180.0
  let magic = Math.sin(radianLatitude)

  magic = 1 - eccentricity * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  deltaLatitude =
    (deltaLatitude * 180.0) /
    (((semiMajorAxis * (1 - eccentricity)) / (magic * sqrtMagic)) * Math.PI)
  deltaLongitude =
    (deltaLongitude * 180.0) /
    ((semiMajorAxis / sqrtMagic) * Math.cos(radianLatitude) * Math.PI)

  return [longitude + deltaLongitude, latitude + deltaLatitude]
}

export function gcj02ToWgs84(longitude: number, latitude: number): CoordinatePair {
  if (outOfChina(longitude, latitude)) {
    return [longitude, latitude]
  }

  let estimateLongitude = longitude
  let estimateLatitude = latitude

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const [convertedLongitude, convertedLatitude] = wgs84ToGcj02(
      estimateLongitude,
      estimateLatitude
    )
    estimateLongitude += longitude - convertedLongitude
    estimateLatitude += latitude - convertedLatitude
  }

  return [estimateLongitude, estimateLatitude]
}

export function roundCoordinatePair([longitude, latitude]: CoordinatePair): CoordinatePair {
  return [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))]
}

export function toRadians(value: number): number {
  return value * Math.PI / 180
}

export function haversineMeters(a: CoordinatePair, b: CoordinatePair): number {
  const earthRadius = 6378137
  const [lon1, lat1] = a
  const [lon2, lat2] = b
  const deltaLat = toRadians(lat2 - lat1)
  const deltaLon = toRadians(lon2 - lon1)
  const lat1Rad = toRadians(lat1)
  const lat2Rad = toRadians(lat2)

  const term =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2)

  return earthRadius * 2 * Math.atan2(Math.sqrt(term), Math.sqrt(1 - term))
}

export function totalDistanceMeters(points: CoordinatePair[]): number {
  let distance = 0

  for (let index = 1; index < points.length; index += 1) {
    distance += haversineMeters(points[index - 1], points[index])
  }

  return Math.round(distance)
}

export function nearestRouteIndex(target: CoordinatePair, route: CoordinatePair[]): number {
  if (!route.length) {
    return 0
  }

  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY

  route.forEach((candidate, index) => {
    const distance = haversineMeters(target, candidate)

    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })

  return bestIndex
}

export function projectToMeters(point: CoordinatePair, origin: CoordinatePair): ProjectedPoint {
  const [longitude, latitude] = point
  const [originLongitude, originLatitude] = origin
  const meanLatitude = toRadians((latitude + originLatitude) / 2)
  const metersPerDegreeLatitude = 111320
  const metersPerDegreeLongitude = 111320 * Math.cos(meanLatitude)

  return {
    x: (longitude - originLongitude) * metersPerDegreeLongitude,
    y: -1 * (latitude - originLatitude) * metersPerDegreeLatitude
  }
}

export function unprojectFromMeters(point: ProjectedPoint, origin: CoordinatePair): CoordinatePair {
  const [originLongitude, originLatitude] = origin
  const meanLatitude = toRadians(originLatitude)
  const metersPerDegreeLatitude = 111320
  const metersPerDegreeLongitude = 111320 * Math.cos(meanLatitude)

  return [
    originLongitude + point.x / metersPerDegreeLongitude,
    originLatitude - point.y / metersPerDegreeLatitude
  ]
}
