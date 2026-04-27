const rawData = require('./jyl-map-data.generated.js')
const USE_RAW_SOURCE_COORDINATES = false

const ICON_PATHS = {
  start: '/images/poi/icons/entrance.png',
  end: '/images/poi/icons/entrance.png',
  scenic: '/images/poi/icons/scenic-spot.png',
  service: '/images/poi/icons/entrance.png',
  guide: '/images/poi/icons/relic.png',
  junction: '/images/poi/icons/entrance.png'
}

function formatDistanceText(distanceMeters) {
  if (typeof distanceMeters !== 'number' || Number.isNaN(distanceMeters)) {
    return ''
  }

  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`
  }

  return `${Math.round(distanceMeters)} m`
}

function buildIconPath(pointType) {
  return ICON_PATHS[pointType] || ICON_PATHS.scenic
}

function buildPoi(point, index) {
  const location = USE_RAW_SOURCE_COORDINATES
    ? (point.locationRaw || point.locationWgs84 || point.locationGcj02)
    : (point.locationGcj02 || point.locationRaw || point.locationWgs84)
  const [longitude, latitude] = location
  const isLocalGateLeftSign = point.id === 'poi-02' || point.key === 'poi-02'
  const localPointName = isLocalGateLeftSign ? '景区大门左侧牌子（本地）' : point.name

  return {
    id: point.id,
    markerId: index + 1,
    key: point.key,
    sourceName: point.sourceName,
    name: localPointName,
    type: point.type,
    latitude,
    longitude,
    orderText: point.orderText,
    sequenceText: point.sequenceText,
    description: point.description,
    shortHint: point.shortHint,
    stayText: point.stayText,
    sceneLine: point.sceneLine,
    guideTip: point.guideTip,
    themeTag: point.themeTag,
    themeTone: point.themeTone,
    triggerRadiusM: point.triggerRadiusM,
    visible: point.visible,
    cardVisible: point.cardVisible,
    checkinVisible: point.checkinVisible,
    routeIndex: point.routeIndex,
    sort: point.sort,
    iconPath: buildIconPath(point.type)
  }
}

function buildRoutePoints(path) {
  return path.map(([longitude, latitude]) => ({
    longitude,
    latitude
  }))
}

function buildRouteSegments(segmentPaths) {
  return segmentPaths.map((segmentPath) => buildRoutePoints(segmentPath))
}

const JYL_SOURCE_FILE = rawData.sourceFile
const routePath = USE_RAW_SOURCE_COORDINATES
  ? (rawData.route.pathRaw || rawData.route.pathGcj02)
  : (rawData.route.pathGcj02 || rawData.route.pathRaw)
const routeSegmentPaths = USE_RAW_SOURCE_COORDINATES
  ? (rawData.route.pathSegmentsRaw || rawData.route.pathSegmentsGcj02 || [routePath])
  : (rawData.route.pathSegmentsGcj02 || rawData.route.pathSegmentsRaw || [routePath])
const JYL_ROUTE_SEGMENTS = buildRouteSegments(routeSegmentPaths)
const JYL_ROUTE = {
  id: rawData.route.id,
  name: rawData.route.name,
  distanceMeters: rawData.route.distanceMeters,
  distanceText: formatDistanceText(rawData.route.distanceMeters),
  sourcePointCount: rawData.route.sourcePointCount,
  simplifiedPointCount: rawData.route.simplifiedPointCount,
  displaySegmentCount: rawData.route.displaySegmentCount || JYL_ROUTE_SEGMENTS.length,
  coordinateSystem: USE_RAW_SOURCE_COORDINATES
    ? (rawData.sourceCoordinateSystem || 'RAW')
    : rawData.outputCoordinateSystem,
  pathPoints: buildRoutePoints(routePath),
  segmentPaths: JYL_ROUTE_SEGMENTS
}

const JYL_ALL_POI_POINTS = rawData.pois.map(buildPoi)
const JYL_MARKER_POINTS = JYL_ALL_POI_POINTS.filter((point) => point.checkinVisible)
const JYL_ROUTE_MARKER_POINTS = JYL_ALL_POI_POINTS.filter((point) => point.visible)
const JYL_HIDDEN_TRIGGER_POINTS = JYL_ALL_POI_POINTS.filter((point) => !point.visible)
const JYL_POI_SUMMARY = rawData.poiSummary || {
  visibleCount: JYL_ROUTE_MARKER_POINTS.length,
  cardCount: JYL_MARKER_POINTS.length,
  hiddenTriggerCount: JYL_HIDDEN_TRIGGER_POINTS.length,
  totalCount: JYL_ALL_POI_POINTS.length
}

const ROUTE_POLYLINE_COLOR = '#245F6D'

const JYL_ROUTE_POLYLINES = JYL_ROUTE.segmentPaths.map((points, index) => ({
  points,
  color: ROUTE_POLYLINE_COLOR,
  width: index === 0 ? 6 : 4
}))

const JYL_MAP_META = {
  sourceFile: JYL_SOURCE_FILE,
  coordinateSystem: JYL_ROUTE.coordinateSystem,
  coordinateMode: USE_RAW_SOURCE_COORDINATES ? 'raw' : 'gcj02',
  markerCount: JYL_POI_SUMMARY.visibleCount,
  cardCount: JYL_POI_SUMMARY.cardCount,
  routeDistanceText: JYL_ROUTE.distanceText,
  navigationText: '步行导览',
  routePreviewText: `主路线约 ${JYL_ROUTE.distanceText}`,
  note: USE_RAW_SOURCE_COORDINATES
    ? '当前地图直接使用导入源坐标，便于核对是否存在坐标系偏移。'
    : '路线和导览点已统一整理为 GCJ-02，可直接用于微信小程序地图组件。',
  summaryCopy: `主路线已整理完成，公开显示 ${JYL_POI_SUMMARY.cardCount} 个导览点，并保留 ${JYL_POI_SUMMARY.hiddenTriggerCount} 个隐藏触发点。`
}

module.exports = {
  JYL_SOURCE_FILE,
  JYL_ROUTE,
  JYL_MARKER_POINTS,
  JYL_ROUTE_MARKER_POINTS,
  JYL_HIDDEN_TRIGGER_POINTS,
  JYL_ALL_POI_POINTS,
  JYL_POI_SUMMARY,
  JYL_ROUTE_POLYLINES,
  JYL_MAP_META,
  sourceFile: JYL_SOURCE_FILE,
  route: JYL_ROUTE,
  pois: JYL_ALL_POI_POINTS,
  visiblePois: JYL_ROUTE_MARKER_POINTS,
  cardPois: JYL_MARKER_POINTS,
  hiddenTriggerPois: JYL_HIDDEN_TRIGGER_POINTS,
  poiSummary: JYL_POI_SUMMARY,
  routePolylines: JYL_ROUTE_POLYLINES,
  meta: JYL_MAP_META
}
