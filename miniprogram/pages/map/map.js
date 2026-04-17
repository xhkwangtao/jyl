const {
  JYL_MARKER_POINTS,
  JYL_ROUTE,
  JYL_ROUTE_MARKER_POINTS,
  JYL_ROUTE_POLYLINES
} = require('../../config/jyl-map-data.js')
const {
  JYL_SECRET_POINTS
} = require('../../config/jyl-secret-data.js')
const {
  AUDIO_FEATURE_KEY,
  isFeaturePaid,
  setFeaturePaid
} = require('../../utils/audio-access.js')
const {
  isPointChecked
} = require('../../utils/checkin')
const {
  resolvePoiSourceCodeToMarkerId
} = require('../../utils/poi-source-code.js')

const DEFAULT_ENTRY_POINT = JYL_ROUTE_MARKER_POINTS.find((point) => point.type === 'start') || JYL_ROUTE_MARKER_POINTS[0] || null
const DEFAULT_ENTRY_SCALE = 19
const DEFAULT_OVERVIEW_SCALE = 13
const ENABLE_POI = false
const ALLOWED_ZOOMS = Array.from({ length: 16 }, (_, index) => index + 5)
const HIGHLIGHT_ROUTE_SPOT_COUNT = 6
const ROUTE_SEGMENT_CONNECT_MAX_METERS = 120
const ROUTE_SEGMENT_BRIDGE_MAX_METERS = 60
const ROUTE_SEGMENT_BRIDGE_MIN_METERS = 2
const ORIGINAL_ROUTE_DIM_COLOR = '#245F6D99'
const ORIGINAL_ROUTE_PRIMARY_WIDTH = 6
const ORIGINAL_ROUTE_SECONDARY_WIDTH = 4
const PLANNED_ROUTE_COLOR = '#FF8A3D'
const PLANNED_ROUTE_BORDER_COLOR = '#FFF3E6'
const PLANNED_ROUTE_PRIMARY_WIDTH = 8
const PLANNED_ROUTE_SECONDARY_WIDTH = 6
const DEFAULT_POI_POPUP_COVER = '/images/poi-detail/1.png'
const NAVIGATION_START_NEAR_ROUTE_MAX_METERS = 120
const NAVIGATION_IN_SCENIC_MAX_METERS = 180
const ENTRY_REQUEST_RETRY_DELAY = 80
const NAVIGATION_TRACK_INTERVAL_MS = 12000
const NAVIGATION_OFF_ROUTE_MAX_METERS = 45
const NAVIGATION_ARRIVAL_MAX_METERS = 24
const NAVIGATION_DESTINATION_REACHED_MAX_METERS = 14
const NAVIGATION_RECALCULATE_COOLDOWN_MS = 28000
const NAVIGATION_GUIDE_NEAR_ROUTE_MAX_METERS = 28
const NAVIGATION_STEP_PREVIEW_COUNT = 2
const ARRIVED_AUDIO_POI_LIMIT = 6
const AUTO_AUDIO_TRACK_INTERVAL_MS = 10000
const AUTO_AUDIO_ACCURACY_THRESHOLD_METERS = 60
const AUTO_AUDIO_DEFAULT_TRIGGER_RADIUS_METERS = 36
const AUTO_AUDIO_SAME_POI_COOLDOWN_MS = 120000
const AUTO_AUDIO_CROSS_POI_COOLDOWN_MS = 8000
const AUDIO_PAYWALL_PRICE = 7.8
const AUDIO_PAYWALL_THROTTLE_MS = 1200
const AI_CHAT_ACCESS_FEATURE_KEY = 'vip'
const AI_CHAT_PAYMENT_FEATURE_KEY = 'ai.chat.send-message'
const AI_CHAT_SUBSCRIBE_DESCRIPTION = '开通VIP后即可使用AI聊天与智能路线问答服务'
const MAP_ROUTE_PLANNING_FEATURE_KEY = 'map.route.planning'
const MAP_POI_PRIMARY_ACTION_FEATURE_KEY = 'map.poi.primary-action'
const SECRET_POINT_BY_MAP_POINT_ID = JYL_SECRET_POINTS.reduce((accumulator, point) => {
  const mapPointId = String(point?.mapPointId || '').trim()

  if (mapPointId) {
    accumulator[mapPointId] = point
  }

  return accumulator
}, {})

function navigateToPage(url) {
  wx.navigateTo({
    url,
    fail: () => {
      wx.redirectTo({
        url
      })
    }
  })
}

function safeDecodeURIComponent(value) {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return decodeURIComponent(value)
  } catch (error) {
    return value
  }
}

function normalizeLookupText(value) {
  return String(value || '').trim().replace(/\s+/g, '')
}

function normalizeBooleanValue(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue
  }

  if (typeof value === 'boolean') {
    return value
  }

  const normalizedValue = String(value).trim().toLowerCase()

  if (['1', 'true', 'yes', 'y', 'on'].includes(normalizedValue)) {
    return true
  }

  if (['0', 'false', 'no', 'n', 'off'].includes(normalizedValue)) {
    return false
  }

  return defaultValue
}

function toFiniteCoordinateValue(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function buildCenter(points) {
  if (!points.length) {
    return {
      latitude: DEFAULT_ENTRY_POINT?.latitude || 40.491364,
      longitude: DEFAULT_ENTRY_POINT?.longitude || 116.491722
    }
  }

  const bounds = points.reduce((acc, point) => ({
    minLatitude: Math.min(acc.minLatitude, point.latitude),
    maxLatitude: Math.max(acc.maxLatitude, point.latitude),
    minLongitude: Math.min(acc.minLongitude, point.longitude),
    maxLongitude: Math.max(acc.maxLongitude, point.longitude)
  }), {
    minLatitude: Number.POSITIVE_INFINITY,
    maxLatitude: Number.NEGATIVE_INFINITY,
    minLongitude: Number.POSITIVE_INFINITY,
    maxLongitude: Number.NEGATIVE_INFINITY
  })

  return {
    latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
    longitude: (bounds.minLongitude + bounds.maxLongitude) / 2
  }
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

function sumPolylineDistance(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return 0
  }

  return points.reduce((total, point, index) => {
    if (index === 0) {
      return total
    }

    return total + haversineMeters(points[index - 1], point)
  }, 0)
}

function sumPolylineGroupDistance(polylines) {
  return (polylines || []).reduce((total, polyline) => total + sumPolylineDistance(polyline.points || []), 0)
}

function parseStayMinutes(stayText) {
  const matched = typeof stayText === 'string' ? stayText.match(/(\d+)/) : null
  return matched ? Number(matched[1]) : 5
}

function formatMetricNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}

function formatDistanceMetric(distanceMeters) {
  if (distanceMeters >= 1000) {
    return {
      value: formatMetricNumber(Math.round(distanceMeters / 100) / 10),
      unit: 'km'
    }
  }

  return {
    value: String(Math.round(distanceMeters)),
    unit: 'm'
  }
}

function formatDurationMetric(totalMinutes) {
  const lowerHours = Math.max(0.5, Math.round((totalMinutes * 0.9) / 30) * 0.5)
  const upperHours = Math.max(lowerHours + 0.5, Math.round((totalMinutes * 1.1) / 30) * 0.5)

  return {
    value: lowerHours === upperHours
      ? formatMetricNumber(lowerHours)
      : `${formatMetricNumber(lowerHours)}-${formatMetricNumber(upperHours)}`,
    unit: '小时'
  }
}

function estimateWalkingDurationMetric(distanceMeters) {
  const walkMinutes = Math.max(3, Math.round(distanceMeters / 45))
  if (walkMinutes < 60) {
    return {
      value: String(walkMinutes),
      unit: '分钟'
    }
  }

  return formatDurationMetric(walkMinutes)
}

