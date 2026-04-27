const ROUTE_POLYLINE_COLOR = '#245F6D'
const ROUTE_THEME_SEQUENCE = ['green', 'blue', 'green', 'blue']
const DEFAULT_TRIGGER_RADIUS_METERS = 36
const MAX_POI_MATCH_DISTANCE_METERS = 120

const ICON_PATHS = {
  start: '/images/poi/icons/entrance.png',
  end: '/images/poi/icons/entrance.png',
  scenic: '/images/poi/icons/scenic-spot.png',
  service: '/images/poi/icons/entrance.png',
  guide: '/images/poi/icons/relic.png',
  junction: '/images/poi/icons/entrance.png'
}

function normalizeLookupText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '')
}

function toFiniteCoordinateValue(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function clonePoint(point = {}) {
  return {
    ...point
  }
}

function clonePolyline(polyline = {}) {
  return {
    ...polyline,
    points: Array.isArray(polyline.points)
      ? polyline.points
        .map((point) => ({
          longitude: toFiniteCoordinateValue(point?.longitude),
          latitude: toFiniteCoordinateValue(point?.latitude)
        }))
        .filter((point) => point.longitude !== null && point.latitude !== null)
      : []
  }
}

function cloneRouteOption(routeOption = {}) {
  return {
    ...routeOption,
    polylines: Array.isArray(routeOption.polylines)
      ? routeOption.polylines.map(clonePolyline).filter((polyline) => polyline.points.length >= 2)
      : [],
    points: Array.isArray(routeOption.points)
      ? routeOption.points.map((point) => ({ ...point }))
      : []
  }
}

function haversineMeters(a, b) {
  const longitudeA = toFiniteCoordinateValue(a?.longitude)
  const latitudeA = toFiniteCoordinateValue(a?.latitude)
  const longitudeB = toFiniteCoordinateValue(b?.longitude)
  const latitudeB = toFiniteCoordinateValue(b?.latitude)

  if (
    longitudeA === null
    || latitudeA === null
    || longitudeB === null
    || latitudeB === null
  ) {
    return Number.POSITIVE_INFINITY
  }

  const earthRadius = 6378137
  const latitudeDelta = ((latitudeB - latitudeA) * Math.PI) / 180
  const longitudeDelta = ((longitudeB - longitudeA) * Math.PI) / 180
  const latitudeARadians = (latitudeA * Math.PI) / 180
  const latitudeBRadians = (latitudeB * Math.PI) / 180
  const term = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeARadians) * Math.cos(latitudeBRadians) * Math.sin(longitudeDelta / 2) ** 2

  return earthRadius * 2 * Math.atan2(Math.sqrt(term), Math.sqrt(1 - term))
}

function buildPointAliases(point = {}) {
  return Array.from(new Set([
    point?.id,
    point?.key,
    point?.sourceName,
    point?.name,
    point?.title,
    point?.contentId,
    point?.contentSlug
  ].map((item) => normalizeLookupText(item)).filter(Boolean)))
}

function buildRuntimePoiAliases(runtimePoi = {}) {
  return Array.from(new Set([
    runtimePoi?.id,
    runtimePoi?.slug,
    runtimePoi?.name
  ].map((item) => normalizeLookupText(item)).filter(Boolean)))
}

function buildIconPath(pointType) {
  return ICON_PATHS[pointType] || ICON_PATHS.scenic
}

function extractAssetUrls(assets = []) {
  return (Array.isArray(assets) ? assets : [])
    .map((asset) => String(asset?.file_url || '').trim())
    .filter(Boolean)
}

function buildRuntimeRouteOrderMap(runtimeRoute = null) {
  if (!runtimeRoute || !Array.isArray(runtimeRoute.poi_ids)) {
    return {}
  }

  return runtimeRoute.poi_ids.reduce((result, poiId, index) => {
    result[String(poiId)] = index
    return result
  }, {})
}

