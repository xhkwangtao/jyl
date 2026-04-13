const {
  JYL_MARKER_POINTS,
  JYL_ROUTE,
  JYL_ROUTE_MARKER_POINTS,
  JYL_ROUTE_POLYLINES
} = require('../../config/jyl-map-data.js')

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

function buildRouteConnectorPolyline(startPoint, endPoint) {
  if (!startPoint || !endPoint) {
    return null
  }

  const gapDistance = haversineMeters(startPoint, endPoint)
  if (gapDistance < ROUTE_SEGMENT_BRIDGE_MIN_METERS || gapDistance > ROUTE_SEGMENT_BRIDGE_MAX_METERS) {
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

function buildMarkerLabel(point, options = {}) {
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
    anchorY: -34,
    bgColor: isActive ? '#245F6D' : (isPlanned ? 'rgba(181, 230, 220, 0.96)' : 'rgba(255, 255, 255, 0.94)'),
    padding: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: isActive ? '#245F6D' : (isPlanned ? 'rgba(36, 95, 109, 0.28)' : 'rgba(33, 33, 33, 0.08)')
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

const ALL_ROUTE_DISPLAY_POINTS = JYL_ROUTE_MARKER_POINTS.map(createDisplayPoint)
const ALL_AUDIO_POI_POINTS = JYL_MARKER_POINTS.map(buildAudioPoi)
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
  return ALL_ROUTE_DISPLAY_POINTS.find((point) => String(point.id) === String(pointId) || String(point.markerId) === String(pointId)) || null
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

function buildMarkers(filterType, selectedPointId, selectedRoute = null) {
  const plannedOrderMap = buildPlannedOrderMap(selectedRoute)

  return getFilteredDisplayPoints(filterType).map((point) => {
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
      label: buildMarkerLabel(point, {
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

Page({
  data: {
    navigationBarTotalHeight: 64,
    longitude: DEFAULT_ENTRY_CENTER.longitude,
    latitude: DEFAULT_ENTRY_CENTER.latitude,
    scale: DEFAULT_ENTRY_SCALE,
    showLocation: false,
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
    navigationActive: false,
    intelligentRoutePlanningText: '智能线路规划',
    plannerRoutes: INTELLIGENT_ROUTE_CARD_OPTIONS,
    showIntelligentPlanner: false,
    selectedIntelligentRouteId: '',
    selectedPointId: null
  },

  onLoad() {
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
    this.setData({
      navigationBarTotalHeight
    })
  },

  onMapReady(event) {
    this.mapCtx = event.detail
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

  onPoiFilterChange(event) {
    const filterType = event?.detail?.filterType || 'all'
    const filteredPoints = getFilteredDisplayPoints(filterType)
    const hasSelectedPoint = filteredPoints.some((point) => String(point.id) === String(this.data.selectedPointId))
    const nextSelectedPointId = hasSelectedPoint ? this.data.selectedPointId : null
    const nextAudioPoi = hasSelectedPoint
      ? buildAudioPoi(getDisplayPointById(nextSelectedPointId))
      : getDefaultAudioPoi(filterType)

    this.setData({
      currentPoiFilter: filterType,
      selectedPointId: nextSelectedPointId,
      currentAudioPoi: nextAudioPoi,
      allMarkers: buildMarkers(filterType, nextSelectedPointId, this.selectedIntelligentRoute)
    })
  },

  focusPointById(pointId) {
    const point = getDisplayPointById(pointId)
    if (!point) {
      return
    }

    this.setData({
      selectedPointId: point.id,
      currentAudioPoi: buildAudioPoi(point),
      allMarkers: buildMarkers(this.data.currentPoiFilter, point.id, this.selectedIntelligentRoute),
      longitude: point.longitude,
      latitude: point.latitude,
      scale: DEFAULT_ENTRY_SCALE,
      showAudioListDrawer: false
    })
  },

  onToggleAudioListDrawer() {
    this.setData({
      showAudioListDrawer: !this.data.showAudioListDrawer
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

  onAudioPlay() {
    this.setData({
      audioPlaying: true
    })
  },

  onAudioPause() {
    this.setData({
      audioPlaying: false
    })
  },

  onAudioStop() {
    this.setData({
      audioPlaying: false,
      audioProgress: 0,
      audioCurrentTime: 0
    })
  },

  onAudioEnded() {
    this.setData({
      audioPlaying: false,
      audioProgress: 100,
      audioCurrentTime: this.data.audioTotalTime
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
    this.setData({
      showAudioPlayer: false
    })
  },

  onIntelligentRoutePlanning() {
    this.setData({
      showIntelligentPlanner: true,
      showAudioListDrawer: false
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

    const routeAudioPoiList = buildRouteAudioPoiList(route)
    const nextAudioPoi = routeAudioPoiList[0]
      || buildAudioPoi(route.points[0])
      || getDefaultAudioPoi('all')

    this.selectedIntelligentRoute = route
    this.setData({
      showIntelligentPlanner: false,
      currentPoiFilter: 'all',
      selectedPointId: null,
      selectedIntelligentRouteId: route.id,
      currentAudioPoi: nextAudioPoi,
      audioPoiList: routeAudioPoiList.length ? routeAudioPoiList : ALL_AUDIO_POI_POINTS,
      allMarkers: buildMarkers('all', null, route),
      polylineData: buildMapPolylines(route),
      longitude: DEFAULT_SCENIC_CENTER.longitude,
      latitude: DEFAULT_SCENIC_CENTER.latitude,
      scale: DEFAULT_OVERVIEW_SCALE,
      intelligentRoutePlanningText: route.name,
      showAudioListDrawer: false
    })

    wx.showToast({
      title: `已规划${route.name}`,
      icon: 'none',
      duration: 1800
    })
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

  goToUserPage() {}
})
