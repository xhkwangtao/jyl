import type { CoordinatePair, EditorDocument, PoiRecord, PoiType } from '../types'
import {
  gcj02ToWgs84,
  nearestRouteIndex,
  roundCoordinatePair,
  totalDistanceMeters,
  wgs84ToGcj02
} from './geo'

function slugify(value: string): string {
  const slug = value
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return slug || 'poi'
}

function uniquePoiId(base: string, existingIds: Set<string>): string {
  let counter = 1
  let candidate = base

  while (existingIds.has(candidate)) {
    counter += 1
    candidate = `${base}-${counter}`
  }

  existingIds.add(candidate)
  return candidate
}

export function buildPoiSummary(pois: PoiRecord[]): EditorDocument['poiSummary'] {
  return {
    visibleCount: pois.filter((poi) => poi.visible).length,
    cardCount: pois.filter((poi) => poi.cardVisible).length,
    hiddenTriggerCount: pois.filter((poi) => !poi.visible).length,
    totalCount: pois.length
  }
}

export function applyPoiDisplayOrder(pois: PoiRecord[]): PoiRecord[] {
  const nextPois = [...pois].sort((left, right) => {
    if (left.sort !== right.sort) {
      return left.sort - right.sort
    }

    if (left.routeIndex !== right.routeIndex) {
      return left.routeIndex - right.routeIndex
    }

    return left.name.localeCompare(right.name, 'zh-CN')
  })

  let displayOrder = 1
  nextPois.forEach((poi) => {
    if (poi.cardVisible) {
      poi.orderText = String(displayOrder).padStart(2, '0')
      poi.sequenceText = `第 ${String(displayOrder).padStart(2, '0')} 站`
      displayOrder += 1
      return
    }

    poi.orderText = ''
    poi.sequenceText =
      poi.type === 'start' ? '路线起点' : poi.type === 'end' ? '路线终点' : poi.themeTag
  })

  return nextPois
}

export function recalculateDocument(
  document: EditorDocument,
  options: { syncSortWithRoute?: boolean } = {}
): EditorDocument {
  const syncSortWithRoute = options.syncSortWithRoute ?? true
  const routeWgs84 = document.route.pathWgs84.map(roundCoordinatePair)
  const routeGcj02 = routeWgs84.map((point) => roundCoordinatePair(wgs84ToGcj02(...point)))

  const pois = document.pois.map((poi) => {
    const routeIndex = nearestRouteIndex(poi.locationWgs84, routeWgs84)
    return {
      ...poi,
      routeIndex,
      sort: syncSortWithRoute ? routeIndex : poi.sort,
      locationWgs84: roundCoordinatePair(poi.locationWgs84),
      locationGcj02: roundCoordinatePair(poi.locationGcj02)
    }
  })

  const orderedPois = applyPoiDisplayOrder(pois)

  return {
    ...document,
    route: {
      ...document.route,
      distanceMeters: totalDistanceMeters(routeWgs84),
      sourcePointCount: routeWgs84.length,
      simplifiedPointCount: routeWgs84.length,
      pathWgs84: routeWgs84,
      pathGcj02: routeGcj02
    },
    poiSummary: buildPoiSummary(orderedPois),
    pois: orderedPois
  }
}

function buildTheme(type: PoiType): { tag: string; tone: string } {
  switch (type) {
    case 'start':
      return { tag: '起点', tone: 'forest' }
    case 'end':
      return { tag: '终点', tone: 'stone' }
    case 'service':
      return { tag: '服务', tone: 'teal' }
    case 'junction':
      return { tag: '岔路', tone: 'sunset' }
    case 'guide':
      return { tag: '提示', tone: 'forest' }
    case 'scenic':
    default:
      return { tag: '景点', tone: 'gold' }
  }
}

export function createPoiAtGcj02(
  document: EditorDocument,
  locationGcj02: CoordinatePair,
  overrides: Partial<PoiRecord> = {}
): PoiRecord {
  const existingIds = new Set(document.pois.map((poi) => poi.id))
  const nextIndex = document.pois.length + 1
  const defaultName = `新景点 ${String(nextIndex).padStart(2, '0')}`
  const type = overrides.type ?? 'scenic'
  const theme = buildTheme(type)
  const locationWgs84 = roundCoordinatePair(gcj02ToWgs84(...locationGcj02))
  const id = uniquePoiId(slugify(overrides.name || defaultName), existingIds)
  const routeIndex = nearestRouteIndex(locationWgs84, document.route.pathWgs84)

  return {
    id,
    key: id,
    sourceName: overrides.sourceName ?? defaultName,
    name: overrides.name ?? defaultName,
    type,
    visible: overrides.visible ?? true,
    cardVisible: overrides.cardVisible ?? true,
    checkinVisible: overrides.checkinVisible ?? true,
    themeTag: overrides.themeTag ?? theme.tag,
    themeTone: overrides.themeTone ?? theme.tone,
    shortHint: overrides.shortHint ?? '拖动点位并结合照片，给这个景点补一个明确的名字。',
    description: overrides.description ?? '新添加的景点标注点。',
    stayText: overrides.stayText ?? '建议停留 5 分钟',
    sceneLine: overrides.sceneLine ?? '适合现场确认后决定是否公开展示。',
    guideTip: overrides.guideTip ?? '可继续补充讲解文案、停留时长和展示方式。',
    triggerRadiusM: overrides.triggerRadiusM ?? 35,
    routeIndex,
    sort: routeIndex,
    orderText: '',
    sequenceText: '',
    locationWgs84,
    locationGcj02: roundCoordinatePair(locationGcj02),
    photos: overrides.photos ?? []
  }
}

export function replacePoi(
  document: EditorDocument,
  poiId: string,
  updater: (poi: PoiRecord) => PoiRecord,
  options: { syncSortWithRoute?: boolean } = {}
): EditorDocument {
  const pois = document.pois.map((poi) => (poi.id === poiId ? updater(poi) : poi))

  return recalculateDocument(
    {
      ...document,
      pois
    },
    { syncSortWithRoute: options.syncSortWithRoute ?? true }
  )
}

export function movePointOrder(document: EditorDocument, poiId: string, direction: -1 | 1): EditorDocument {
  const ordered = applyPoiDisplayOrder(document.pois.map((poi) => ({ ...poi })))
  const index = ordered.findIndex((poi) => poi.id === poiId)

  if (index < 0) {
    return document
  }

  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= ordered.length) {
    return document
  }

  const reordered = [...ordered]
  const [item] = reordered.splice(index, 1)
  reordered.splice(targetIndex, 0, item)

  const nextPois = reordered.map((poi, orderIndex) => ({
    ...poi,
    sort: orderIndex + 1
  }))

  return recalculateDocument(
    {
      ...document,
      pois: nextPois
    },
    { syncSortWithRoute: false }
  )
}