function buildGeneratedPoint(runtimePoi = {}, markerId, routeOrderIndex = null) {
  const resolvedMarkerId = Number(markerId) > 0 ? Number(markerId) : 1
  const resolvedOrderIndex = Number.isInteger(routeOrderIndex) ? routeOrderIndex : resolvedMarkerId - 1
  const orderText = String(resolvedOrderIndex + 1).padStart(2, '0')
  const name = String(runtimePoi?.name || `点位 ${resolvedMarkerId}`).trim()
  const summary = String(runtimePoi?.summary || '').trim()
  const body = String(runtimePoi?.body || '').trim()
  const audioGuideTitle = String(runtimePoi?.audio_guide?.title || '').trim()

  return {
    id: `runtime-poi-${runtimePoi?.id || resolvedMarkerId}`,
    markerId: resolvedMarkerId,
    key: String(runtimePoi?.slug || `runtime-poi-${runtimePoi?.id || resolvedMarkerId}`).trim(),
    sourceName: name,
    name,
    type: 'scenic',
    latitude: toFiniteCoordinateValue(runtimePoi?.latitude) || 0,
    longitude: toFiniteCoordinateValue(runtimePoi?.longitude) || 0,
    orderText,
    sequenceText: `第 ${orderText} 站`,
    description: summary || body || `${name} 已由后台发布。`,
    shortHint: summary || '后台发布点位已同步到小程序地图。',
    stayText: '建议停留 5 分钟',
    sceneLine: summary || '这个点位来自后台发布内容，可直接在小程序地图查看。',
    guideTip: audioGuideTitle
      ? `${audioGuideTitle} 已发布，可进入讲解页查看。`
      : '可查看后台发布的点位信息。',
    themeTag: '后台',
    themeTone: 'gold',
    triggerRadiusM: DEFAULT_TRIGGER_RADIUS_METERS,
    visible: true,
    cardVisible: true,
    checkinVisible: true,
    routeIndex: resolvedOrderIndex,
    sort: resolvedOrderIndex,
    iconPath: buildIconPath('scenic')
  }
}

function overlayRuntimePoi(basePoint = {}, runtimePoi = {}, routeOrderIndex = null) {
  const name = String(runtimePoi?.name || basePoint?.name || basePoint?.sourceName || '').trim() || basePoint.name
  const summary = String(runtimePoi?.summary || '').trim()
  const body = String(runtimePoi?.body || '').trim()
  const audioGuideTitle = String(runtimePoi?.audio_guide?.title || '').trim()
  const coverImageUrl = String(runtimePoi?.cover_asset?.file_url || '').trim()
  const orderText = Number.isInteger(routeOrderIndex)
    ? String(routeOrderIndex + 1).padStart(2, '0')
    : String(basePoint?.orderText || '').trim()

  return {
    ...basePoint,
    name: name || basePoint.name,
    sourceName: name || basePoint.sourceName || basePoint.name,
    latitude: toFiniteCoordinateValue(runtimePoi?.latitude) ?? basePoint.latitude,
    longitude: toFiniteCoordinateValue(runtimePoi?.longitude) ?? basePoint.longitude,
    description: summary || body || basePoint.description,
    shortHint: summary || basePoint.shortHint,
    sceneLine: summary || basePoint.sceneLine,
    guideTip: audioGuideTitle
      ? `${audioGuideTitle} 已发布，可进入讲解页查看。`
      : (basePoint.guideTip || '可查看后台发布的点位信息。'),
    orderText: orderText || basePoint.orderText,
    sequenceText: orderText
      ? `第 ${orderText} 站`
      : (basePoint.sequenceText || '导览点'),
    routeIndex: Number.isInteger(routeOrderIndex) ? routeOrderIndex : basePoint.routeIndex,
    sort: Number.isInteger(routeOrderIndex) ? routeOrderIndex : basePoint.sort,
    contentId: runtimePoi?.id,
    contentSlug: String(runtimePoi?.slug || '').trim(),
    summary,
    body,
    coverImageUrl,
    coverImage: coverImageUrl || basePoint.coverImage || basePoint.iconPath,
    galleryImageUrls: extractAssetUrls(runtimePoi?.gallery_assets),
    videoUrls: extractAssetUrls(runtimePoi?.video_assets),
    audioUrl: String(runtimePoi?.audio_guide?.asset?.file_url || '').trim(),
    audioGuideTitle,
    audioGuideSummary: String(runtimePoi?.audio_guide?.summary || '').trim(),
    audioDurationSeconds: Number(runtimePoi?.audio_guide?.duration_seconds) || 0
  }
}

