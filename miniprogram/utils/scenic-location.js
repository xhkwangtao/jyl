const {
  JYL_ROUTE
} = require('../config/jyl-map-data')

const LOCATION_TYPE = 'gcj02'
const LOCATION_CACHE_MAX_AGE_MS = 3000
const SCENIC_AREA_MAX_DISTANCE_METERS = 180

const SCENIC_ROUTE_POINTS = buildScenicRoutePoints()

let latestLocation = null
let latestLocationAt = 0

function buildScenicRoutePoints() {
  const routePathPoints = Array.isArray(JYL_ROUTE?.pathPoints) ? JYL_ROUTE.pathPoints : []
  const routeSegmentPoints = Array.isArray(JYL_ROUTE?.segmentPaths)
    ? JYL_ROUTE.segmentPaths.flat()
    : []

  const sourcePoints = routePathPoints.length ? routePathPoints : routeSegmentPoints

  return sourcePoints
    .map((point) => ({
      latitude: Number(point?.latitude),
      longitude: Number(point?.longitude)
    }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
}

function haversineMeters(a, b) {
  const earthRadius = 6378137
  const latitudeDelta = ((b.latitude - a.latitude) * Math.PI) / 180
  const longitudeDelta = ((b.longitude - a.longitude) * Math.PI) / 180
  const latitudeA = (a.latitude * Math.PI) / 180
  const latitudeB = (b.latitude * Math.PI) / 180
  const term = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2

  return earthRadius * 2 * Math.atan2(Math.sqrt(term), Math.sqrt(1 - term))
}

function getMinDistanceBetweenPoints(sourcePoints, targetPoints) {
  if (!Array.isArray(sourcePoints) || !sourcePoints.length || !Array.isArray(targetPoints) || !targetPoints.length) {
    return Number.POSITIVE_INFINITY
  }

  let minDistance = Number.POSITIVE_INFINITY

  sourcePoints.forEach((sourcePoint) => {
    targetPoints.forEach((targetPoint) => {
      minDistance = Math.min(minDistance, haversineMeters(sourcePoint, targetPoint))
    })
  })

  return minDistance
}

function normalizeLocationPayload(payload = {}) {
  const latitude = Number(payload.latitude)
  const longitude = Number(payload.longitude)

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null
  }

  return {
    latitude,
    longitude,
    accuracy: Number(payload.accuracy) || 0
  }
}

function cacheLocation(location) {
  latestLocation = location ? { ...location } : null
  latestLocationAt = latestLocation ? Date.now() : 0
}

function getCachedLocation(maxAgeMs = LOCATION_CACHE_MAX_AGE_MS) {
  if (!latestLocation || !latestLocationAt) {
    return null
  }

  if (Date.now() - latestLocationAt > Math.max(Number(maxAgeMs) || 0, 0)) {
    return null
  }

  return {
    ...latestLocation
  }
}

function getCurrentLocation(options = {}) {
  const {
    preferCache = true,
    maxAgeMs = LOCATION_CACHE_MAX_AGE_MS
  } = options

  const cachedLocation = preferCache ? getCachedLocation(maxAgeMs) : null
  if (cachedLocation) {
    return Promise.resolve(cachedLocation)
  }

  return new Promise((resolve, reject) => {
    wx.getLocation({
      type: LOCATION_TYPE,
      success: (result = {}) => {
        const location = normalizeLocationPayload(result)
        if (!location) {
          reject(new Error('invalid location payload'))
          return
        }

        cacheLocation(location)
        resolve(location)
      },
      fail: reject
    })
  })
}

function isLocationInScenicArea(location) {
  const normalizedLocation = normalizeLocationPayload(location)
  if (!normalizedLocation || !SCENIC_ROUTE_POINTS.length) {
    return false
  }

  return getMinDistanceBetweenPoints(SCENIC_ROUTE_POINTS, [normalizedLocation]) <= SCENIC_AREA_MAX_DISTANCE_METERS
}

async function checkCurrentLocationInScenicArea(options = {}) {
  try {
    const location = await getCurrentLocation(options)
    const allowed = isLocationInScenicArea(location)
    return {
      allowed,
      reason: allowed ? 'in_scenic_area' : 'outside_scenic_area',
      location
    }
  } catch (error) {
    return {
      allowed: false,
      reason: 'location_failed',
      error
    }
  }
}

function buildScenicVideoAccessDeniedMessage(result = {}) {
  if (result?.reason === 'outside_scenic_area') {
    return {
      title: '暂无法观看',
      content: '当前视频仅支持在景区范围内观看，请到达景区后再试。'
    }
  }

  return {
    title: '需要定位权限',
    content: '查看视频前需要获取当前位置并校验您是否在景区范围内，请开启定位后重试。'
  }
}

module.exports = {
  LOCATION_CACHE_MAX_AGE_MS,
  SCENIC_AREA_MAX_DISTANCE_METERS,
  buildScenicVideoAccessDeniedMessage,
  checkCurrentLocationInScenicArea,
  getCurrentLocation,
  isLocationInScenicArea
}