function formatNavigationUpdatedText(updatedAt) {
  if (!updatedAt) {
    return ''
  }

  const elapsedSeconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000))
  if (elapsedSeconds < 20) {
    return '刚刚更新'
  }

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds} 秒前更新`
  }

  const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60))
  return `${elapsedMinutes} 分钟前更新`
}

function estimateRouteDurationMetric(distanceMeters, points) {
  const walkMinutes = Math.max(20, Math.round(distanceMeters / 45))
  const stayMinutes = (points || []).reduce((total, point) => {
    if (point.type === 'start') {
      return total
    }

    return total + parseStayMinutes(point.stayText)
  }, 0)

  return formatDurationMetric(walkMinutes + stayMinutes)
}

function uniquePoints(points) {
  const seen = new Set()

  return (points || []).filter((point) => {
    if (!point) {
      return false
    }

    const pointId = String(point.id || point.markerId || point.name)
    if (seen.has(pointId)) {
      return false
    }

    seen.add(pointId)
    return true
  })
}

function pickEvenlySpacedPoints(points, desiredCount) {
  if (!Array.isArray(points) || !points.length || desiredCount <= 0) {
    return []
  }

  if (points.length <= desiredCount) {
    return points.slice()
  }

  const selectedIndexes = new Set([0, points.length - 1])
  while (selectedIndexes.size < desiredCount) {
    const ratio = selectedIndexes.size / Math.max(desiredCount - 1, 1)
    const candidateIndex = Math.round(ratio * (points.length - 1))

    if (!selectedIndexes.has(candidateIndex)) {
      selectedIndexes.add(candidateIndex)
      continue
    }

    for (let offset = 1; offset < points.length; offset += 1) {
      const nextIndex = candidateIndex + offset
      const previousIndex = candidateIndex - offset

      if (nextIndex < points.length && !selectedIndexes.has(nextIndex)) {
        selectedIndexes.add(nextIndex)
        break
      }

      if (previousIndex >= 0 && !selectedIndexes.has(previousIndex)) {
        selectedIndexes.add(previousIndex)
        break
      }
    }
  }

  return Array.from(selectedIndexes)
    .sort((left, right) => left - right)
    .map((index) => points[index])
}

function buildRouteFocus(polylines, points) {
  const polylinePoints = (polylines || []).flatMap((polyline) => polyline.points || [])
  const includePoints = [
    ...polylinePoints,
    ...(points || []).map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude
    }))
  ]

  return {
    center: buildCenter(includePoints),
    scale: (polylines || []).length <= 1 ? 15 : DEFAULT_OVERVIEW_SCALE
  }
}

function getPolylineEndpoints(polyline) {
  if (!polyline || !Array.isArray(polyline.points) || !polyline.points.length) {
    return []
  }

  return [polyline.points[0], polyline.points[polyline.points.length - 1]]
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

function getMinEntranceDistance(polyline, entrancePoint) {
  return getMinDistanceBetweenPoints(getPolylineEndpoints(polyline), [entrancePoint])
}

function getMinMainDistance(polyline, mainPolyline) {
  return getMinDistanceBetweenPoints(getPolylineEndpoints(polyline), mainPolyline?.points || [])
}

function getMinPolylineLinkDistance(leftPolyline, rightPolyline) {
  return getMinDistanceBetweenPoints(getPolylineEndpoints(leftPolyline), getPolylineEndpoints(rightPolyline))
}

function orientPolylinePointsFromAnchor(points, anchorPoint) {
  if (!Array.isArray(points) || !points.length) {
    return []
  }

  const orientedPoints = points.slice()
  if (!anchorPoint) {
    return orientedPoints
  }

  const startPoint = orientedPoints[0]
  const endPoint = orientedPoints[orientedPoints.length - 1]
  const startDistance = haversineMeters(anchorPoint, startPoint)
  const endDistance = haversineMeters(anchorPoint, endPoint)

  return endDistance < startDistance ? orientedPoints.reverse() : orientedPoints
}

function orientPolylineFromAnchor(polyline, anchorPoint) {
  if (!polyline || !Array.isArray(polyline.points) || !polyline.points.length) {
    return null
  }

  return {
    ...polyline,
    points: orientPolylinePointsFromAnchor(polyline.points, anchorPoint)
  }
}

function buildRouteConnectorPolyline(startPoint, endPoint, options = {}) {
  if (!startPoint || !endPoint) {
    return null
  }

  const {
    minDistance = ROUTE_SEGMENT_BRIDGE_MIN_METERS,
    maxDistance = ROUTE_SEGMENT_BRIDGE_MAX_METERS
  } = options
  const gapDistance = haversineMeters(startPoint, endPoint)
  if (gapDistance <= 0 || gapDistance < minDistance || gapDistance > maxDistance) {
    return null
  }

  return {
    isConnector: true,
    points: [
      {
        latitude: startPoint.latitude,
        longitude: startPoint.longitude
      },
      {
        latitude: endPoint.latitude,
        longitude: endPoint.longitude
      }
    ]
  }
}

function buildContinuousRoutePolylines(polylines, startPoint = null) {
  if (!Array.isArray(polylines) || !polylines.length) {
    return []
  }

  const continuousPolylines = []
  let previousEndPoint = startPoint

  polylines.forEach((polyline) => {
    const orientedPolyline = orientPolylineFromAnchor(polyline, previousEndPoint)
    if (!orientedPolyline) {
      return
    }

    const currentStartPoint = orientedPolyline.points[0]
    if (previousEndPoint) {
      const connectorPolyline = buildRouteConnectorPolyline(previousEndPoint, currentStartPoint)
      if (connectorPolyline) {
        continuousPolylines.push(connectorPolyline)
      }
    }

    continuousPolylines.push(orientedPolyline)
    previousEndPoint = orientedPolyline.points[orientedPolyline.points.length - 1]
  })

  return continuousPolylines
}

function buildEntranceToMainPolylines(allPolylines, entrancePoint) {
  if (!Array.isArray(allPolylines) || !allPolylines.length) {
    return []
  }

  const mainPolyline = allPolylines[0]
  if (!mainPolyline || !entrancePoint) {
    return mainPolyline ? [mainPolyline] : []
  }

  const entranceCandidates = []
  const targetCandidates = new Set()

  for (let index = 1; index < allPolylines.length; index += 1) {
    const polyline = allPolylines[index]
    const entranceDistance = getMinEntranceDistance(polyline, entrancePoint)
    const mainDistance = getMinMainDistance(polyline, mainPolyline)

    if (entranceDistance <= ROUTE_SEGMENT_CONNECT_MAX_METERS) {
      entranceCandidates.push({
        index,
        cost: entranceDistance
      })
    }

    if (mainDistance <= ROUTE_SEGMENT_CONNECT_MAX_METERS) {
      targetCandidates.add(index)
    }
  }

  if (!entranceCandidates.length) {
    return buildContinuousRoutePolylines([mainPolyline], entrancePoint)
  }

  const graph = Array.from({ length: allPolylines.length }, () => [])
  for (let leftIndex = 1; leftIndex < allPolylines.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < allPolylines.length; rightIndex += 1) {
      const distance = getMinPolylineLinkDistance(allPolylines[leftIndex], allPolylines[rightIndex])
      if (distance > ROUTE_SEGMENT_CONNECT_MAX_METERS) {
        continue
      }

      graph[leftIndex].push({
        index: rightIndex,
        weight: distance
      })
      graph[rightIndex].push({
        index: leftIndex,
        weight: distance
      })
    }
  }

  const distances = Array(allPolylines.length).fill(Number.POSITIVE_INFINITY)
  const previous = Array(allPolylines.length).fill(-1)
  const visited = Array(allPolylines.length).fill(false)

  entranceCandidates.forEach((candidate) => {
    distances[candidate.index] = candidate.cost
  })

  let bestTargetIndex = -1
  while (true) {
    let currentIndex = -1
    let currentDistance = Number.POSITIVE_INFINITY

    for (let index = 1; index < allPolylines.length; index += 1) {
      if (!visited[index] && distances[index] < currentDistance) {
        currentDistance = distances[index]
        currentIndex = index
      }
    }

    if (currentIndex < 0) {
      break
    }

    visited[currentIndex] = true
    if (targetCandidates.has(currentIndex)) {
      bestTargetIndex = currentIndex
      break
    }

    graph[currentIndex].forEach(({ index, weight }) => {
      const nextDistance = distances[currentIndex] + weight
      if (nextDistance < distances[index]) {
        distances[index] = nextDistance
        previous[index] = currentIndex
      }
    })
  }

  if (bestTargetIndex < 0) {
    return buildContinuousRoutePolylines([mainPolyline], entrancePoint)
  }

  const pathIndexes = []
  let cursor = bestTargetIndex
  while (cursor >= 0) {
    pathIndexes.unshift(cursor)
    cursor = previous[cursor]
  }

  const entrancePathPolylines = pathIndexes.map((index) => allPolylines[index]).filter(Boolean)
  return buildContinuousRoutePolylines([
    ...entrancePathPolylines,
    mainPolyline
  ], entrancePoint)
}

function buildIntelligentRouteOption(id, name, theme, description, polylines, points) {
  const routePoints = uniquePoints(points)
  const distanceMeters = Math.round(sumPolylineGroupDistance(polylines))
  const distanceMetric = formatDistanceMetric(distanceMeters)
  const durationMetric = estimateRouteDurationMetric(distanceMeters, routePoints)
  const focus = buildRouteFocus(polylines, routePoints)

  return {
    id,
    name,
    theme,
    description,
    polylines,
    points: routePoints,
    pointIds: routePoints.map((point) => String(point.id)),
    distanceMeters,
    distanceValue: distanceMetric.value,
    distanceUnit: distanceMetric.unit,
    durationValue: durationMetric.value,
    durationUnit: durationMetric.unit,
    pointCount: routePoints.filter((point) => point.type !== 'start').length,
    focusCenter: focus.center,
    focusScale: focus.scale
  }
}

function clonePolyline(polyline) {
  return {
    points: polyline.points,
    color: polyline.color,
    width: polyline.width,
    borderColor: polyline.borderColor,
    borderWidth: polyline.borderWidth,
    dottedLine: polyline.dottedLine,
    arrowLine: polyline.arrowLine
  }
}

function flattenRoutePolylinePoints(route) {
  if (!route || !Array.isArray(route.polylines)) {
    return []
  }

  return route.polylines.reduce((accumulator, polyline) => {
    ;(polyline?.points || []).forEach((point) => {
      if (typeof point?.latitude === 'number' && typeof point?.longitude === 'number') {
        accumulator.push(point)
      }
    })
    return accumulator
  }, [])
}

function estimateNavigationProgress(route, userLocation) {
  if (!route || !userLocation) {
    return null
  }

  const routePoints = flattenRoutePolylinePoints(route)
  if (!routePoints.length) {
    return null
  }

  const closestIndex = getClosestPointIndex(routePoints, userLocation)
  const destinationPoint = routePoints[routePoints.length - 1]
  const minDistanceToRoute = getMinDistanceBetweenPoints(routePoints, [userLocation])
  const distanceToDestinationMeters = destinationPoint
    ? haversineMeters(userLocation, destinationPoint)
    : 0
  const remainingRouteMeters = closestIndex >= 0
    ? sumPolylineDistance(routePoints.slice(closestIndex))
    : 0
  const remainingDistanceMeters = Math.max(
    distanceToDestinationMeters,
    minDistanceToRoute + remainingRouteMeters
  )

  return {
    closestIndex,
    minDistanceToRoute,
    distanceToDestinationMeters,
    remainingDistanceMeters
  }
}

function resolveNavigationStatusCopy(options = {}) {
  const {
    arrived = false,
    locationAvailable = false,
    recalculating = false,
    distanceToDestinationMeters = Number.POSITIVE_INFINITY,
    minDistanceToRoute = Number.POSITIVE_INFINITY
  } = options

  if (arrived) {
    return {
      statusText: '已到达',
      statusTone: 'success'
    }
  }

  if (recalculating) {
    return {
      statusText: '正在重算',
      statusTone: 'warning'
    }
  }

  if (!locationAvailable) {
    return {
      statusText: '等待定位',
      statusTone: 'muted'
    }
  }

  if (distanceToDestinationMeters <= NAVIGATION_ARRIVAL_MAX_METERS) {
    return {
      statusText: '即将到达',
      statusTone: 'success'
    }
  }

  if (minDistanceToRoute > NAVIGATION_OFF_ROUTE_MAX_METERS) {
    return {
      statusText: '已偏离路线',
      statusTone: 'warning'
    }
  }

  return {
    statusText: '跟随路线中',
    statusTone: 'normal'
  }
}

function buildNavigationCardState(point, route, source, options = {}) {
  const {
    arrived = false,
    locationAvailable = false,
    recalculating = false,
    remainingDistanceMeters = route?.distanceMeters || 0,
    distanceToDestinationMeters = Number.POSITIVE_INFINITY,
    minDistanceToRoute = Number.POSITIVE_INFINITY,
    updatedAt = 0
  } = options

  const distanceMetric = formatDistanceMetric(Math.max(0, remainingDistanceMeters))
  const durationMetric = estimateWalkingDurationMetric(Math.max(0, remainingDistanceMeters))
  const statusCopy = resolveNavigationStatusCopy({
    arrived,
    locationAvailable,
    recalculating,
    distanceToDestinationMeters,
    minDistanceToRoute
  })

  const routeGapText = arrived
    ? '已切换到景点浏览'
    : locationAvailable && Number.isFinite(minDistanceToRoute)
    ? `离路线 ${Math.max(0, Math.round(minDistanceToRoute))}m`
    : '未获取到当前位置'
  const subtitlePrefix = source === 'current' ? '从当前位置出发' : '从检票口出发'
  const subtitle = arrived
    ? `已到达${point.name}，可以查看景点详情`
    : recalculating
    ? `${subtitlePrefix}，正在按当前位置更新路线`
    : subtitlePrefix

  return {
    title: `前往${point.name}`,
    subtitle,
    sourceTagText: source === 'current' ? '当前位置起步' : `${DEFAULT_ENTRY_POINT?.name || '检票口'}起步`,
    distanceValue: distanceMetric.value,
    distanceUnit: distanceMetric.unit,
    durationValue: durationMetric.value,
    durationUnit: durationMetric.unit,
    distanceCaption: '剩余距离',
    durationCaption: '预计步行',
    statusText: statusCopy.statusText,
    statusTone: statusCopy.statusTone,
    routeGapText,
    updatedText: formatNavigationUpdatedText(updatedAt)
  }
}

function buildNavigationStepItems(targetPoint, source, options = {}) {
  if (!targetPoint) {
    return []
  }

  const {
    progress = null,
    guidePoints = [],
    arrived = false
  } = options
  const currentPathIndex = typeof progress?.closestIndex === 'number' ? progress.closestIndex : -1
  const sourceName = source === 'current' ? '当前位置' : (DEFAULT_ENTRY_POINT?.name || '检票口')
  const upcomingGuidePoints = (guidePoints || [])
    .filter((point) => String(point?.id || point?.markerId) !== String(targetPoint.id || targetPoint.markerId))
    .filter((point) => typeof point?.closestPathIndex !== 'number' || point.closestPathIndex >= currentPathIndex - 3)
    .slice(0, NAVIGATION_STEP_PREVIEW_COUNT)

  const stepItems = [
    {
      key: 'source',
      label: '起点',
      value: sourceName,
      state: currentPathIndex >= 0 || arrived ? 'done' : 'active'
    }
  ]

  upcomingGuidePoints.forEach((point, index) => {
    const isReached = typeof point.closestPathIndex === 'number' && currentPathIndex >= 0 && point.closestPathIndex < currentPathIndex - 3
    stepItems.push({
      key: `guide-${point.id || point.markerId || index}`,
      label: index === 0 && !arrived ? '下一站' : '沿途',
      value: point.name,
      state: isReached ? 'done' : (index === 0 && !arrived ? 'active' : 'pending')
    })
  })

  stepItems.push({
    key: 'target',
    label: arrived ? '已到达' : '终点',
    value: targetPoint.name,
    state: arrived ? 'done' : 'pending'
  })

  return stepItems
}

function buildNavigationGuidePoints(route, targetPoint = null) {
  if (!route) {
    return []
  }

  const routePoints = flattenRoutePolylinePoints(route)
  if (!routePoints.length) {
    return []
  }

  return uniquePoints([
    ...ALL_ROUTE_DISPLAY_POINTS.filter((point) => point.type !== 'start'),
    targetPoint
  ].filter(Boolean)).map((point) => {
    const closestPathIndex = getClosestPointIndex(routePoints, point)
    const routeDistance = getMinDistanceBetweenPoints(routePoints, [point])
    const nearRouteThreshold = Math.max(
      NAVIGATION_GUIDE_NEAR_ROUTE_MAX_METERS,
      Number(point?.triggerRadiusM) || 0
    ) + 8

    if (!Number.isFinite(routeDistance) || routeDistance > nearRouteThreshold) {
      return null
    }

    return {
      ...point,
      closestPathIndex,
      routeDistance
    }
  }).filter(Boolean).sort((left, right) => left.closestPathIndex - right.closestPathIndex)
}

function buildDefaultPolylineData() {
  return JYL_ROUTE_POLYLINES.map((polyline) => clonePolyline(polyline))
}

function buildPlanningBasePolylines() {
  return JYL_ROUTE_POLYLINES.map((polyline, index) => ({
    points: polyline.points,
    color: ORIGINAL_ROUTE_DIM_COLOR,
    width: index === 0 ? ORIGINAL_ROUTE_PRIMARY_WIDTH : ORIGINAL_ROUTE_SECONDARY_WIDTH
  }))
}

function buildPlannedRoutePolylines(route) {
  if (!route || !Array.isArray(route.polylines)) {
    return []
  }

  const primaryPolylineIndex = route.polylines.findIndex((polyline) => !polyline.isConnector)
  const resolvedPrimaryPolylineIndex = primaryPolylineIndex >= 0 ? primaryPolylineIndex : 0

  return route.polylines.map((polyline, index) => ({
    points: polyline.points,
    color: PLANNED_ROUTE_COLOR,
    width: index === resolvedPrimaryPolylineIndex ? PLANNED_ROUTE_PRIMARY_WIDTH : PLANNED_ROUTE_SECONDARY_WIDTH,
    borderColor: PLANNED_ROUTE_BORDER_COLOR,
    borderWidth: index === resolvedPrimaryPolylineIndex ? 2 : 1
  }))
}

function buildMapPolylines(selectedRoute = null) {
  if (!selectedRoute) {
    return buildDefaultPolylineData()
  }

  return [
    ...buildPlanningBasePolylines(),
    ...buildPlannedRoutePolylines(selectedRoute)
  ]
}

function buildActiveIconPath(iconPath) {
  if (typeof iconPath !== 'string') {
    return '/images/poi/icons/scenic-spot-selected.png'
  }

  return iconPath.replace(/(\.\w+)$/, '-selected$1')
}

function buildMarkerCallout(point, options = {}) {
  const {
    isActive = false,
    plannedOrder = null
  } = options
  const isPlanned = typeof plannedOrder === 'number'
  const content = isPlanned ? `${String(plannedOrder).padStart(2, '0')} ${point.name}` : point.name

  return {
    content,
    color: isActive ? '#FFFFFF' : (isPlanned ? '#0F3E49' : '#212121'),
    fontSize: isActive ? 11 : 10,
    anchorX: 0,
    anchorY: -4,
    bgColor: isActive ? '#245F6D' : (isPlanned ? 'rgba(181, 230, 220, 0.96)' : 'rgba(255, 255, 255, 0.94)'),
    padding: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: isActive ? '#245F6D' : (isPlanned ? 'rgba(36, 95, 109, 0.28)' : 'rgba(33, 33, 33, 0.08)'),
    display: 'ALWAYS',
    textAlign: 'center'
  }
}

function createDisplayPoint(point, index) {
  return {
    ...point,
    markerId: point.markerId || index + 1,
    width: point.type === 'start' ? 28 : 24,
    height: point.type === 'start' ? 28 : 24,
    activeWidth: point.type === 'start' ? 32 : 28,
    activeHeight: point.type === 'start' ? 32 : 28,
    markerIconPath: point.iconPath,
    activeMarkerIconPath: buildActiveIconPath(point.iconPath)
  }
}

function matchesPoiFilter(point, filterType) {
  switch (filterType) {
    case 'photo_spot':
      return point.type === 'scenic'
    case 'exploration':
      return point.type === 'junction'
    case 'facility':
      return point.type === 'service'
    default:
      return true
  }
}

function normalizePoiFilter(filterType) {
  const normalizedValue = normalizeLookupText(safeDecodeURIComponent(filterType))
  if (!normalizedValue) {
    return ''
  }

  const filterAliasMap = {
    all: 'all',
    全部: 'all',
    全部景点: 'all',
    photo_spot: 'photo_spot',
    photospot: 'photo_spot',
    photo: 'photo_spot',
    scenic: 'photo_spot',
    网红拍照: 'photo_spot',
    拍照: 'photo_spot',
    exploration: 'exploration',
    explore: 'exploration',
    探索: 'exploration',
    探索任务: 'exploration',
    facility: 'facility',
    service: 'facility',
    公共设施: 'facility',
    设施: 'facility'
  }

  return filterAliasMap[normalizedValue] || ''
}

function buildAudioPoi(point) {
  if (!point) {
    return null
  }

  return {
    ...point,
    coverImage: point.iconPath || '/images/poi/icons/scenic-spot.png',
    subtitle: point.sequenceText || point.themeTag || '导览点',
    displayName: point.name
  }
}

function getPointTypeLabel(point) {
  switch (point?.type) {
    case 'start':
    case 'end':
      return '入口点'
    case 'junction':
      return '路线点'
    case 'guide':
      return '导览点'
    case 'service':
      return '服务点'
    case 'scenic':
    default:
      return '景观点'
  }
}

function buildPopupPrimaryMetric(point) {
  const orderText = String(point?.orderText || '').trim()
  if (orderText) {
    return {
      value: orderText,
      unit: '站',
      caption: '路线位置'
    }
  }

  const sequenceText = String(point?.sequenceText || '').trim()
  if (sequenceText) {
    return {
      value: sequenceText,
      unit: '',
      caption: '点位属性'
    }
  }

  return {
    value: getPointTypeLabel(point),
    unit: '',
    caption: '点位分类'
  }
}

function buildPopupSecondaryMetric(point) {
  return {
    value: String(parseStayMinutes(point?.stayText)),
    unit: '分钟',
    caption: '建议停留'
  }
}

function buildPoiPopupData(point, options = {}) {
  if (!point) {
    return null
  }

  const {
    arrived = false,
    audioPlaying = false,
    navigationActive = false,
    audioLocked = false,
    secretMeta = null
  } = options
  const primaryMetric = buildPopupPrimaryMetric(point)
  const secondaryMetric = buildPopupSecondaryMetric(point)
  const typeLabel = getPointTypeLabel(point)
  const isScenicPoint = point.type === 'scenic'
  const showAudioAction = isScenicPoint
  const hasSecretAction = !!secretMeta
  let primaryActionType = 'navigate'
  let primaryActionText = '到这去'
  let showSecondaryAction = isScenicPoint
  let secondaryActionType = isScenicPoint ? 'playaudio' : 'noop'
  let secondaryActionText = isScenicPoint ? (audioLocked ? '解锁讲解' : (audioPlaying ? '继续讲解' : '播放讲解')) : ''

  if (arrived) {
    if (navigationActive) {
      primaryActionType = isScenicPoint ? 'playaudio' : 'completeNavigation'
      primaryActionText = isScenicPoint ? (audioLocked ? '解锁讲解' : (audioPlaying ? '继续讲解' : '开始讲解')) : '完成导航'
      showSecondaryAction = isScenicPoint
      secondaryActionType = 'completeNavigation'
      secondaryActionText = '完成导航'
    } else {
      primaryActionType = isScenicPoint ? 'playaudio' : 'noop'
      primaryActionText = isScenicPoint ? (audioLocked ? '解锁讲解' : (audioPlaying ? '继续讲解' : '开始讲解')) : '已到达'
      showSecondaryAction = false
      secondaryActionType = 'noop'
      secondaryActionText = ''
    }
  }

  return {
    id: point.id,
    markerId: point.markerId,
    poiName: point.name,
    title: point.name,
    typeLabel,
    themeTag: point.themeTag || typeLabel,
    stayText: point.stayText || `建议停留 ${secondaryMetric.value} ${secondaryMetric.unit}`,
    description: point.description || point.shortHint || point.sceneLine || '该点位可作为现场浏览和导览讲解的停留点。',
    guideTip: point.guideTip || point.sceneLine || '建议在这里短暂停留，结合现场环境完成浏览。',
    markerIconPath: point.markerIconPath || point.iconPath || '/images/poi/icons/scenic-spot.png',
    coverImage: DEFAULT_POI_POPUP_COVER,
    primaryMetricValue: primaryMetric.value,
    primaryMetricUnit: primaryMetric.unit,
    primaryMetricCaption: primaryMetric.caption,
    secondaryMetricValue: secondaryMetric.value,
    secondaryMetricUnit: secondaryMetric.unit,
    secondaryMetricCaption: secondaryMetric.caption,
    primaryActionType,
    primaryActionText,
    showSecondaryAction,
    secondaryActionType,
    secondaryActionText,
    showAudioAction,
    audioActionType: showAudioAction ? 'playaudio' : 'noop',
    audioActionText: audioLocked ? '解锁讲解' : (audioPlaying ? '继续讲解' : '播放讲解'),
    audioPlaying: !!audioPlaying,
    showSecretAction: hasSecretAction,
    secretActionType: hasSecretAction ? 'checkin' : 'noop',
    secretActionText: hasSecretAction ? (secretMeta.collected ? '查看暗号' : '去收集暗号') : '',
    secretCodeName: secretMeta?.secretCodeName || '',
    secretThemeTag: secretMeta?.themeTag || '',
    secretCollected: !!secretMeta?.collected,
    arrived
  }
}

function getClosestPointIndex(points, targetPoint) {
  if (!Array.isArray(points) || !points.length || !targetPoint) {
    return -1
  }

  let closestIndex = 0
  let minDistance = Number.POSITIVE_INFINITY

  points.forEach((point, index) => {
    const distance = haversineMeters(point, targetPoint)
    if (distance < minDistance) {
      minDistance = distance
      closestIndex = index
    }
  })

  return closestIndex
}

function getMinDistanceToPolyline(polyline, targetPoint) {
  return getMinDistanceBetweenPoints(polyline?.points || [], targetPoint ? [targetPoint] : [])
}

function resolvePolylineCandidates(polylines, targetPoint, maxDistance) {
  const candidates = (polylines || []).map((polyline, index) => ({
    index,
    cost: getMinDistanceToPolyline(polyline, targetPoint)
  })).sort((left, right) => left.cost - right.cost)

  const nearbyCandidates = candidates.filter((candidate) => candidate.cost <= maxDistance)
  return nearbyCandidates.length ? nearbyCandidates : candidates.slice(0, 1)
}

function buildPolylineGraph(polylines) {
  const graph = Array.from({ length: polylines.length }, () => [])

  for (let leftIndex = 0; leftIndex < polylines.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < polylines.length; rightIndex += 1) {
      const distance = getMinPolylineLinkDistance(polylines[leftIndex], polylines[rightIndex])
      if (distance > ROUTE_SEGMENT_CONNECT_MAX_METERS) {
        continue
      }

      graph[leftIndex].push({
        index: rightIndex,
        weight: distance
      })
      graph[rightIndex].push({
        index: leftIndex,
        weight: distance
      })
    }
  }

  return graph
}

function findPolylinePathIndexesByTargetIndexes(polylines, startCandidates, targetIndexes) {
  if (!Array.isArray(polylines) || !polylines.length || !Array.isArray(startCandidates) || !startCandidates.length || !(targetIndexes instanceof Set) || !targetIndexes.size) {
    return []
  }

  const graph = buildPolylineGraph(polylines)
  const distances = Array(polylines.length).fill(Number.POSITIVE_INFINITY)
  const previous = Array(polylines.length).fill(-1)
  const visited = Array(polylines.length).fill(false)

  startCandidates.forEach((candidate) => {
    distances[candidate.index] = candidate.cost
  })

  let bestTargetIndex = -1
  while (true) {
    let currentIndex = -1
    let currentDistance = Number.POSITIVE_INFINITY

    for (let index = 0; index < polylines.length; index += 1) {
      if (!visited[index] && distances[index] < currentDistance) {
        currentDistance = distances[index]
        currentIndex = index
      }
    }

    if (currentIndex < 0) {
      break
    }

    visited[currentIndex] = true
    if (targetIndexes.has(currentIndex)) {
      bestTargetIndex = currentIndex
      break
    }

    graph[currentIndex].forEach(({ index, weight }) => {
      const nextDistance = distances[currentIndex] + weight
      if (nextDistance < distances[index]) {
        distances[index] = nextDistance
        previous[index] = currentIndex
      }
    })
  }

  if (bestTargetIndex < 0) {
    return []
  }

  const pathIndexes = []
  let cursor = bestTargetIndex
  while (cursor >= 0) {
    pathIndexes.unshift(cursor)
    cursor = previous[cursor]
  }

  return pathIndexes
}

function findPolylinePathIndexes(polylines, startPoint, endPoint) {
  if (!Array.isArray(polylines) || !polylines.length || !startPoint || !endPoint) {
    return []
  }

  const startCandidates = resolvePolylineCandidates(polylines, startPoint, NAVIGATION_START_NEAR_ROUTE_MAX_METERS)
  const endCandidates = resolvePolylineCandidates(polylines, endPoint, ROUTE_SEGMENT_CONNECT_MAX_METERS)
  const candidateRoutes = endCandidates.map((candidate) => {
    const pathIndexes = findPolylinePathIndexesByTargetIndexes(
      polylines,
      startCandidates,
      new Set([candidate.index])
    )

    if (!pathIndexes.length) {
      return null
    }

    const routePolylines = buildRoutePolylinesFromPathIndexes(polylines, pathIndexes, startPoint, endPoint)
    if (!routePolylines.length) {
      return null
    }

    return {
      pathIndexes,
      routeDistance: sumPolylineGroupDistance(routePolylines),
      targetDistance: candidate.cost
    }
  }).filter(Boolean)

  if (candidateRoutes.length) {
    candidateRoutes.sort((left, right) => {
      if (left.routeDistance !== right.routeDistance) {
        return left.routeDistance - right.routeDistance
      }

      if (left.targetDistance !== right.targetDistance) {
        return left.targetDistance - right.targetDistance
      }

      return left.pathIndexes.length - right.pathIndexes.length
    })

    return candidateRoutes[0].pathIndexes
  }

  const fallbackPathIndexes = findPolylinePathIndexesByTargetIndexes(
    polylines,
    startCandidates,
    new Set(endCandidates.map((candidate) => candidate.index))
  )

  if (fallbackPathIndexes.length) {
    return fallbackPathIndexes
  }

  return endCandidates.length ? [endCandidates[0].index] : []
}

function cropPolylineToTarget(polyline, anchorPoint, targetPoint) {
  const orientedPolyline = orientPolylineFromAnchor(polyline, anchorPoint)
  if (!orientedPolyline || !Array.isArray(orientedPolyline.points) || !orientedPolyline.points.length) {
    return null
  }

  const closestIndex = getClosestPointIndex(orientedPolyline.points, targetPoint)
  if (closestIndex < 0) {
    return orientedPolyline
  }

  const endIndex = Math.max(0, closestIndex)
  const croppedPoints = orientedPolyline.points.slice(0, endIndex + 1)

  if (croppedPoints.length >= 2) {
    return {
      ...orientedPolyline,
      points: croppedPoints
    }
  }

  return {
    ...orientedPolyline,
    points: [
      croppedPoints[0],
      {
        latitude: targetPoint.latitude,
        longitude: targetPoint.longitude
      }
    ]
  }
}

function buildRoutePolylinesFromPathIndexes(polylines, pathIndexes, startPoint, targetPoint) {
  if (!Array.isArray(pathIndexes) || !pathIndexes.length) {
    return []
  }

  const continuousPolylines = []
  let previousEndPoint = startPoint

  pathIndexes.forEach((polylineIndex, index) => {
    const sourcePolyline = polylines[polylineIndex]
    if (!sourcePolyline) {
      return
    }

    const isLastPolyline = index === pathIndexes.length - 1
    const orientedPolyline = isLastPolyline
      ? cropPolylineToTarget(sourcePolyline, previousEndPoint, targetPoint)
      : orientPolylineFromAnchor(sourcePolyline, previousEndPoint)

    if (!orientedPolyline || !Array.isArray(orientedPolyline.points) || !orientedPolyline.points.length) {
      return
    }

    const currentStartPoint = orientedPolyline.points[0]
    if (previousEndPoint) {
      const connectorPolyline = buildRouteConnectorPolyline(previousEndPoint, currentStartPoint)
      if (connectorPolyline) {
        continuousPolylines.push(connectorPolyline)
      }
    }

    continuousPolylines.push(orientedPolyline)
    previousEndPoint = orientedPolyline.points[orientedPolyline.points.length - 1]
  })

  if (previousEndPoint) {
    const endConnectorPolyline = buildRouteConnectorPolyline(previousEndPoint, targetPoint, {
      minDistance: 0,
      maxDistance: ROUTE_SEGMENT_CONNECT_MAX_METERS
    })
    if (endConnectorPolyline) {
      continuousPolylines.push(endConnectorPolyline)
    }
  }

  return continuousPolylines
}

function buildRouteToPoiPolylines(polylines, startPoint, targetPoint) {
  const pathIndexes = findPolylinePathIndexes(polylines, startPoint, targetPoint)
  return buildRoutePolylinesFromPathIndexes(polylines, pathIndexes, startPoint, targetPoint)
}

function buildPoiNavigationRoute(targetPoint, startPoint) {
  if (!targetPoint || !startPoint) {
    return null
  }

  const polylines = buildRouteToPoiPolylines(JYL_ROUTE_POLYLINES, startPoint, targetPoint)
  if (!polylines.length) {
    return null
  }

  return buildIntelligentRouteOption(
    `poi-navigation-${targetPoint.id || targetPoint.markerId || targetPoint.name}`,
    `前往${targetPoint.name}`,
    'green',
    '从当前位置或检票口前往目标点位。',
    polylines,
    [targetPoint]
  )
}

function findDisplayPointByName(name) {
  const normalizedName = normalizeLookupText(name)
  if (!normalizedName) {
    return null
  }

  return ALL_ROUTE_DISPLAY_POINTS.find((point) => {
    const pointNames = [
      point?.id,
      point?.key,
      point?.sourceName,
      point?.name,
      point?.title
    ].map((item) => normalizeLookupText(item)).filter(Boolean)

    return pointNames.some((item) => item === normalizedName || item.includes(normalizedName) || normalizedName.includes(item))
  }) || null
}

function resolveDisplayPointFromValue(value) {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'object') {
    return resolveDisplayPointFromValue(
      value.pointId
      || value.poiId
      || value.poi_id
      || value.id
      || value.markerId
      || value.code
      || value.poiCode
      || value.poi_code
      || value.poi
      || value.poiName
      || value.poi_name
      || value.pointName
      || value.name
      || value.title
    )
  }

  const matchedById = getDisplayPointById(value)
  if (matchedById) {
    return matchedById
  }

  return findDisplayPointByName(value)
}

function parseRouteDataInput(routeData) {
  if (!routeData) {
    return null
  }

  if (typeof routeData === 'object') {
    return routeData
  }

  const decodedValue = safeDecodeURIComponent(String(routeData).trim())
  if (!decodedValue) {
    return null
  }

  try {
    return JSON.parse(decodedValue)
  } catch (error) {
    return null
  }
}

function normalizeMapPageOptionValue(options, key, optionsConfig = {}) {
  const { decode = true } = optionsConfig
  const rawValue = options?.[key]

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return ''
  }

  const stringValue = String(rawValue).trim()
  return decode ? safeDecodeURIComponent(stringValue) : stringValue
}

function normalizeMapPageOptions(rawOptions = {}) {
  if (!rawOptions || typeof rawOptions !== 'object') {
    return {}
  }

  return {
    filter: normalizeMapPageOptionValue(rawOptions, 'filter'),
    poi: normalizeMapPageOptionValue(rawOptions, 'poi'),
    poiId: normalizeMapPageOptionValue(rawOptions, 'poiId'),
    poiName: normalizeMapPageOptionValue(rawOptions, 'poiName'),
    showAIRoute: normalizeMapPageOptionValue(rawOptions, 'showAIRoute'),
    action: normalizeMapPageOptionValue(rawOptions, 'action'),
    routeData: normalizeMapPageOptionValue(rawOptions, 'routeData', { decode: false })
  }
}

function extractCoordinateFromRequest(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const coordinate = value.coordinate || value.location || value.coords || null
  const latitude = toFiniteCoordinateValue(
    coordinate?.latitude
    ?? coordinate?.lat
    ?? value.latitude
    ?? value.lat
  )
  const longitude = toFiniteCoordinateValue(
    coordinate?.longitude
    ?? coordinate?.lng
    ?? coordinate?.lon
    ?? value.longitude
    ?? value.lng
    ?? value.lon
  )

  if (latitude === null || longitude === null) {
    return null
  }

  return {
    latitude,
    longitude
  }
}

function findNearestDisplayPointByCoordinate(coordinate) {
  if (!coordinate) {
    return null
  }

  let nearestPoint = null
  let nearestDistance = Number.POSITIVE_INFINITY

  ALL_ROUTE_DISPLAY_POINTS.forEach((point) => {
    if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
      return
    }

    const distance = haversineMeters(coordinate, point)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestPoint = point
    }
  })

  return nearestPoint
}

function normalizeEntryRequest(rawRequest) {
  if (!rawRequest || typeof rawRequest !== 'object') {
    return null
  }

  const parsedRouteData = parseRouteDataInput(rawRequest.routeData)
  const mergedRequest = parsedRouteData
    ? { ...rawRequest, ...parsedRouteData }
    : { ...rawRequest }

  return {
    ...mergedRequest,
    pointId: mergedRequest.pointId
      || mergedRequest.poiId
      || mergedRequest.poi_id
      || mergedRequest.point_id
      || mergedRequest.code
      || mergedRequest.poiCode
      || mergedRequest.poi_code
      || '',
    poiId: mergedRequest.poiId
      || mergedRequest.poi_id
      || mergedRequest.pointId
      || mergedRequest.point_id
      || mergedRequest.code
      || mergedRequest.poiCode
      || mergedRequest.poi_code
      || '',
    poiName: mergedRequest.poiName
      || mergedRequest.poi_name
      || mergedRequest.pointName
      || mergedRequest.point_name
      || mergedRequest.destination
      || '',
    filter: mergedRequest.filter
      || mergedRequest.poiFilter
      || mergedRequest.filterType
      || '',
    routeId: mergedRequest.routeId
      || mergedRequest.route_code
      || '',
    coordinate: extractCoordinateFromRequest(mergedRequest)
  }
}

function buildPoiSequenceRoute(routeData) {
  const routePointsSource = routeData?.pointIds
    || routeData?.poiIds
    || routeData?.points
    || routeData?.pois
    || routeData?.waypoints
    || []

  const resolvedRoutePoints = uniquePoints(
    (Array.isArray(routePointsSource) ? routePointsSource : [routePointsSource])
      .map((item) => resolveDisplayPointFromValue(item))
      .filter(Boolean)
      .filter((point) => point.type !== 'start')
  )

  if (!resolvedRoutePoints.length) {
    return null
  }

  const polylines = []
  let currentStartPoint = DEFAULT_ENTRY_POINT || resolvedRoutePoints[0]

  resolvedRoutePoints.forEach((point) => {
    const currentStartId = String(currentStartPoint?.id || currentStartPoint?.markerId || '')
    const nextPointId = String(point?.id || point?.markerId || '')

    if (currentStartId && currentStartId === nextPointId) {
      currentStartPoint = point
      return
    }

    const segmentPolylines = buildRouteToPoiPolylines(JYL_ROUTE_POLYLINES, currentStartPoint, point)
    if (!segmentPolylines.length) {
      return
    }

    polylines.push(...segmentPolylines)
    currentStartPoint = point
  })

  if (!polylines.length) {
    return null
  }

  const routeName = String(routeData?.name || routeData?.routeName || routeData?.title || '推荐路线').trim()
  const routeDescription = String(
    routeData?.description
    || resolvedRoutePoints.map((point) => point.name).join(' · ')
    || '按点位顺序串联的推荐浏览路线。'
  ).trim()
  const routeIdSeed = resolvedRoutePoints.map((point) => String(point.id || point.markerId)).join('-')

  return buildIntelligentRouteOption(
    `custom-sequence-${routeIdSeed}`,
    routeName,
    'green',
    routeDescription,
    polylines,
    uniquePoints([DEFAULT_ENTRY_POINT, ...resolvedRoutePoints].filter(Boolean))
  )
}

function buildRoutePointNames(route) {
  if (!route || !Array.isArray(route.points)) {
    return []
  }

  return uniquePoints(route.points)
    .filter((point) => point && point.type !== 'start')
    .map((point) => point.name)
    .filter(Boolean)
}

function buildRouteEntryPayload(route) {
  if (!route) {
    return null
  }

  const pointIds = Array.isArray(route.pointIds) && route.pointIds.length
    ? route.pointIds.slice()
    : buildRoutePointNames(route)

  return {
    routeId: route.id,
    name: route.name,
    description: route.description,
    pointIds
  }
}

function buildRouteAIChatInfo(route, customMessage = '') {
  if (!route) {
    return null
  }

  const pointNames = buildRoutePointNames(route)
  const pointSummary = pointNames.slice(0, 6).join('、')
  const pointSuffix = pointNames.length > 6 ? '等点位' : '点位'
  const defaultMessage = [
    `我想详细了解一下${route.name}。`,
    route.description ? `这条路线的特点是：${route.description}` : '',
    `全程约${route.distanceValue}${route.distanceUnit}，预计${route.durationValue}${route.durationUnit}。`,
    pointSummary ? `沿途会经过${pointSummary}${pointSuffix}。` : ''
  ].filter(Boolean).join('')

  return {
    id: route.id,
    type: route.id,
    name: route.name,
    description: route.description,
    distance: `${route.distanceValue}${route.distanceUnit}`,
    distanceText: `${route.distanceValue}${route.distanceUnit}`,
    duration: `${route.durationValue}${route.durationUnit}`,
    durationText: `${route.durationValue}${route.durationUnit}`,
    pointCount: route.pointCount,
    pointNames,
    message: customMessage || defaultMessage,
    routeData: buildRouteEntryPayload(route)
  }
}

function buildRouteAIChatPageUrl(route, customMessage = '') {
  if (!route) {
    return ''
  }

  return `/pages/ai-chat/ai-chat?context=route_planning&hasRouteInfo=true&routeId=${encodeURIComponent(route.id)}`
}

function buildDefaultAIChatPageUrl(message = '') {
  const encodedMessage = encodeURIComponent(message || '我想了解更多关于游览路线的详情。')
  return `/pages/ai-chat/ai-chat?context=route_planning&message=${encodedMessage}`
}

function buildPoiNavigationPageUrl(point) {
  if (!point) {
    return '/pages/map/map'
  }

  const pointId = point.id || point.markerId || ''
  return `/pages/map/map?poiId=${encodeURIComponent(pointId)}&action=navigate`
}

function buildAudioPlaybackPageUrl(point) {
  if (!point) {
    return '/pages/map/map'
  }

  const pointId = point.id || point.markerId || ''
  return `/pages/map/map?poiId=${encodeURIComponent(pointId)}&action=playaudio`
}

function buildCheckInPageUrl(point, secretMeta = null) {
  const query = []
  const mapPointId = String(point?.id || point?.markerId || '').trim()
  const secretId = String(secretMeta?.id || '').trim()

  if (mapPointId) {
    query.push(`mapPointId=${encodeURIComponent(mapPointId)}`)
  }

  if (secretId) {
    query.push(`secretId=${encodeURIComponent(secretId)}`)
  }

  return `/pages/check-in/check-in${query.length ? `?${query.join('&')}` : ''}`
}

function collectRouteViewportPoints(route) {
  if (!route) {
    return []
  }

  const points = []

  if (Array.isArray(route.polylines)) {
    route.polylines.forEach((polyline) => {
      ;(polyline?.points || []).forEach((point) => {
        if (typeof point?.latitude === 'number' && typeof point?.longitude === 'number') {
          points.push(point)
        }
      })
    })
  }

  if (Array.isArray(route.points)) {
    route.points.forEach((point) => {
      if (typeof point?.latitude === 'number' && typeof point?.longitude === 'number') {
        points.push(point)
      }
    })
  }

  return points
}

function buildViewportIncludePoints(points) {
  if (!Array.isArray(points) || !points.length) {
    return []
  }

  const bounds = points.reduce((accumulator, point) => ({
    minLatitude: Math.min(accumulator.minLatitude, point.latitude),
    maxLatitude: Math.max(accumulator.maxLatitude, point.latitude),
    minLongitude: Math.min(accumulator.minLongitude, point.longitude),
    maxLongitude: Math.max(accumulator.maxLongitude, point.longitude)
  }), {
    minLatitude: Number.POSITIVE_INFINITY,
    maxLatitude: Number.NEGATIVE_INFINITY,
    minLongitude: Number.POSITIVE_INFINITY,
    maxLongitude: Number.NEGATIVE_INFINITY
  })

  const latitudePadding = Math.max((bounds.maxLatitude - bounds.minLatitude) * 0.12, 0.00018)
  const longitudePadding = Math.max((bounds.maxLongitude - bounds.minLongitude) * 0.12, 0.00018)

  return [
    {
      latitude: bounds.minLatitude - latitudePadding,
      longitude: bounds.minLongitude - longitudePadding
    },
    {
      latitude: bounds.maxLatitude + latitudePadding,
      longitude: bounds.maxLongitude + longitudePadding
    }
  ]
}

const ALL_ROUTE_DISPLAY_POINTS = JYL_ROUTE_MARKER_POINTS.map(createDisplayPoint)
const ALL_AUDIO_POI_POINTS = JYL_MARKER_POINTS.map(buildAudioPoi)
const AUTO_AUDIO_POI_POINTS = JYL_MARKER_POINTS
  .filter((point) => point.type === 'scenic')
  .map((point) => buildAudioPoi(point))
const ALL_ROUTE_POLYLINE_POINTS = JYL_ROUTE_POLYLINES.flatMap((polyline) => polyline.points)
const PRIMARY_ROUTE_POLYLINES = buildEntranceToMainPolylines(JYL_ROUTE_POLYLINES, DEFAULT_ENTRY_POINT)
const FULL_ROUTE_PLAN_POINTS = uniquePoints([DEFAULT_ENTRY_POINT, ...JYL_MARKER_POINTS])
const HIGHLIGHT_ROUTE_POINTS = uniquePoints([
  DEFAULT_ENTRY_POINT,
  ...pickEvenlySpacedPoints(JYL_MARKER_POINTS, Math.min(HIGHLIGHT_ROUTE_SPOT_COUNT, JYL_MARKER_POINTS.length))
])

const INTELLIGENT_ROUTE_OPTIONS = [
  buildIntelligentRouteOption(
    'route-highlight',
    '轻松精华线',
    'green',
    '从检票口进入，串联主线核心点位，适合第一次到访。',
    PRIMARY_ROUTE_POLYLINES,
    HIGHLIGHT_ROUTE_POINTS
  ),
  buildIntelligentRouteOption(
    'route-deep',
    '深度探索线',
    'blue',
    '从检票口进入，覆盖全部公开导览点，并保留支线探索。',
    JYL_ROUTE_POLYLINES,
    FULL_ROUTE_PLAN_POINTS
  )
]

const INTELLIGENT_ROUTE_CARD_OPTIONS = INTELLIGENT_ROUTE_OPTIONS.map((route) => ({
  id: route.id,
  name: route.name,
  themeClass: route.theme === 'green' ? 'theme-green' : 'theme-blue',
  description: route.description,
  durationValue: route.durationValue,
  durationUnit: route.durationUnit,
  distanceValue: route.distanceValue,
  distanceUnit: route.distanceUnit,
  pointCount: route.pointCount
}))

const MAP_INCLUDE_POINTS = [
  ...ALL_ROUTE_POLYLINE_POINTS,
  ...ALL_ROUTE_DISPLAY_POINTS.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude
  }))
]

const DEFAULT_SCENIC_CENTER = buildCenter(MAP_INCLUDE_POINTS)
const DEFAULT_ENTRY_CENTER = DEFAULT_ENTRY_POINT
  ? {
    latitude: DEFAULT_ENTRY_POINT.latitude,
    longitude: DEFAULT_ENTRY_POINT.longitude
  }
  : DEFAULT_SCENIC_CENTER

function getDisplayPointById(pointId) {
  const rawPointId = String(pointId || '').trim()
  const resolvedMarkerId = resolvePoiSourceCodeToMarkerId(rawPointId)

  return ALL_ROUTE_DISPLAY_POINTS.find((point) => (
    String(point.id) === rawPointId
      || String(point.markerId) === rawPointId
      || (resolvedMarkerId && String(point.markerId) === resolvedMarkerId)
  )) || null
}

function getFilteredDisplayPoints(filterType) {
  return ALL_ROUTE_DISPLAY_POINTS.filter((point) => matchesPoiFilter(point, filterType))
}

function getDefaultAudioPoi(filterType) {
  const preferredPoint = JYL_MARKER_POINTS.find((point) => matchesPoiFilter(point, filterType))
    || JYL_MARKER_POINTS[0]
    || DEFAULT_ENTRY_POINT

  return buildAudioPoi(preferredPoint)
}

function getIntelligentRouteById(routeId) {
  return INTELLIGENT_ROUTE_OPTIONS.find((route) => route.id === routeId) || null
}

function buildPlannedOrderMap(selectedRoute) {
  if (!selectedRoute || !Array.isArray(selectedRoute.points)) {
    return null
  }

  return selectedRoute.points.reduce((accumulator, point, index) => {
    accumulator[String(point.id)] = index + 1
    return accumulator
  }, {})
}

function buildMarkers(filterType, selectedPointId, selectedRoute = null, options = {}) {
  const visiblePointIdSet = Array.isArray(options.visiblePointIds) && options.visiblePointIds.length
    ? new Set(options.visiblePointIds.map((item) => String(item)))
    : null
  const plannedOrderMap = buildPlannedOrderMap(selectedRoute)

  return getFilteredDisplayPoints(filterType).filter((point) => {
    if (!visiblePointIdSet) {
      return true
    }

    return visiblePointIdSet.has(String(point.id))
  }).map((point) => {
    const isActive = String(point.id) === String(selectedPointId)
    const plannedOrder = plannedOrderMap ? plannedOrderMap[String(point.id)] : null
    const isPlanned = typeof plannedOrder === 'number'

    return {
      id: point.markerId,
      latitude: point.latitude,
      longitude: point.longitude,
      width: isActive ? point.activeWidth : (isPlanned ? point.width + 2 : point.width),
      height: isActive ? point.activeHeight : (isPlanned ? point.height + 2 : point.height),
      iconPath: isActive ? point.activeMarkerIconPath : point.markerIconPath,
      callout: buildMarkerCallout(point, {
        isActive,
        plannedOrder
      })
    }
  })
}

function buildRouteAudioPoiList(route) {
  if (!route || !Array.isArray(route.points)) {
    return ALL_AUDIO_POI_POINTS
  }

  return route.points
    .filter((point) => point.checkinVisible)
    .map((point) => buildAudioPoi(point))
}

function buildNavigationAudioPoiList(targetPoint, guidePoints = []) {
  const orderedPoints = uniquePoints([targetPoint, ...(guidePoints || [])].filter(Boolean))
  const audioPoiList = orderedPoints.map((point) => buildAudioPoi(point))
  return audioPoiList.length ? audioPoiList : (targetPoint ? [buildAudioPoi(targetPoint)] : ALL_AUDIO_POI_POINTS)
}

function buildNearbyAudioPoiList(anchorPoint, options = {}) {
  if (!anchorPoint) {
    return ALL_AUDIO_POI_POINTS
  }

  const {
    limit = ARRIVED_AUDIO_POI_LIMIT
  } = options
  const safeLimit = Math.max(1, limit)
  const anchorId = String(anchorPoint.id || anchorPoint.markerId || '')
  const result = []
  const seen = new Set()
  const sortedPoiList = ALL_AUDIO_POI_POINTS
    .map((poi) => ({
      poi,
      distance: String(poi.id || poi.markerId || '') === anchorId ? 0 : haversineMeters(anchorPoint, poi)
    }))
    .sort((left, right) => left.distance - right.distance)

  const appendPoi = (poi) => {
    if (!poi) {
      return
    }

    const poiId = String(poi.id || poi.markerId || '')
    if (!poiId || seen.has(poiId)) {
      return
    }

    seen.add(poiId)
    result.push({
      ...poi
    })
  }

  appendPoi(buildAudioPoi(anchorPoint))

  for (const { poi } of sortedPoiList) {
    appendPoi(poi)
    if (result.length >= safeLimit) {
      break
    }
  }

  return result.length ? result : [buildAudioPoi(anchorPoint)]
}

Page({
  data: {
    navigationBarTotalHeight: 64,
    longitude: DEFAULT_ENTRY_CENTER.longitude,
    latitude: DEFAULT_ENTRY_CENTER.latitude,
    scale: DEFAULT_ENTRY_SCALE,
    showLocation: true,
    enablePOI: ENABLE_POI,
    allowedZooms: ALLOWED_ZOOMS,
    mapBoundaryLimit: null,
    allMarkers: buildMarkers('all', null),
    markers: [],
    polylineData: buildMapPolylines(),
    showPoiFilter: true,
    currentPoiFilter: 'all',
    showAudioPlayer: true,
    navigationAudioMode: 'full',
    currentAudioPoi: buildAudioPoi(DEFAULT_ENTRY_POINT) || ALL_AUDIO_POI_POINTS[0] || null,
    userScore: 85,
    userRankPercent: 75,
    showAudioProgress: true,
    audioPoiList: ALL_AUDIO_POI_POINTS,
    showAudioListDrawer: false,
    audioPlaying: false,
    audioProgress: 0,
    audioCurrentTime: 0,
    audioTotalTime: 180,
    audioMuted: false,
    audioAccessPaid: false,
    autoAudioEnabled: true,
    navigationActive: false,
    navigationInfo: null,
    navigationDestination: null,
    navigationSource: '',
    navigationRecalculating: false,
    navigationAutoAudioHint: '',
    userLocation: null,
    preNavigationState: null,
    intelligentRoutePlanningText: '智能线路规划',
    plannerRoutes: INTELLIGENT_ROUTE_CARD_OPTIONS,
    showIntelligentPlanner: false,
    selectedIntelligentRouteId: '',
    selectedPointId: null,
    showPoiPopup: false,
    currentPopupData: null
  },

  onLoad(options = {}) {
    this.locationPermissionPromptShown = false
    this.locationPermissionPrompting = false
    this.keepScreenOnReasons = new Set()
    this.keepScreenOnEnabled = false
    this.autoAudioState = {
      lastAutoPoiId: '',
      lastTriggerTime: 0
    }
    const systemInfo = wx.getSystemInfoSync()
    const menuButton = typeof wx.getMenuButtonBoundingClientRect === 'function'
      ? wx.getMenuButtonBoundingClientRect()
      : null
    const statusBarHeight = systemInfo.statusBarHeight || 20

    let navigationBarTotalHeight = statusBarHeight + 44
    if (menuButton) {
      navigationBarTotalHeight = statusBarHeight + (menuButton.top - statusBarHeight) * 2 + menuButton.height
    }

    this.selectedIntelligentRoute = null
    this.preNavigationSelectedRoute = null
    const pageOptions = normalizeMapPageOptions(options)
    const hasDirectEntryTarget = Boolean(
      pageOptions.filter
        || pageOptions.poi
        || pageOptions.poiId
        || pageOptions.poiName
        || pageOptions.routeData
    )

    this.pageOptions = pageOptions
    this.setData({
      navigationBarTotalHeight
    }, () => {
      this.handleEntryRequest(pageOptions)

      if (!hasDirectEntryTarget && pageOptions.action === 'executeAIRouteTest') {
        const previewRoute = INTELLIGENT_ROUTE_OPTIONS[0] || null
        if (previewRoute) {
          this.applyPreviewRoute(previewRoute, {
            toastTitle: `已加载${previewRoute.name}`
          })
        }
        return
      }

      if (!hasDirectEntryTarget && normalizeBooleanValue(pageOptions.showAIRoute)) {
        this.onIntelligentRoutePlanning()
      }
    })
  },

  onShow() {
    this.refreshAudioAccessState()
    this.checkLocationPermission()
    this.checkPendingNavigationRequest()

    if (this.data.audioPlaying) {
      this.requestKeepScreenOn('audio')
    }

    if (this.data.navigationActive) {
      this.startNavigationTracking({
        immediate: true
      })
    }
  },

  onHide() {
    this.stopNavigationTracking()
    this.stopAutoAudioTracking()
    this.locationPermissionPromptShown = false
    this.locationPermissionPrompting = false
    this.disableKeepScreenOn()
  },

  refreshAudioAccessState() {
    this.setData({
      audioAccessPaid: this.hasVipAccess()
    }, () => {
      this.syncCurrentPopupDataWithAudioAccess()
    })
  },

  syncCurrentPopupDataWithAudioAccess(options = {}) {
    const popupData = this.data.currentPopupData
    if (!popupData) {
      return
    }

    const point = getDisplayPointById(popupData.id || popupData.markerId)
    if (!point) {
      return
    }

    const {
      audioPlaying = !!this.data.audioPlaying,
      navigationActive = !!this.data.navigationActive
    } = options

    this.setData({
      currentPopupData: this.buildPointPopupData(point, {
        arrived: !!popupData.arrived,
        audioPlaying,
        navigationActive
      })
    })
  },

  resolveSecretMetaForPoint(point) {
    if (!point) {
      return null
    }

    const linkedSecretPoint = SECRET_POINT_BY_MAP_POINT_ID[String(point.id || point.markerId || '').trim()]
    if (!linkedSecretPoint) {
      return null
    }

    return {
      ...linkedSecretPoint,
      collected: isPointChecked(linkedSecretPoint.id)
    }
  },

  buildPointPopupData(point, options = {}) {
    return buildPoiPopupData(point, {
      ...options,
      audioLocked: point?.type === 'scenic' && !this.hasVipAccess(),
      secretMeta: this.resolveSecretMetaForPoint(point)
    })
  },

  buildAudioPaywallUrl(point) {
    const pointName = point?.name || point?.displayName || '当前景点'
    const description = '解锁景点语音讲解需要VIP权限'
    const successRedirect = buildAudioPlaybackPageUrl(point)

    return `/pages/payment/subscribe/subscribe?feature=${encodeURIComponent(AUDIO_FEATURE_KEY)}&featureName=${encodeURIComponent('景点语音讲解')}&productName=${encodeURIComponent('景点语音讲解')}&description=${encodeURIComponent(description)}&amount=${AUDIO_PAYWALL_PRICE}&originalPrice=69&successRedirect=${encodeURIComponent(successRedirect)}`
  },

  openAudioPaywall(point, options = {}) {
    const now = Date.now()
    if (this.lastAudioPaywallAt && now - this.lastAudioPaywallAt < AUDIO_PAYWALL_THROTTLE_MS) {
      return
    }

    this.lastAudioPaywallAt = now

    if (options.showToast !== false) {
      wx.showToast({
        title: '请先开通讲解权限',
        icon: 'none',
        duration: 1600
      })
    }

    setTimeout(() => {
      navigateToPage(this.buildAudioPaywallUrl(point))
    }, options.navigateDelayMs ?? 180)
  },

  requestAudioAccessForPoint(point, options = {}) {
    const {
      source = 'manual',
      openPaywallOnBlocked = source !== 'auto'
    } = options

    this.refreshAudioAccessState()

    if (this.hasVipAccess()) {
      return true
    }

    const blockedHint = '开通VIP后可继续收听全部讲解'
    if (this.data.navigationActive) {
      this.setNavigationAudioHint(blockedHint)
    }

    if (source === 'auto' && openPaywallOnBlocked) {
      wx.showToast({
        title: blockedHint,
        icon: 'none',
        duration: 1800
      })
    }

    if (openPaywallOnBlocked) {
      this.openAudioPaywall(point, {
        showToast: source !== 'auto'
      })
    }

    return false
  },

  onUnload() {
    this.stopNavigationTracking()
    this.stopAutoAudioTracking()
    this.locationPermissionPromptShown = false
    this.locationPermissionPrompting = false
    this.resetScreenOnState()
  },

  applyKeepScreenOnState() {
    const nextEnabled = !!(this.keepScreenOnReasons && this.keepScreenOnReasons.size)

    if (nextEnabled === this.keepScreenOnEnabled) {
      return
    }

    this.keepScreenOnEnabled = nextEnabled
    wx.setKeepScreenOn({
      keepScreenOn: nextEnabled,
      fail: () => {
        this.keepScreenOnEnabled = false
      }
    })
  },

  requestKeepScreenOn(reason = 'default') {
    if (!this.keepScreenOnReasons) {
      this.keepScreenOnReasons = new Set()
    }

    this.keepScreenOnReasons.add(String(reason || 'default'))
    this.applyKeepScreenOnState()
  },

  releaseKeepScreenOn(reason = 'default') {
    if (!this.keepScreenOnReasons) {
      return
    }

    this.keepScreenOnReasons.delete(String(reason || 'default'))
    this.applyKeepScreenOnState()
  },

  disableKeepScreenOn() {
    if (!this.keepScreenOnEnabled) {
      return
    }

    this.keepScreenOnEnabled = false
    wx.setKeepScreenOn({
      keepScreenOn: false,
      fail: () => {}
    })
  },

  resetScreenOnState() {
    if (this.keepScreenOnReasons) {
      this.keepScreenOnReasons.clear()
    }

    this.disableKeepScreenOn()
  },

  onMapReady(event) {
    this.mapCtx = event.detail

    if (this.pendingViewportFocus) {
      const pendingViewportFocus = this.pendingViewportFocus
      this.pendingViewportFocus = null
      this.focusIncludePoints(pendingViewportFocus.includePoints, pendingViewportFocus)
    }
  },

  onRegionChange(event) {
    const nextScale = event?.detail?.scale
    if (typeof nextScale === 'number' && nextScale !== this.data.scale) {
      this.setData({
        scale: nextScale
      })
    }
  },

  onScaleUpdate(event) {
    const nextScale = event?.detail?.scale
    if (typeof nextScale === 'number' && nextScale !== this.data.scale) {
      this.setData({
        scale: nextScale
      })
    }
  },

  focusIncludePoints(includePoints, options = {}) {
    if (!Array.isArray(includePoints) || includePoints.length < 2) {
      return
    }

    const padding = Array.isArray(options.padding) ? options.padding : [140, 56, 300, 56]
    const delay = typeof options.delay === 'number' ? options.delay : 120

    if (!this.mapCtx || typeof this.mapCtx.includePoints !== 'function') {
      this.pendingViewportFocus = {
        includePoints,
        padding,
        delay
      }
      return
    }

    setTimeout(() => {
      if (!this.mapCtx || typeof this.mapCtx.includePoints !== 'function') {
        return
      }

      this.mapCtx.includePoints({
        points: includePoints,
        padding
      })
    }, delay)
  },

  focusRouteInViewport(route, options = {}) {
    const includePoints = buildViewportIncludePoints(collectRouteViewportPoints(route))
    this.focusIncludePoints(includePoints, options)
  },

  focusPointInViewport(point, options = {}) {
    if (!point) {
      return
    }

    const previewPoints = buildViewportIncludePoints([
      point,
      {
        latitude: point.latitude + 0.00028,
        longitude: point.longitude
      }
    ])

    this.focusIncludePoints(previewPoints, {
      padding: [156, 56, 340, 56],
      delay: 80,
      ...options
    })
  },

  getNavigationVisiblePointIdSet(selectedPointId = null) {
    const pointIds = new Set()

    if (selectedPointId !== null && selectedPointId !== undefined) {
      pointIds.add(String(selectedPointId))
    }

    const targetPoint = this.getNavigationTargetPoint()
    if (targetPoint?.id) {
      pointIds.add(String(targetPoint.id))
    }

    ;(this.navigationGuidePoints || []).forEach((point) => {
      if (point?.id) {
        pointIds.add(String(point.id))
      }
    })

    return pointIds
  },

  getNavigationAudioPoiList(targetPoint = null) {
    return buildNavigationAudioPoiList(targetPoint || this.getNavigationTargetPoint(), this.navigationGuidePoints)
  },

  setNavigationAudioHint(hintText = '') {
    if (!this.data.navigationActive) {
      return
    }

    this.setData({
      navigationAutoAudioHint: hintText
    }, () => {
      this.updateNavigationInfoState(this.data.userLocation, {
        recalculating: this.data.navigationRecalculating
      })
    })
  },

  buildVisibleMarkers(filterType, selectedPointId, selectedRoute = this.selectedIntelligentRoute, options = {}) {
    const {
      navigationMode = this.data.navigationActive
    } = options

    const visiblePointIds = navigationMode
      ? Array.from(this.getNavigationVisiblePointIdSet(selectedPointId))
      : null

    return buildMarkers(filterType, selectedPointId, selectedRoute, {
      visiblePointIds
    })
  },

  getNavigationTargetPoint() {
    return resolveDisplayPointFromValue(this.data.navigationDestination)
  },

  getNavigationRouteProgress(userLocation, route = this.selectedIntelligentRoute) {
    if (!route || !userLocation) {
      return null
    }

    return estimateNavigationProgress(route, userLocation)
  },

  getUpcomingNavigationGuide(progress, userLocation = null) {
    const guidePoints = Array.isArray(this.navigationGuidePoints) ? this.navigationGuidePoints : []
    if (!guidePoints.length) {
      return null
    }

    const playedPointIds = this.navigationAutoPlayedPointIds || new Set()
    const currentPathIndex = typeof progress?.closestIndex === 'number' ? progress.closestIndex : -1
    const candidate = guidePoints.find((point) => {
      const pointId = String(point.id || point.markerId || point.name)
      if (playedPointIds.has(pointId)) {
        return false
      }

      return typeof point.closestPathIndex !== 'number' || point.closestPathIndex >= currentPathIndex - 8
    })

    if (!candidate) {
      return null
    }

    return {
      ...candidate,
      distanceToGuideMeters: userLocation ? haversineMeters(userLocation, candidate) : Number.NaN
    }
  },

  markNavigationGuidePlayed(pointId) {
    const safePointId = String(pointId || '')
    if (!safePointId) {
      return
    }

    if (!this.navigationAutoPlayedPointIds) {
      this.navigationAutoPlayedPointIds = new Set()
    }

    this.navigationAutoPlayedPointIds.add(safePointId)
  },

  autoPlayNavigationGuide(point) {
    if (!point) {
      return
    }

    const audioPoi = buildAudioPoi(point)
    const currentAudioPoiId = String(this.data.currentAudioPoi?.id || this.data.currentAudioPoi?.markerId || '')
    const nextAudioPoiId = String(audioPoi?.id || audioPoi?.markerId || '')
    const isSamePoi = currentAudioPoiId && currentAudioPoiId === nextAudioPoiId
    const audioPlayer = this.selectComponent('#audioPlayerGuide')

    if (!audioPlayer || typeof audioPlayer.playAudio !== 'function') {
      return
    }

    const finishBlockedAutoPlay = () => {
      this.markNavigationGuidePlayed(point.id || point.markerId || point.name)
      this.setData({
        navigationAutoAudioHint: '免费讲解已用完，可开通后继续自动播放'
      }, () => {
        this.updateNavigationInfoState(this.data.userLocation, {
          recalculating: this.data.navigationRecalculating
        })
      })
    }

    const finishAutoPlay = () => {
      this.markNavigationGuidePlayed(point.id || point.markerId || point.name)
      this.setData({
        navigationAutoAudioHint: `已自动播放 ${point.name} 讲解`
      }, () => {
        this.updateNavigationInfoState(this.data.userLocation, {
          recalculating: this.data.navigationRecalculating
        })
      })
    }

    if (isSamePoi && this.data.audioPlaying) {
      finishAutoPlay()
      return
    }

    if (this.data.audioPlaying && !isSamePoi) {
      return
    }

    if (!this.requestAudioAccessForPoint(point, {
      source: 'auto',
      openPaywallOnBlocked: false
    })) {
      finishBlockedAutoPlay()
      return
    }

    const playAudio = () => {
      audioPlayer.playAudio()
      finishAutoPlay()
    }

    if (isSamePoi) {
      this.setData({
        showAudioPlayer: true
      }, playAudio)
      return
    }

    this.setData({
      showAudioPlayer: true,
      currentAudioPoi: audioPoi,
      audioPlaying: false
    }, playAudio)
  },

  maybeTriggerNavigationGuideAudio(progress, userLocation) {
    const upcomingGuide = this.getUpcomingNavigationGuide(progress, userLocation)
    if (!upcomingGuide || !Number.isFinite(upcomingGuide.distanceToGuideMeters)) {
      return upcomingGuide
    }

    const triggerRadius = Math.max(24, Number(upcomingGuide.triggerRadiusM) || 36)
    if (upcomingGuide.distanceToGuideMeters > triggerRadius) {
      return upcomingGuide
    }

    this.autoPlayNavigationGuide(upcomingGuide)
    return upcomingGuide
  },

  playNavigationArrivalAudio(point) {
    if (!point) {
      return
    }

    const audioPlayer = this.selectComponent('#audioPlayerGuide')
    if (!audioPlayer || typeof audioPlayer.playAudio !== 'function') {
      return
    }

    const nextAudioPoi = buildAudioPoi(point)
    const currentAudioPoiId = String(this.data.currentAudioPoi?.id || this.data.currentAudioPoi?.markerId || '')
    const nextAudioPoiId = String(nextAudioPoi?.id || nextAudioPoi?.markerId || '')
    const isSamePoi = currentAudioPoiId && currentAudioPoiId === nextAudioPoiId

    if (isSamePoi && this.data.audioPlaying) {
      return
    }

    if (!this.requestAudioAccessForPoint(point, {
      source: 'auto',
      openPaywallOnBlocked: false
    })) {
      return
    }

    const startPlayback = () => {
      audioPlayer.playAudio()
    }

    if (isSamePoi) {
      this.setData({
        showAudioPlayer: true,
        navigationAudioMode: 'full'
      }, startPlayback)
      return
    }

    this.setData({
      showAudioPlayer: true,
      navigationAudioMode: 'full',
      currentAudioPoi: nextAudioPoi,
      audioPlaying: false,
      audioProgress: 0,
      audioCurrentTime: 0
    }, startPlayback)
  },

  buildArrivedPopupData(point) {
    return this.buildPointPopupData(point, {
      arrived: true,
      audioPlaying: !!this.data.audioPlaying,
      navigationActive: !!this.data.navigationActive
    })
  },

  syncArrivedPopupData(options = {}) {
    const popupData = this.data.currentPopupData
    if (!popupData?.arrived) {
      return
    }

    this.syncCurrentPopupDataWithAudioAccess({
      audioPlaying: options.audioPlaying,
      navigationActive: options.navigationActive
    })
  },

  restoreArrivedDestinationPanel() {
    const point = this.getNavigationTargetPoint()
    if (!point || !this.navigationDestinationReached) {
      return
    }

    this.setData({
      selectedPointId: point.id,
      currentAudioPoi: buildAudioPoi(point),
      audioPoiList: buildNearbyAudioPoiList(point),
      showPoiPopup: true,
      currentPopupData: this.buildArrivedPopupData(point),
      showAudioPlayer: true,
      navigationAudioMode: 'full',
      allMarkers: this.buildVisibleMarkers('all', point.id, this.selectedIntelligentRoute, {
        navigationMode: true
      })
    }, () => {
      this.focusPointInViewport(point)
    })
  },

  completeNavigationAtDestination(options = {}) {
    const {
      showToast = true
    } = options
    const point = this.getNavigationTargetPoint()

    if (!point) {
      this.endNavigation()
      return
    }

    this.stopNavigationTracking()
    this.selectedIntelligentRoute = null
    this.preNavigationSelectedRoute = null
    this.navigationArrivalNotified = false
    this.navigationLastRecalculateAt = 0
    this.navigationDestinationReached = false
    this.navigationDestinationPopupShown = false
    this.navigationGuidePoints = []
    this.navigationAutoPlayedPointIds = new Set()

    this.setData({
      currentPoiFilter: 'all',
      selectedPointId: point.id,
      selectedIntelligentRouteId: '',
      currentAudioPoi: buildAudioPoi(point),
      audioPoiList: buildNearbyAudioPoiList(point),
      showAudioPlayer: true,
      allMarkers: this.buildVisibleMarkers('all', point.id, null, {
        navigationMode: false
      }),
      polylineData: buildMapPolylines(),
      longitude: point.longitude,
      latitude: point.latitude,
      scale: this.data.scale,
      intelligentRoutePlanningText: '智能线路规划',
      showAudioListDrawer: false,
      showPoiPopup: true,
      currentPopupData: this.buildPointPopupData(point, {
        arrived: true,
        audioPlaying: !!this.data.audioPlaying,
        navigationActive: false
      }),
      showIntelligentPlanner: false,
      navigationActive: false,
      navigationAudioMode: 'full',
      navigationInfo: null,
      navigationDestination: null,
      navigationSource: '',
      navigationRecalculating: false,
      navigationAutoAudioHint: '',
      preNavigationState: null
    }, () => {
      this.ensureAutoAudioTrackingState({
        immediate: true
      })
      this.focusPointInViewport(point)
      if (showToast) {
        wx.showToast({
          title: `已到达${point.name}`,
          icon: 'none',
          duration: 1600
        })
      }
    })
  },

  handleNavigationArrival(point, userLocation, progress = null) {
    if (!point || this.navigationDestinationPopupShown) {
      return
    }

    this.navigationDestinationPopupShown = true
    this.navigationDestinationReached = true

    const popupData = this.buildArrivedPopupData(point)

    this.setData({
      selectedPointId: point.id,
      audioPoiList: buildNearbyAudioPoiList(point),
      showPoiPopup: true,
      currentPopupData: popupData,
      showAudioPlayer: true,
      navigationAudioMode: 'full',
      navigationAutoAudioHint: `已到达 ${point.name}，已展开景点信息`,
      allMarkers: this.buildVisibleMarkers('all', point.id, this.selectedIntelligentRoute, {
        navigationMode: true
      })
    }, () => {
      this.focusPointInViewport(point)
      this.updateNavigationInfoState(userLocation, {
        recalculating: false
      })
      this.playNavigationArrivalAudio(point)
    })
  },

  updateNavigationInfoState(userLocation = null, options = {}) {
    if (!this.data.navigationActive) {
      return
    }

    const targetPoint = this.getNavigationTargetPoint()
    const route = this.selectedIntelligentRoute
    if (!targetPoint || !route) {
      return
    }

    const progress = userLocation ? this.getNavigationRouteProgress(userLocation, route) : null
    const upcomingGuide = progress ? this.getUpcomingNavigationGuide(progress, userLocation) : null
    const routePolylinePoints = route ? flattenRoutePolylinePoints(route) : []
    const progressPercent = this.navigationDestinationReached
      ? 100
      : progress && routePolylinePoints.length
      ? Math.max(0, Math.min(100, Math.round((progress.closestIndex / Math.max(routePolylinePoints.length - 1, 1)) * 100)))
      : 0
    const nextGuideText = this.navigationDestinationReached
      ? '已到达目标点'
      : !progress
      ? '等待定位后识别下一讲解点'
      : upcomingGuide
      ? `下一讲解 ${upcomingGuide.name}${Number.isFinite(upcomingGuide.distanceToGuideMeters) ? ` · ${Math.round(upcomingGuide.distanceToGuideMeters)}m` : ''}`
      : '已接近终点'
    const defaultAudioHintText = this.navigationDestinationReached
      ? (this.data.audioPlaying
        ? `正在播放${targetPoint.name}讲解`
        : '已到达目标点，可先听讲解再完成导航')
      : progress
      ? '接近沿途景点时会自动播放讲解'
      : '未获取到实时位置，可点右侧定位刷新'
    const navigationInfo = buildNavigationCardState(
      targetPoint,
      route,
      this.data.navigationSource || 'entry',
      {
        locationAvailable: !!progress,
        arrived: !!this.navigationDestinationReached,
        recalculating: !!options.recalculating,
        remainingDistanceMeters: progress?.remainingDistanceMeters ?? route.distanceMeters,
        distanceToDestinationMeters: progress?.distanceToDestinationMeters,
        minDistanceToRoute: progress?.minDistanceToRoute,
        updatedAt: progress ? Date.now() : 0
      }
    )
    navigationInfo.progressPercent = progressPercent
    navigationInfo.progressText = this.navigationDestinationReached
      ? '路线已完成'
      : progress
      ? `路线进度 ${progressPercent}%`
      : '等待位置更新'
    navigationInfo.stepItems = buildNavigationStepItems(
      targetPoint,
      this.data.navigationSource || 'entry',
      {
        progress,
        guidePoints: this.navigationGuidePoints,
        arrived: !!this.navigationDestinationReached
      }
    )
    navigationInfo.nextGuideText = nextGuideText
    navigationInfo.audioHintText = this.data.navigationAutoAudioHint || defaultAudioHintText
    navigationInfo.arrived = !!this.navigationDestinationReached

    const nextState = {
      navigationInfo
    }

    if (userLocation) {
      nextState.userLocation = userLocation
    }

    this.setData(nextState)
  },

  fetchCurrentLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: ({ latitude, longitude, accuracy = 0 }) => {
          resolve({
            id: 'current-location',
            name: '当前位置',
            latitude,
            longitude,
            accuracy
          })
        },
        fail: reject
      })
    })
  },

  stopNavigationTracking() {
    if (this.navigationTrackingTimer) {
      clearInterval(this.navigationTrackingTimer)
      this.navigationTrackingTimer = null
    }
  },

  shouldKeepAutoAudioTrackingRunning() {
    return !!this.data.showLocation
      && !this.data.navigationActive
      && this.data.autoAudioEnabled !== false
  },

  ensureAutoAudioTrackingState(options = {}) {
    if (this.shouldKeepAutoAudioTrackingRunning()) {
      this.startAutoAudioTracking(options)
      return
    }

    this.stopAutoAudioTracking()
  },

  stopAutoAudioTracking() {
    if (this.autoAudioTrackingTimer) {
      clearInterval(this.autoAudioTrackingTimer)
      this.autoAudioTrackingTimer = null
    }
  },

  startAutoAudioTracking(options = {}) {
    const {
      immediate = false
    } = options

    if (!this.shouldKeepAutoAudioTrackingRunning()) {
      this.stopAutoAudioTracking()
      return
    }

    const isRunning = !!this.autoAudioTrackingTimer
    if (!isRunning) {
      this.autoAudioTrackingTimer = setInterval(() => {
        this.refreshAutoAudioTracking()
      }, AUTO_AUDIO_TRACK_INTERVAL_MS)
    }

    if (immediate || !isRunning) {
      this.refreshAutoAudioTracking()
    }
  },

  refreshAutoAudioTracking() {
    if (!this.shouldKeepAutoAudioTrackingRunning()) {
      return
    }

    this.fetchCurrentLocation()
      .then((userLocation) => {
        this.handleAutoAudioLocationUpdate(userLocation)
      })
      .catch(() => {})
  },

  handleAutoAudioLocationUpdate(userLocation) {
    if (!this.shouldKeepAutoAudioTrackingRunning() || !userLocation) {
      return
    }

    this.setData({
      userLocation
    })

    this.handleAutoAudioPlayback(userLocation)
  },

  findNearestAutoAudioPoi(userLocation) {
    if (!userLocation || !AUTO_AUDIO_POI_POINTS.length) {
      return null
    }

    let candidate = null
    let minDistance = Number.POSITIVE_INFINITY

    AUTO_AUDIO_POI_POINTS.forEach((point) => {
      const distance = haversineMeters(userLocation, point)
      const triggerRadius = Math.max(16, Number(point.triggerRadiusM) || AUTO_AUDIO_DEFAULT_TRIGGER_RADIUS_METERS)

      if (distance <= triggerRadius && distance < minDistance) {
        minDistance = distance
        candidate = {
          ...point,
          triggerRadius
        }
      }
    })

    return candidate
  },

  handleAutoAudioPlayback(userLocation) {
    if (!this.shouldKeepAutoAudioTrackingRunning() || !userLocation) {
      return
    }

    if (!this.isLocationInScenicArea(userLocation)) {
      return
    }

    if (typeof userLocation.accuracy === 'number' && userLocation.accuracy > AUTO_AUDIO_ACCURACY_THRESHOLD_METERS) {
      return
    }

    const nearestPoi = this.findNearestAutoAudioPoi(userLocation)
    if (!nearestPoi) {
      return
    }

    const poiId = String(nearestPoi.id || nearestPoi.markerId || nearestPoi.name || '')
    const currentPoiId = String(this.data.currentAudioPoi?.id || this.data.currentAudioPoi?.markerId || this.data.currentAudioPoi?.name || '')

    if (this.data.audioPlaying) {
      if (poiId && currentPoiId && poiId === currentPoiId) {
        return
      }

      return
    }

    const now = Date.now()
    const lastAutoPoiId = String(this.autoAudioState?.lastAutoPoiId || '')
    const lastTriggerTime = Number(this.autoAudioState?.lastTriggerTime || 0)

    if (poiId && lastAutoPoiId === poiId && now - lastTriggerTime < AUTO_AUDIO_SAME_POI_COOLDOWN_MS) {
      return
    }

    if (lastAutoPoiId && lastAutoPoiId !== poiId && now - lastTriggerTime < AUTO_AUDIO_CROSS_POI_COOLDOWN_MS) {
      return
    }

    const currentPopupPointId = String(this.data.currentPopupData?.id || this.data.currentPopupData?.markerId || '')
    const keepPopupVisible = !!this.data.showPoiPopup && currentPopupPointId === poiId
    const nextPopupData = keepPopupVisible
      ? this.buildPointPopupData(nearestPoi, {
        arrived: !!this.data.currentPopupData?.arrived,
        audioPlaying: true,
        navigationActive: false
      })
      : null

    this.autoAudioState = {
      lastAutoPoiId: poiId,
      lastTriggerTime: now
    }

    this.startPointAudioPlayback(nearestPoi, {
      keepPopupVisible,
      nextPopupData,
      fallbackPoiName: nearestPoi.name || '景点讲解',
      forcePlay: true,
      accessSource: 'auto',
      openPaywallOnBlocked: false
    })
  },

  startNavigationTracking(options = {}) {
    if (!this.data.navigationActive) {
      return
    }

    const {
      immediate = true
    } = options

    this.stopNavigationTracking()

    if (immediate) {
      this.refreshNavigationTracking({
        allowAutoRecalculate: true
      })
    }

    this.navigationTrackingTimer = setInterval(() => {
      this.refreshNavigationTracking({
        allowAutoRecalculate: true
      })
    }, NAVIGATION_TRACK_INTERVAL_MS)
  },

  refreshNavigationTracking(options = {}) {
    if (!this.data.navigationActive) {
      return
    }

    this.fetchCurrentLocation()
      .then((userLocation) => {
        this.handleNavigationLocationUpdate(userLocation, options)
      })
      .catch(() => {
        this.handleNavigationLocationFailure()
      })
  },

  handleNavigationLocationFailure() {
    if (!this.data.navigationActive) {
      return
    }

    this.updateNavigationInfoState(null, {
      recalculating: this.data.navigationRecalculating
    })
  },

  handleNavigationLocationUpdate(userLocation, options = {}) {
    if (!this.data.navigationActive || !userLocation) {
      return
    }

    const {
      allowAutoRecalculate = true
    } = options
    const targetPoint = this.getNavigationTargetPoint()
    const route = this.selectedIntelligentRoute
    if (!targetPoint || !route) {
      return
    }

    const progress = this.getNavigationRouteProgress(userLocation, route)
    const isInScenicArea = this.isLocationInScenicArea(userLocation)
    const hasReachedDestination = !!(progress && progress.distanceToDestinationMeters <= NAVIGATION_DESTINATION_REACHED_MAX_METERS)

    this.navigationDestinationReached = this.navigationDestinationReached || hasReachedDestination

    this.updateNavigationInfoState(userLocation, {
      recalculating: this.data.navigationRecalculating
    })
    this.maybeTriggerNavigationGuideAudio(progress, userLocation)

    if (!progress) {
      return
    }

    if (progress.distanceToDestinationMeters <= NAVIGATION_ARRIVAL_MAX_METERS && !this.navigationArrivalNotified) {
      this.navigationArrivalNotified = true
      wx.showToast({
        title: `即将到达${targetPoint.name}`,
        icon: 'none',
        duration: 1600
      })
    }

    if (hasReachedDestination && !this.navigationDestinationPopupShown) {
      this.handleNavigationArrival(targetPoint, userLocation, progress)
    }

    const shouldAutoRecalculate = allowAutoRecalculate
      && isInScenicArea
      && !this.navigationDestinationReached
      && progress.minDistanceToRoute > NAVIGATION_OFF_ROUTE_MAX_METERS
      && !this.data.navigationRecalculating
      && Date.now() - (this.navigationLastRecalculateAt || 0) > NAVIGATION_RECALCULATE_COOLDOWN_MS

    if (shouldAutoRecalculate) {
      this.navigationLastRecalculateAt = Date.now()
      this.setData({
        navigationRecalculating: true
      }, () => {
        this.updateNavigationInfoState(userLocation, {
          recalculating: true
        })
        this.planNavigationToPoint(targetPoint, {
          startPoint: userLocation,
          source: 'current',
          customToastTitle: '已按当前位置重新规划',
          seedLocation: userLocation
        })
      })
    }
  },

  onMapTap() {
    this.setData({
      showAudioListDrawer: false
    })
  },

  onMarkerTap(event) {
    const markerId = event?.detail?.markerId
    this.focusPointById(markerId)
  },

  onPOITap() {},

  applyPoiFilter(filterType, options = {}) {
    const safeFilterType = normalizePoiFilter(filterType) || 'all'
    const filteredPoints = getFilteredDisplayPoints(safeFilterType)
    const hasSelectedPoint = filteredPoints.some((point) => String(point.id) === String(this.data.selectedPointId))
    const nextSelectedPointId = hasSelectedPoint ? this.data.selectedPointId : null
    const nextAudioPoi = hasSelectedPoint
      ? buildAudioPoi(getDisplayPointById(nextSelectedPointId))
      : getDefaultAudioPoi(safeFilterType)
    const {
      closePopup = true,
      closeAudioListDrawer = true
    } = options

    this.setData({
      currentPoiFilter: safeFilterType,
      selectedPointId: nextSelectedPointId,
      currentAudioPoi: nextAudioPoi,
      allMarkers: this.buildVisibleMarkers(safeFilterType, nextSelectedPointId, this.selectedIntelligentRoute),
      showPoiPopup: closePopup ? false : this.data.showPoiPopup,
      currentPopupData: closePopup ? null : this.data.currentPopupData,
      showAudioListDrawer: closeAudioListDrawer ? false : this.data.showAudioListDrawer
    })

    return safeFilterType
  },

  onPoiFilterChange(event) {
    const filterType = event?.detail?.filterType || 'all'
    this.applyPoiFilter(filterType)
  },

  focusPointById(pointId, options = {}) {
    const {
      showPopup = true
    } = options
    const point = getDisplayPointById(pointId)
    if (!point) {
      return
    }

    this.setData({
      selectedPointId: point.id,
      currentAudioPoi: buildAudioPoi(point),
      allMarkers: this.buildVisibleMarkers(this.data.currentPoiFilter, point.id, this.selectedIntelligentRoute),
      longitude: point.longitude,
      latitude: point.latitude,
      scale: DEFAULT_ENTRY_SCALE,
      showAudioListDrawer: false,
      showPoiPopup: showPopup,
      currentPopupData: showPopup ? this.buildPointPopupData(point) : null
    })
  },

  onToggleAudioListDrawer() {
    const nextVisible = !this.data.showAudioListDrawer
    this.setData({
      showAudioListDrawer: nextVisible,
      showPoiPopup: false,
      currentPopupData: null
    })
  },

  onCloseAudioListDrawer() {
    this.setData({
      showAudioListDrawer: false
    })
  },

  onSelectAudioFromList(event) {
    const pointId = event?.detail?.poi?.id || event?.detail?.id
    this.focusPointById(pointId)
  },

  noop() {},

  onClosePoiPopup() {
    this.setData({
      showPoiPopup: false,
      currentPopupData: null
    })
  },

  onPoiPopupButtonAction(event) {
    const actionType = event?.detail?.action || ''
    const popupData = event?.detail?.popupData || this.data.currentPopupData

    this.handlePoiPopupAction(actionType, popupData)
  },

  handlePoiPopupAction(actionType, popupData = this.data.currentPopupData) {
    if (!popupData || !actionType || actionType === 'noop') {
      return
    }

    if (actionType === 'navigate') {
      this.onNavigatePoi()
      return
    }

    if (actionType === 'completeNavigation') {
      this.completeNavigationAtDestination()
      return
    }

    if (actionType === 'checkin') {
      this.onCheckinPoi(popupData)
      return
    }

    this.handlePopupAudioAction(popupData)
  },

  onPrimaryPoiAction() {
    const popupData = this.data.currentPopupData
    const actionType = popupData?.primaryActionType || ''

    this.handlePoiPopupAction(actionType, popupData)
  },

  handlePopupAudioAction(popupData = this.data.currentPopupData) {
    if (!popupData) {
      return
    }

    const point = getDisplayPointById(popupData.id || popupData.markerId)
    if (!point) {
      return
    }

    const currentAudioPoiId = String(this.data.currentAudioPoi?.id || this.data.currentAudioPoi?.markerId || '')
    const targetPointId = String(point.id || point.markerId || '')
    const isSamePoi = !!currentAudioPoiId && currentAudioPoiId === targetPointId
    const nextAudioPlaying = isSamePoi ? !this.data.audioPlaying : true
    const keepPopupVisible = !!popupData.arrived || !!popupData.showAudioAction
    const nextPopupData = keepPopupVisible
      ? this.buildPointPopupData(point, {
        arrived: !!popupData.arrived,
        audioPlaying: nextAudioPlaying,
        navigationActive: !!this.data.navigationActive
      })
      : null

    this.startPointAudioPlayback(point, {
      keepPopupVisible,
      nextPopupData,
      fallbackPoiName: popupData.poiName || popupData.title || '景点讲解',
      useTogglePlay: true
    })
  },

  startPointAudioPlayback(point, options = {}) {
    if (!point) {
      return false
    }

    const {
      keepPopupVisible = false,
      nextPopupData = null,
      fallbackPoiName = point.name || '景点讲解',
      useTogglePlay = false,
      forcePlay = false,
      accessSource = 'manual',
      openPaywallOnBlocked = accessSource !== 'auto'
    } = options
    const nextAudioPoi = buildAudioPoi(point)
    const currentAudioPoiId = String(this.data.currentAudioPoi?.id || this.data.currentAudioPoi?.markerId || '')
    const nextAudioPoiId = String(nextAudioPoi?.id || nextAudioPoi?.markerId || '')
    const isSamePoi = currentAudioPoiId && currentAudioPoiId === nextAudioPoiId

    if (isSamePoi) {
      if (!this.data.audioPlaying && !this.requestAudioAccessForPoint(point, {
        source: accessSource,
        openPaywallOnBlocked
      })) {
        return false
      }

      this.setData({
        showAudioPlayer: true,
        showPoiPopup: keepPopupVisible,
        currentPopupData: nextPopupData
      }, () => {
        const audioPlayer = this.selectComponent('#audioPlayerGuide')
        if (!audioPlayer) {
          navigateToPage(`/pages/scenic-audio-list/scenic-audio-list?poiName=${encodeURIComponent(fallbackPoiName)}`)
          return
        }

        if (forcePlay && typeof audioPlayer.playAudio === 'function') {
          audioPlayer.playAudio()
          return
        }

        if (useTogglePlay && typeof audioPlayer.togglePlay === 'function') {
          audioPlayer.togglePlay()
          return
        }

        if (typeof audioPlayer.playAudio === 'function') {
          audioPlayer.playAudio()
        }
      })
      return true
    }

    if (!this.requestAudioAccessForPoint(point, {
      source: accessSource,
      openPaywallOnBlocked
    })) {
      return false
    }

    this.setData({
      showAudioPlayer: true,
      audioPlaying: false,
      currentAudioPoi: nextAudioPoi,
      showPoiPopup: keepPopupVisible,
      currentPopupData: nextPopupData
    }, () => {
      const audioPlayer = this.selectComponent('#audioPlayerGuide')
      if (!audioPlayer) {
        navigateToPage(`/pages/scenic-audio-list/scenic-audio-list?poiName=${encodeURIComponent(fallbackPoiName)}`)
        return
      }

      if (forcePlay && typeof audioPlayer.playAudio === 'function') {
        audioPlayer.playAudio()
        return
      }

      if (useTogglePlay && typeof audioPlayer.togglePlay === 'function') {
        audioPlayer.togglePlay()
        return
      }

      if (typeof audioPlayer.playAudio === 'function') {
        audioPlayer.playAudio()
      }
    })

    return true
  },

  onSecondaryPoiAction() {
    const popupData = this.data.currentPopupData
    const actionType = popupData?.secondaryActionType || ''

    this.handlePoiPopupAction(actionType, popupData)
  },

  onCheckinPoi(popupData = this.data.currentPopupData) {
    if (!popupData) {
      return
    }

    const point = getDisplayPointById(popupData.id || popupData.markerId)
    const secretMeta = point ? this.resolveSecretMetaForPoint(point) : null

    if (!point || !secretMeta) {
      wx.showToast({
        title: '该点位暂未接入暗号收集',
        icon: 'none',
        duration: 1600
      })
      return
    }

    navigateToPage(buildCheckInPageUrl(point, secretMeta))
  },

  onNavigatePoi() {
    const popupData = this.data.currentPopupData
    if (!popupData) {
      return
    }

    const point = getDisplayPointById(popupData.id || popupData.markerId)
    if (!point) {
      wx.showToast({
        title: '未找到点位数据',
        icon: 'none',
        duration: 1600
      })
      return
    }

    if (!this.requireMapVipAccess(MAP_POI_PRIMARY_ACTION_FEATURE_KEY, {
      action: 'navigate',
      poiId: point.id || point.markerId || '',
      poiName: point.name || popupData.poiName || popupData.title || '',
      successRedirect: buildPoiNavigationPageUrl(point)
    })) {
      return
    }

    this.planNavigationToPoint(point)
  },

  resolveNavigationStartPoint() {
    return new Promise((resolve) => {
      wx.getLocation({
        type: 'gcj02',
        success: ({ latitude, longitude }) => {
          const userLocation = {
            id: 'current-location',
            name: '当前位置',
            latitude,
            longitude
          }

          if (this.isLocationInScenicArea(userLocation)) {
            resolve({
              startPoint: userLocation,
              source: 'current'
            })
            return
          }

          resolve({
            startPoint: DEFAULT_ENTRY_POINT || DEFAULT_ENTRY_CENTER,
            source: 'entry'
          })
        },
        fail: () => {
          resolve({
            startPoint: DEFAULT_ENTRY_POINT || DEFAULT_ENTRY_CENTER,
            source: 'entry'
          })
        }
      })
    })
  },

  isLocationInScenicArea(location) {
    if (!location) {
      return false
    }

    return getMinDistanceBetweenPoints(ALL_ROUTE_POLYLINE_POINTS, [location]) <= NAVIGATION_IN_SCENIC_MAX_METERS
  },

  applyLocationPermissionState(hasLocationPermission) {
    const nextShowLocation = !!hasLocationPermission

    if (nextShowLocation === this.data.showLocation) {
      if (nextShowLocation && this.data.navigationActive && !this.navigationTrackingTimer) {
        this.startNavigationTracking({
          immediate: true
        })
      }

      this.ensureAutoAudioTrackingState({
        immediate: nextShowLocation && !this.data.navigationActive
      })
      return
    }

    this.setData({
      showLocation: nextShowLocation
    }, () => {
      if (this.data.navigationActive) {
        if (nextShowLocation) {
          this.startNavigationTracking({
            immediate: true
          })
        } else {
          this.stopNavigationTracking()
          this.updateNavigationInfoState(null, {
            recalculating: this.data.navigationRecalculating
          })
        }
      }

      this.ensureAutoAudioTrackingState({
        immediate: nextShowLocation && !this.data.navigationActive
      })
    })
  },

  promptLocationPermission() {
    if (this.locationPermissionPromptShown || this.locationPermissionPrompting) {
      return
    }

    this.locationPermissionPromptShown = true
    this.locationPermissionPrompting = true

    wx.showModal({
      title: '位置权限',
      content: '地图导览需要获取您的位置信息，以在地图上显示当前位置并提供导航服务',
      confirmText: '授权',
      cancelText: '暂不开启',
      success: (modalRes) => {
        if (!modalRes.confirm) {
          return
        }

        wx.authorize({
          scope: 'scope.userLocation',
          success: () => {
            this.applyLocationPermissionState(true)
            wx.showToast({
              title: '位置权限已开启',
              icon: 'success',
              duration: 1600
            })
          },
          fail: () => {
            wx.showModal({
              title: '需要位置权限',
              content: '为了更准确地展示您的当前位置并提供导航服务，请在设置中开启位置权限',
              confirmText: '去设置',
              cancelText: '暂不开启',
              success: (settingRes) => {
                if (!settingRes.confirm) {
                  return
                }

                wx.openSetting({
                  success: ({ authSetting = {} }) => {
                    const hasLocationPermission = !!authSetting['scope.userLocation']
                    this.applyLocationPermissionState(hasLocationPermission)

                    if (hasLocationPermission) {
                      wx.showToast({
                        title: '位置权限已开启',
                        icon: 'success',
                        duration: 1600
                      })
                    }
                  }
                })
              }
            })
          }
        })
      },
      complete: () => {
        this.locationPermissionPrompting = false
      }
    })
  },

  checkLocationPermission(options = {}) {
    const {
      promptOnDenied = true
    } = options

    wx.getSetting({
      success: ({ authSetting = {} }) => {
        const hasLocationPermission = !!authSetting['scope.userLocation']
        this.applyLocationPermissionState(hasLocationPermission)

        if (!hasLocationPermission && promptOnDenied) {
          this.promptLocationPermission()
        }
      }
    })
  },

  checkPendingNavigationRequest() {
    const app = getApp()
    let pendingRequest = app?.globalData?.pendingNavigation || null

    if (!pendingRequest) {
      pendingRequest = wx.getStorageSync('pending_navigation')
    }

    if (!pendingRequest) {
      return
    }

    if (app?.globalData?.pendingNavigation) {
      delete app.globalData.pendingNavigation
    }
    wx.removeStorageSync('pending_navigation')

    this.handleEntryRequest(pendingRequest)
  },

  handleEntryRequest(rawRequest) {
    if (!rawRequest) {
      return
    }

    const request = normalizeEntryRequest(rawRequest)
    if (!request) {
      return
    }
    const requestFilterType = normalizePoiFilter(request.filter || request.poiFilter || request.filterType)
    const shouldAutoNavigate = normalizeBooleanValue(request.autoNavigate)
      || normalizeBooleanValue(request.startNavigation)
      || request.action === 'navigate'
    const shouldAutoPlayAudio = request.action === 'playaudio'
    const shouldShowPopup = request.showPopup === undefined
      ? true
      : normalizeBooleanValue(request.showPopup, true)

    const route = this.resolveRouteFromEntryRequest(request)
    if (route) {
      this.applyPreviewRoute(route, {
        toastTitle: request.toastTitle || `已加载${route.name}`
      })
      return
    }

    const point = resolveDisplayPointFromValue(
      request.pointId
      || request.poiId
      || request.poi
      || request.poiName
      || request.pointName
      || request.destination
    )

    if (!point && requestFilterType) {
      this.applyPoiFilter(requestFilterType)
      return
    }

    if (!point && request.coordinate) {
      const nearestPoint = findNearestDisplayPointByCoordinate(request.coordinate)

      if (nearestPoint) {
        if (shouldAutoNavigate) {
          this.planNavigationToPoint(nearestPoint, {
            suppressToast: false,
            seedLocation: request.coordinate
          })
          return
        }

        this.focusPointById(nearestPoint.id, {
          showPopup: shouldShowPopup
        })
        return
      }

      this.setData({
        longitude: request.coordinate.longitude,
        latitude: request.coordinate.latitude,
        scale: DEFAULT_ENTRY_SCALE,
        showPoiPopup: false,
        currentPopupData: null
      })
      return
    }

    if (!point) {
      return
    }

    if (shouldAutoPlayAudio) {
      setTimeout(() => {
        this.focusPointById(point.id, {
          showPopup: false
        })
        this.startPointAudioPlayback(point, {
          keepPopupVisible: false,
          nextPopupData: null,
          fallbackPoiName: request.poiName || request.pointName || request.destination || point.name || '景点讲解',
          forcePlay: true
        })
      }, ENTRY_REQUEST_RETRY_DELAY)
      return
    }

    if (shouldAutoNavigate) {
      this.planNavigationToPoint(point)
      return
    }

    setTimeout(() => {
      this.focusPointById(point.id, {
        showPopup: shouldShowPopup
      })
    }, ENTRY_REQUEST_RETRY_DELAY)
  },

  resolveRouteFromEntryRequest(request) {
    if (!request || typeof request !== 'object') {
      return null
    }

    const directRouteId = request.routeId || request.id || request.route_code
    const directRoute = getIntelligentRouteById(directRouteId)
    if (directRoute) {
      return directRoute
    }

    return buildPoiSequenceRoute(request)
  },

  applyPreviewRoute(route, options = {}) {
    if (!route) {
      return
    }

    this.stopNavigationTracking()
    this.navigationArrivalNotified = false
    this.navigationLastRecalculateAt = 0
    this.navigationDestinationReached = false
    this.navigationDestinationPopupShown = false
    this.navigationGuidePoints = []
    this.navigationAutoPlayedPointIds = new Set()
    const routeAudioPoiList = buildRouteAudioPoiList(route)
    const nextAudioPoi = routeAudioPoiList[0]
      || buildAudioPoi(route.points?.[0])
      || getDefaultAudioPoi('all')

    this.selectedIntelligentRoute = route
    this.preNavigationSelectedRoute = null

    this.setData({
      showIntelligentPlanner: false,
      currentPoiFilter: 'all',
      selectedPointId: null,
      selectedIntelligentRouteId: route.id,
      currentAudioPoi: nextAudioPoi,
      audioPoiList: routeAudioPoiList.length ? routeAudioPoiList : ALL_AUDIO_POI_POINTS,
      allMarkers: this.buildVisibleMarkers('all', null, route, {
        navigationMode: false
      }),
      polylineData: buildMapPolylines(route),
      longitude: route.focusCenter?.longitude || DEFAULT_SCENIC_CENTER.longitude,
      latitude: route.focusCenter?.latitude || DEFAULT_SCENIC_CENTER.latitude,
      scale: route.focusScale || DEFAULT_OVERVIEW_SCALE,
      intelligentRoutePlanningText: route.name,
      showAudioListDrawer: false,
      showPoiPopup: false,
      currentPopupData: null,
      navigationActive: false,
      navigationAudioMode: 'full',
      navigationInfo: null,
      navigationDestination: null,
      navigationSource: '',
      navigationRecalculating: false,
      navigationAutoAudioHint: '',
      userLocation: null,
      preNavigationState: null
    }, () => {
      this.ensureAutoAudioTrackingState({
        immediate: true
      })
      this.focusRouteInViewport(route, {
        padding: [140, 56, 320, 56]
      })
    })

    if (options.toastTitle) {
      wx.showToast({
        title: options.toastTitle,
        icon: 'none',
        duration: 1800
      })
    }
  },

  capturePreNavigationState() {
    if (this.data.navigationActive && this.data.preNavigationState) {
      return this.data.preNavigationState
    }

    const preNavigationState = {
      longitude: this.data.longitude,
      latitude: this.data.latitude,
      scale: this.data.scale,
      showLocation: this.data.showLocation,
      showAudioPlayer: this.data.showAudioPlayer,
      currentPoiFilter: this.data.currentPoiFilter,
      selectedPointId: this.data.selectedPointId,
      selectedIntelligentRouteId: this.data.selectedIntelligentRouteId,
      currentAudioPoi: this.data.currentAudioPoi,
      audioPoiList: this.data.audioPoiList,
      allMarkers: this.data.allMarkers,
      polylineData: this.data.polylineData,
      intelligentRoutePlanningText: this.data.intelligentRoutePlanningText,
      userLocation: this.data.userLocation
    }

    this.preNavigationSelectedRoute = this.selectedIntelligentRoute
    this.setData({
      preNavigationState
    })

    return preNavigationState
  },

  activateNavigationRoute(point, route, source, options = {}) {
    const {
      suppressToast = false,
      customToastTitle = '',
      seedLocation = null
    } = options

    this.capturePreNavigationState()
    this.selectedIntelligentRoute = route
    this.navigationArrivalNotified = false
    this.navigationDestinationReached = false
    this.navigationDestinationPopupShown = false
    this.navigationGuidePoints = buildNavigationGuidePoints(route, point)
    this.navigationAutoPlayedPointIds = new Set()
    if (!this.data.navigationActive || String(this.data.navigationDestination?.id) !== String(point.id)) {
      this.navigationLastRecalculateAt = 0
    }

    const progress = seedLocation ? estimateNavigationProgress(route, seedLocation) : null
    const navigationInfo = buildNavigationCardState(point, route, source, {
      locationAvailable: !!progress,
      recalculating: false,
      remainingDistanceMeters: progress?.remainingDistanceMeters ?? route.distanceMeters,
      distanceToDestinationMeters: progress?.distanceToDestinationMeters,
      minDistanceToRoute: progress?.minDistanceToRoute,
      updatedAt: progress ? Date.now() : 0
    })
    navigationInfo.stepItems = buildNavigationStepItems(point, source, {
      progress,
      guidePoints: this.navigationGuidePoints,
      arrived: false
    })

    this.setData({
      currentPoiFilter: 'all',
      selectedPointId: point.id,
      selectedIntelligentRouteId: '',
      currentAudioPoi: buildAudioPoi(point),
      audioPoiList: this.getNavigationAudioPoiList(point),
      showAudioPlayer: true,
      allMarkers: this.buildVisibleMarkers('all', point.id, route, {
        navigationMode: true
      }),
      polylineData: buildMapPolylines(route),
      longitude: route.focusCenter?.longitude || point.longitude,
      latitude: route.focusCenter?.latitude || point.latitude,
      scale: route.focusScale || DEFAULT_OVERVIEW_SCALE,
      intelligentRoutePlanningText: `前往${point.name}`,
      showAudioListDrawer: false,
      showPoiPopup: false,
      currentPopupData: null,
      showIntelligentPlanner: false,
      navigationActive: true,
      navigationAudioMode: 'full',
      navigationInfo,
      navigationSource: source,
      navigationRecalculating: false,
      navigationAutoAudioHint: '接近沿途景点时会自动播放讲解',
      navigationDestination: {
        id: point.id,
        markerId: point.markerId,
        name: point.name,
        latitude: point.latitude,
        longitude: point.longitude
      },
      showLocation: true,
      userLocation: seedLocation || this.data.userLocation || null
    }, () => {
      this.ensureAutoAudioTrackingState()
      this.focusRouteInViewport(route, {
        padding: [150, 56, 360, 56]
      })
      this.startNavigationTracking({
        immediate: !seedLocation
      })
    })

    const toastTitle = source === 'current'
      ? `已规划前往${point.name}`
      : `已从检票口规划到${point.name}`

    if (!suppressToast || customToastTitle) {
      wx.showToast({
        title: customToastTitle || toastTitle,
        icon: 'none',
        duration: 1800
      })
    }
  },

  planNavigationToPoint(point, options = {}) {
    if (!point) {
      return
    }

    const {
      startPoint = null,
      source: explicitSource = '',
      suppressToast = false,
      customToastTitle = '',
      seedLocation = null
    } = options

    if (startPoint) {
      const route = buildPoiNavigationRoute(point, startPoint)
      if (!route) {
        wx.showToast({
          title: '暂未找到可规划路线',
          icon: 'none',
          duration: 1800
        })
        this.setData({
          navigationRecalculating: false
        })
        return
      }

      this.activateNavigationRoute(point, route, explicitSource || 'current', {
        suppressToast,
        customToastTitle,
        seedLocation: seedLocation || startPoint
      })
      return
    }

    this.resolveNavigationStartPoint().then(({ startPoint, source }) => {
      const route = buildPoiNavigationRoute(point, startPoint)
      if (!route) {
        wx.showToast({
          title: '暂未找到可规划路线',
          icon: 'none',
          duration: 1800
        })
        this.setData({
          navigationRecalculating: false
        })
        return
      }

      this.activateNavigationRoute(point, route, explicitSource || source, {
        suppressToast,
        customToastTitle,
        seedLocation: seedLocation || (source === 'current' ? startPoint : null)
      })
    })
  },

  onRecalculateRoute() {
    if (this.data.navigationRecalculating) {
      return
    }

    const point = resolveDisplayPointFromValue(this.data.navigationDestination)
    if (!point) {
      return
    }

    this.setData({
      navigationRecalculating: true
    }, () => {
      this.updateNavigationInfoState(this.data.userLocation, {
        recalculating: true
      })
      this.planNavigationToPoint(point, {
        customToastTitle: '路线已重新规划'
      })
    })
  },

  onNavigationSecondaryAction() {
    if (this.data.navigationInfo?.arrived) {
      this.restoreArrivedDestinationPanel()
      return
    }

    this.onRecalculateRoute()
  },

  onNavigationPrimaryAction() {
    if (this.data.navigationInfo?.arrived) {
      this.completeNavigationAtDestination()
      return
    }

    this.endNavigation()
  },

  endNavigation() {
    const preNavigationState = this.data.preNavigationState

    this.stopNavigationTracking()
    this.selectedIntelligentRoute = this.preNavigationSelectedRoute || null
    this.preNavigationSelectedRoute = null

    if (preNavigationState) {
      this.setData({
        ...preNavigationState,
        navigationActive: false,
        navigationAudioMode: 'full',
        navigationInfo: null,
        navigationDestination: null,
        navigationSource: '',
        navigationRecalculating: false,
        navigationAutoAudioHint: '',
        preNavigationState: null,
        showPoiPopup: false,
        currentPopupData: null,
        showIntelligentPlanner: false,
        userLocation: preNavigationState.userLocation || null
      }, () => {
        this.ensureAutoAudioTrackingState({
          immediate: true
        })
      })
    } else {
      this.setData({
        currentPoiFilter: 'all',
        selectedPointId: null,
        selectedIntelligentRouteId: '',
        currentAudioPoi: buildAudioPoi(DEFAULT_ENTRY_POINT) || ALL_AUDIO_POI_POINTS[0] || null,
        audioPoiList: ALL_AUDIO_POI_POINTS,
        showAudioPlayer: true,
        allMarkers: this.buildVisibleMarkers('all', null, null, {
          navigationMode: false
        }),
        polylineData: buildMapPolylines(),
        longitude: DEFAULT_ENTRY_CENTER.longitude,
        latitude: DEFAULT_ENTRY_CENTER.latitude,
        scale: DEFAULT_ENTRY_SCALE,
        intelligentRoutePlanningText: '智能线路规划',
        showAudioListDrawer: false,
        showPoiPopup: false,
        currentPopupData: null,
        showIntelligentPlanner: false,
        navigationActive: false,
        navigationAudioMode: 'full',
        navigationInfo: null,
        navigationDestination: null,
        navigationSource: '',
        navigationRecalculating: false,
        navigationAutoAudioHint: '',
        userLocation: null,
        preNavigationState: null
      }, () => {
        this.ensureAutoAudioTrackingState({
          immediate: true
        })
      })
    }

    this.navigationArrivalNotified = false
    this.navigationLastRecalculateAt = 0
    this.navigationDestinationReached = false
    this.navigationDestinationPopupShown = false
    this.navigationGuidePoints = []
    this.navigationAutoPlayedPointIds = new Set()

    wx.showToast({
      title: '已退出导航',
      icon: 'none',
      duration: 1600
    })
  },

  onAudioPlay() {
    this.setData({
      audioPlaying: true
    }, () => {
      this.requestKeepScreenOn('audio')
      if (this.data.navigationActive) {
        const currentName = this.data.currentAudioPoi?.name || this.data.currentAudioPoi?.displayName
        this.setNavigationAudioHint(currentName ? `正在播放${currentName}讲解` : '讲解播放中')
      }
      this.syncCurrentPopupDataWithAudioAccess({
        audioPlaying: true
      })
    })
  },

  onAudioPlayStateChange(event) {
    const detail = event?.detail || {}

    this.setData({
      audioPlaying: !!detail.isPlaying,
      audioMuted: typeof detail.isMuted === 'boolean' ? detail.isMuted : this.data.audioMuted,
      audioProgress: typeof detail.progress === 'number' ? detail.progress : this.data.audioProgress,
      audioCurrentTime: typeof detail.currentTime === 'number' ? detail.currentTime : this.data.audioCurrentTime,
      audioTotalTime: typeof detail.totalTime === 'number' ? detail.totalTime : this.data.audioTotalTime
    }, () => {
      if (detail.isPlaying) {
        this.requestKeepScreenOn('audio')
      } else {
        this.releaseKeepScreenOn('audio')
      }

      if (this.data.navigationActive) {
        const currentName = this.data.currentAudioPoi?.name || this.data.currentAudioPoi?.displayName
        this.setNavigationAudioHint(detail.isPlaying
          ? (currentName ? `正在播放${currentName}讲解` : '讲解播放中')
          : (this.navigationDestinationReached ? '讲解已暂停，可继续播放或完成导航' : '讲解已暂停，可稍后继续播放'))
      }
      this.syncCurrentPopupDataWithAudioAccess({
        audioPlaying: !!detail.isPlaying
      })
    })
  },

  onAudioPause() {
    this.setData({
      audioPlaying: false
    }, () => {
      this.releaseKeepScreenOn('audio')
      if (this.data.navigationActive) {
        this.setNavigationAudioHint(this.navigationDestinationReached ? '讲解已暂停，可继续播放或完成导航' : '讲解已暂停，可稍后继续播放')
      }
      this.syncCurrentPopupDataWithAudioAccess({
        audioPlaying: false
      })
    })
  },

  onAudioStop() {
    this.setData({
      audioPlaying: false,
      audioProgress: 0,
      audioCurrentTime: 0
    }, () => {
      this.releaseKeepScreenOn('audio')
      if (this.data.navigationActive) {
        this.setNavigationAudioHint(this.navigationDestinationReached ? '讲解已停止，可点击完成导航' : '讲解已停止，可继续跟随路线')
      }
      this.syncCurrentPopupDataWithAudioAccess({
        audioPlaying: false
      })
    })
  },

  onAudioEnded() {
    this.setData({
      audioPlaying: false,
      audioProgress: 100,
      audioCurrentTime: this.data.audioTotalTime
    }, () => {
      this.releaseKeepScreenOn('audio')
      if (this.data.navigationActive) {
        this.setNavigationAudioHint(this.navigationDestinationReached ? '讲解已结束，可点击完成导航' : '当前讲解已结束，可继续沿路线前进')
      }
      this.syncCurrentPopupDataWithAudioAccess({
        audioPlaying: false
      })
    })
  },

  onAudioTimeUpdate(event) {
    this.setData({
      audioProgress: event?.detail?.progress || 0,
      audioCurrentTime: event?.detail?.currentTime || 0,
      audioTotalTime: event?.detail?.totalTime || this.data.audioTotalTime
    })
  },

  onCloseAudioPlayer() {
    if (this.data.navigationActive && this.data.currentAudioPoi) {
      this.setData({
        showAudioPlayer: true,
        navigationAudioMode: 'mini'
      })
      return
    }

    this.setData({
      showAudioPlayer: false
    })
  },

  onMiniAudioPlayPause() {
    const audioPlayer = this.selectComponent('#audioPlayerGuide')
    if (!audioPlayer) {
      return
    }

    if (this.data.audioPlaying) {
      audioPlayer.pauseAudio()
      return
    }

    if (!this.requestAudioAccessForPoint(this.data.currentAudioPoi)) {
      return
    }

    audioPlayer.playAudio()
  },

  onAudioPlayerRequestPlay(event) {
    const targetPoi = event?.detail?.poi || this.data.currentAudioPoi
    if (!this.requestAudioAccessForPoint(targetPoi)) {
      return
    }

    const audioPlayer = this.selectComponent('#audioPlayerGuide')
    if (!audioPlayer || typeof audioPlayer.playAudio !== 'function') {
      return
    }

    audioPlayer.playAudio()
  },

  onMiniAudioToggleVolume() {
    const nextMuted = !this.data.audioMuted
    const audioPlayer = this.selectComponent('#audioPlayerGuide')

    this.setData({
      audioMuted: nextMuted
    }, () => {
      if (audioPlayer && typeof audioPlayer.setMuted === 'function') {
        audioPlayer.setMuted(nextMuted)
      }

      if (this.data.navigationActive) {
        this.setNavigationAudioHint(nextMuted ? '讲解已静音，可随时恢复声音' : '已恢复声音播放')
      }
    })
  },

  onCloseMiniAudioPlayer() {
    const audioPlayer = this.selectComponent('#audioPlayerGuide')
    if (audioPlayer && typeof audioPlayer.setMuted === 'function') {
      audioPlayer.setMuted(false)
    }
    if (audioPlayer && typeof audioPlayer.stopAudio === 'function') {
      audioPlayer.stopAudio()
    }

    this.setData({
      showAudioPlayer: false,
      navigationAudioMode: 'mini',
      audioMuted: false
    }, () => {
      this.releaseKeepScreenOn('audio')
      if (this.data.navigationActive) {
        this.setNavigationAudioHint('讲解已关闭，可在景点卡或讲解列表重新打开')
      }
    })
  },

  onRestoreFullAudioPlayer() {
    if (!this.data.currentAudioPoi) {
      return
    }

    this.setData({
      showAudioPlayer: true,
      navigationAudioMode: 'full',
      audioMuted: false
    }, () => {
      const audioPlayer = this.selectComponent('#audioPlayerGuide')
      if (audioPlayer && typeof audioPlayer.setMuted === 'function') {
        audioPlayer.setMuted(false)
      }
    })
  },

  onToggleAudioPaidForTesting() {
    const nextPaid = !this.data.audioAccessPaid
    setFeaturePaid(AUDIO_FEATURE_KEY, nextPaid)
    setFeaturePaid(AI_CHAT_ACCESS_FEATURE_KEY, nextPaid)
    this.refreshAudioAccessState()

    if (this.data.navigationActive) {
      this.setNavigationAudioHint(nextPaid ? '已切换为付费状态，全部讲解已解锁' : '已切换为未付费状态，讲解将按VIP逻辑拦截')
    }

    wx.showToast({
      title: nextPaid ? '已设为付费' : '已设为未付费',
      icon: 'none',
      duration: 1400
    })
  },

  onIntelligentRoutePlanning() {
    if (!this.requireMapVipAccess(MAP_ROUTE_PLANNING_FEATURE_KEY, {
      action: 'intelligent_route_planning',
      poiName: '智能路线规划',
      successRedirect: '/pages/map/map?showAIRoute=1'
    })) {
      return
    }

    this.setData({
      showIntelligentPlanner: true,
      showAudioListDrawer: false,
      showPoiPopup: false,
      currentPopupData: null
    })
  },

  onCloseIntelligentPlanner() {
    this.setData({
      showIntelligentPlanner: false
    })
  },

  onIntelligentRouteSelected(event) {
    const routeId = event?.detail?.routeId || event?.detail?.route?.id
    const route = getIntelligentRouteById(routeId)

    if (!route) {
      return
    }

    this.applyPreviewRoute(route, {
      toastTitle: `已规划${route.name}`
    })
  },

  resolveAIChatRoute(eventDetail = {}) {
    const routeId = eventDetail.routeId
      || eventDetail.selectedRouteId
      || eventDetail.route?.id
      || this.data.selectedIntelligentRouteId

    if (routeId) {
      const directRoute = getIntelligentRouteById(routeId)
      if (directRoute) {
        return directRoute
      }

      if (this.selectedIntelligentRoute && this.selectedIntelligentRoute.id === routeId) {
        return this.selectedIntelligentRoute
      }
    }

    return this.selectedIntelligentRoute || null
  },

  hasAIChatAccess() {
    return isFeaturePaid(AI_CHAT_ACCESS_FEATURE_KEY)
  },

  hasVipAccess() {
    return isFeaturePaid(AI_CHAT_ACCESS_FEATURE_KEY)
  },

  buildAIChatSubscribeUrl(targetUrl = '') {
    return `/pages/payment/subscribe/subscribe?feature=${encodeURIComponent(AI_CHAT_PAYMENT_FEATURE_KEY)}&featureName=${encodeURIComponent('AI智能对话')}&productName=${encodeURIComponent('AI聊天权限')}&description=${encodeURIComponent(AI_CHAT_SUBSCRIBE_DESCRIPTION)}${targetUrl ? `&successRedirect=${encodeURIComponent(targetUrl)}` : ''}`
  },

  redirectToAIChatSubscribe(targetUrl = '') {
    const subscribeUrl = this.buildAIChatSubscribeUrl(targetUrl)

    navigateToPage(subscribeUrl)
  },

  buildMapVipPaymentUrl(featureKey, context = {}) {
    const metaByFeatureKey = {
      [MAP_ROUTE_PLANNING_FEATURE_KEY]: {
        featureName: '智能路线规划',
        productName: '智能路线规划权限',
        description: '使用智能路线规划功能需要VIP权限'
      },
      [MAP_POI_PRIMARY_ACTION_FEATURE_KEY]: {
        featureName: '景点导航',
        productName: '地图互动权限',
        description: '继续使用地图互动功能需要VIP权限'
      }
    }

    const meta = metaByFeatureKey[featureKey] || {
      featureName: 'VIP尊享功能',
      productName: '地图互动权限',
      description: '使用此功能需要VIP权限'
    }
    const successRedirect = String(context.successRedirect || '').trim()

    return `/pages/payment/subscribe/subscribe?feature=${encodeURIComponent(featureKey)}&featureName=${encodeURIComponent(meta.featureName)}&productName=${encodeURIComponent(meta.productName)}&description=${encodeURIComponent(meta.description)}${successRedirect ? `&successRedirect=${encodeURIComponent(successRedirect)}` : ''}`
  },

  requireMapVipAccess(featureKey, context = {}) {
    if (this.hasVipAccess()) {
      return true
    }

    navigateToPage(this.buildMapVipPaymentUrl(featureKey, context))
    return false
  },

  onOpenAIChat(event) {
    const detail = event?.detail || {}
    const route = this.resolveAIChatRoute(detail)

    if (route) {
      const app = getApp()
      const routeInfo = buildRouteAIChatInfo(route, detail.message)
      const targetUrl = buildRouteAIChatPageUrl(route, detail.message)

      if (routeInfo && app) {
        app.globalData = app.globalData || {}
        app.globalData.aiChatRouteInfo = routeInfo
      }

      if (!this.hasAIChatAccess()) {
        this.redirectToAIChatSubscribe(targetUrl)
        return
      }

      navigateToPage(targetUrl)
      return
    }

    const targetUrl = buildDefaultAIChatPageUrl(detail.message)

    if (!this.hasAIChatAccess()) {
      this.redirectToAIChatSubscribe(targetUrl)
      return
    }

    navigateToPage(targetUrl)
  },

  onStatusBarBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({
        delta: 1
      })
      return
    }

    wx.reLaunch({
      url: '/pages/index/index',
      fail: () => {
        wx.redirectTo({
          url: '/pages/index/index'
        })
      }
    })
  },

  goToUserPage() {
    navigateToPage('/pages/my-page/my-page')
  }
})