function sortPoints(points = []) {
  return points.slice().sort((left, right) => {
    if (left?.type === 'start' && right?.type !== 'start') {
      return -1
    }

    if (left?.type !== 'start' && right?.type === 'start') {
      return 1
    }

    const leftRouteIndex = Number.isFinite(Number(left?.routeIndex))
      ? Number(left.routeIndex)
      : Number.POSITIVE_INFINITY
    const rightRouteIndex = Number.isFinite(Number(right?.routeIndex))
      ? Number(right.routeIndex)
      : Number.POSITIVE_INFINITY

    if (leftRouteIndex !== rightRouteIndex) {
      return leftRouteIndex - rightRouteIndex
    }

    const leftSort = Number.isFinite(Number(left?.sort)) ? Number(left.sort) : Number.POSITIVE_INFINITY
    const rightSort = Number.isFinite(Number(right?.sort)) ? Number(right.sort) : Number.POSITIVE_INFINITY

    if (leftSort !== rightSort) {
      return leftSort - rightSort
    }

    return Number(left?.markerId || 0) - Number(right?.markerId || 0)
  })
}

function pickPrimaryRuntimeRoute(runtimeRoutes = []) {
  if (!Array.isArray(runtimeRoutes) || !runtimeRoutes.length) {
    return null
  }

  const preferredRoute = runtimeRoutes.find((route) => {
    const routeName = normalizeLookupText(route?.name)
    const routeSlug = normalizeLookupText(route?.slug)

    return routeName.includes('主线') || routeSlug.includes('main')
  })

  return preferredRoute || runtimeRoutes[0]
}

function findRuntimePoiMatch(routePoints = [], runtimePoi = {}, usedIndexes = new Set()) {
  const runtimeAliases = buildRuntimePoiAliases(runtimePoi)

  if (runtimeAliases.length) {
    for (let index = 0; index < routePoints.length; index += 1) {
      if (usedIndexes.has(index)) {
        continue
      }

      const pointAliases = buildPointAliases(routePoints[index])
      if (runtimeAliases.some((alias) => pointAliases.includes(alias))) {
        return index
      }
    }
  }

  let matchedIndex = -1
  let matchedDistance = Number.POSITIVE_INFINITY

  routePoints.forEach((point, index) => {
    if (usedIndexes.has(index)) {
      return
    }

    const distance = haversineMeters(point, runtimePoi)
    if (distance < matchedDistance) {
      matchedIndex = index
      matchedDistance = distance
    }
  })

  return matchedDistance <= MAX_POI_MATCH_DISTANCE_METERS ? matchedIndex : -1
}

function buildRoutePolylinesFromTopLevel(runtimeRoutePolylines = []) {
  return (Array.isArray(runtimeRoutePolylines) ? runtimeRoutePolylines : [])
    .map(clonePolyline)
    .filter((polyline) => polyline.points.length >= 2)
}

function buildRoutePolylinesFromSegments(runtimeRoute = null) {
  const segments = Array.isArray(runtimeRoute?.polyline_segments)
    ? runtimeRoute.polyline_segments
    : []

  if (segments.length) {
    return segments
      .map((segment, index) => ({
        id: `route-${runtimeRoute?.id || runtimeRoute?.slug || 'runtime'}-segment-${index}`,
        points: Array.isArray(segment)
          ? segment
            .map((point) => ({
              longitude: toFiniteCoordinateValue(point?.longitude),
              latitude: toFiniteCoordinateValue(point?.latitude)
            }))
            .filter((point) => point.longitude !== null && point.latitude !== null)
          : [],
        color: ROUTE_POLYLINE_COLOR,
        width: index === 0 ? 6 : 4,
        isConnector: false
      }))
      .filter((polyline) => polyline.points.length >= 2)
  }

  const runtimePoints = Array.isArray(runtimeRoute?.path_points)
    ? runtimeRoute.path_points
      .map((point) => ({
        longitude: toFiniteCoordinateValue(point?.longitude),
        latitude: toFiniteCoordinateValue(point?.latitude)
      }))
      .filter((point) => point.longitude !== null && point.latitude !== null)
    : []

  if (runtimePoints.length >= 2) {
    return [
      {
        id: `route-${runtimeRoute?.id || runtimeRoute?.slug || 'runtime'}-segment-0`,
        points: runtimePoints,
        color: ROUTE_POLYLINE_COLOR,
        width: 6,
        isConnector: false
      }
    ]
  }

  return []
}

function buildRuntimeRoutePolylines(runtimePayload = {}, primaryRuntimeRoute = null) {
  const topLevelPolylines = buildRoutePolylinesFromTopLevel(runtimePayload?.routePolylines)

  if (topLevelPolylines.length) {
    return topLevelPolylines
  }

  return buildRoutePolylinesFromSegments(primaryRuntimeRoute)
}

function buildRuntimeRouteOptions(runtimePayload = {}, runtimeRoutes = [], routePoints = []) {
  if (!Array.isArray(runtimeRoutes) || !runtimeRoutes.length) {
    return []
  }

  const routePointLookup = routePoints.reduce((result, point) => {
    const contentId = String(point?.contentId || '').trim()
    if (contentId) {
      result.byContentId[contentId] = point
    }

    buildPointAliases(point).forEach((alias) => {
      if (!result.byAlias[alias]) {
        result.byAlias[alias] = point
      }
    })

    return result
  }, {
    byContentId: {},
    byAlias: {}
  })

  const topLevelRouteOptions = (Array.isArray(runtimePayload?.runtimeRouteOptions)
    ? runtimePayload.runtimeRouteOptions
    : [])
    .map(cloneRouteOption)
    .filter((route) => route.polylines.length || route.points.length)

  if (topLevelRouteOptions.length) {
    return topLevelRouteOptions.map((route, index) => ({
      ...route,
      theme: route.theme || ROUTE_THEME_SEQUENCE[index % ROUTE_THEME_SEQUENCE.length],
      points: Array.isArray(route.points)
        ? route.points.map((runtimePoi) => {
          const contentId = String(runtimePoi?.id || '').trim()
          if (contentId && routePointLookup.byContentId[contentId]) {
            return routePointLookup.byContentId[contentId]
          }

          const aliases = buildRuntimePoiAliases(runtimePoi)
          const matchedPoint = aliases
            .map((alias) => routePointLookup.byAlias[alias])
            .find(Boolean)

          return matchedPoint || { ...runtimePoi }
        })
        : []
    }))
  }

  return runtimeRoutes.map((route, index) => {
    const routePointsByOrder = []
    const pointIds = Array.isArray(route?.poi_ids) ? route.poi_ids : []
    const routePois = Array.isArray(route?.pois) ? route.pois : []
    const pointKeys = pointIds.length
      ? pointIds.map((poiId) => String(poiId))
      : routePois.map((poi) => String(poi?.id || poi?.slug || poi?.name || ''))

    pointKeys.forEach((key) => {
      const resolvedPoint = routePointLookup.byContentId[key]
      if (resolvedPoint && !routePointsByOrder.includes(resolvedPoint)) {
        routePointsByOrder.push(resolvedPoint)
      }
    })

    routePois.forEach((poi) => {
      const aliases = buildRuntimePoiAliases(poi)
      const resolvedPoint = aliases
        .map((alias) => routePointLookup.byAlias[alias])
        .find(Boolean)

      if (resolvedPoint && !routePointsByOrder.includes(resolvedPoint)) {
        routePointsByOrder.push(resolvedPoint)
      }
    })

    return {
      id: String(route?.slug || `route-${route?.id || index + 1}`).trim(),
      backendRouteId: route?.id,
      contentSlug: String(route?.slug || '').trim(),
      name: String(route?.name || `路线 ${index + 1}`).trim(),
      description: String(
        route?.summary
        || route?.body
        || routePointsByOrder.map((point) => point?.name).filter(Boolean).join(' · ')
        || '后台发布路线'
      ).trim(),
      theme: ROUTE_THEME_SEQUENCE[index % ROUTE_THEME_SEQUENCE.length],
      polylines: buildRoutePolylinesFromSegments(route),
      points: routePointsByOrder
    }
  }).filter((route) => route.polylines.length || route.points.length)
}

function buildPublishedMapRuntimeData(staticMapData = {}, runtimePayload = {}) {
  const staticRoutePoints = Array.isArray(staticMapData?.JYL_ROUTE_MARKER_POINTS || staticMapData?.visiblePois)
    ? (staticMapData.JYL_ROUTE_MARKER_POINTS || staticMapData.visiblePois).map(clonePoint)
    : []
  const staticCardPoints = Array.isArray(staticMapData?.JYL_MARKER_POINTS || staticMapData?.cardPois)
    ? (staticMapData.JYL_MARKER_POINTS || staticMapData.cardPois).map(clonePoint)
    : []
  const runtimePois = Array.isArray(runtimePayload?.pois) ? runtimePayload.pois : []
  const runtimeRoutes = Array.isArray(runtimePayload?.routes) ? runtimePayload.routes : []
  const primaryRuntimeRoute = pickPrimaryRuntimeRoute(runtimeRoutes)
  const routeOrderMap = buildRuntimeRouteOrderMap(primaryRuntimeRoute)
  const usedRoutePointIndexes = new Set()
  const mergedRoutePoints = staticRoutePoints.slice()
  let nextMarkerId = mergedRoutePoints.reduce((maxValue, point) => Math.max(maxValue, Number(point?.markerId || 0)), 0) + 1

  runtimePois.forEach((runtimePoi) => {
    const matchedIndex = findRuntimePoiMatch(mergedRoutePoints, runtimePoi, usedRoutePointIndexes)
    const routeOrderIndex = Object.prototype.hasOwnProperty.call(routeOrderMap, String(runtimePoi?.id))
      ? routeOrderMap[String(runtimePoi.id)]
      : null

    if (matchedIndex >= 0) {
      mergedRoutePoints[matchedIndex] = overlayRuntimePoi(
        mergedRoutePoints[matchedIndex],
        runtimePoi,
        routeOrderIndex
      )
      usedRoutePointIndexes.add(matchedIndex)
      return
    }

    const generatedPoint = overlayRuntimePoi(
      buildGeneratedPoint(runtimePoi, nextMarkerId, routeOrderIndex),
      runtimePoi,
      routeOrderIndex
    )

    mergedRoutePoints.push(generatedPoint)
    usedRoutePointIndexes.add(mergedRoutePoints.length - 1)
    nextMarkerId += 1
  })

  const sortedRoutePoints = sortPoints(mergedRoutePoints)
  const mergedCardPoints = sortPoints(
    sortedRoutePoints.filter((point) => point?.checkinVisible !== false)
  )
  const runtimeRouteOptions = buildRuntimeRouteOptions(runtimePayload, runtimeRoutes, sortedRoutePoints)
  const routePolylines = buildRuntimeRoutePolylines(runtimePayload, primaryRuntimeRoute)

  return {
    release: runtimePayload?.release || null,
    resourceVersion: Number(runtimePayload?.resource_version) || 0,
    runtimeMapConfig: runtimePayload?.map || null,
    JYL_ROUTE: {
      ...(staticMapData?.JYL_ROUTE || staticMapData?.route || {}),
      id: primaryRuntimeRoute?.id || staticMapData?.JYL_ROUTE?.id || staticMapData?.route?.id,
      name: primaryRuntimeRoute?.name || staticMapData?.JYL_ROUTE?.name || staticMapData?.route?.name,
      pathPoints: routePolylines.flatMap((polyline) => polyline.points || [])
    },
    JYL_MARKER_POINTS: mergedCardPoints,
    JYL_ROUTE_MARKER_POINTS: sortedRoutePoints,
    JYL_ROUTE_POLYLINES: routePolylines,
    runtimeRouteOptions
  }
}

module.exports = {
  buildPublishedMapRuntimeData
}
