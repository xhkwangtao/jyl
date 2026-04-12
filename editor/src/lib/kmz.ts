import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import type { CoordinatePair, EditorDocument, PhotoAsset, PoiRecord, PoiType } from '../types'
import {
  haversineMeters,
  nearestRouteIndex,
  roundCoordinatePair,
  totalDistanceMeters,
  wgs84ToGcj02
} from './geo'

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: false,
  cdataPropName: '__cdata'
})

interface RawPlacemark {
  id: string
  name: string
  descriptionHtml: string
  coordinates: CoordinatePair
  styleUrl: string
  data: Record<string, string>
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (Array.isArray(value)) {
    return value
  }

  return value === undefined ? [] : [value]
}

function readStringValue(value: unknown): string {
  if (value === undefined || value === null) {
    return ''
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (typeof value === 'object' && value && '__cdata' in value) {
    return readStringValue((value as { __cdata?: unknown }).__cdata)
  }

  return ''
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return slug || 'poi'
}

function mimeTypeForFileName(fileName: string): string {
  const lower = fileName.toLowerCase()

  if (lower.endsWith('.png')) {
    return 'image/png'
  }

  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg'
  }

  if (lower.endsWith('.webp')) {
    return 'image/webp'
  }

  return 'application/octet-stream'
}

function normalizeName(name: string, fallback: string): string {
  const value = name.trim()
  return value || fallback
}

function inferPoiType(name: string, hasPhotos: boolean): PoiType {
  const normalized = name.replace(/\s+/g, '')

  if (normalized.includes('起点')) {
    return 'start'
  }

  if (normalized.includes('终点')) {
    return 'end'
  }

  if (normalized.includes('客服') || normalized.includes('服务')) {
    return 'service'
  }

  if (normalized.includes('岔路') || normalized.includes('两条路')) {
    return 'junction'
  }

  if (normalized.includes('提示') || normalized.includes('回顾') || normalized.includes('路线')) {
    return 'guide'
  }

  if (hasPhotos) {
    return 'scenic'
  }

  return 'guide'
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

function getFolderPlacemarks(parsed: Record<string, unknown>): unknown[] {
  const root = parsed.kml as Record<string, unknown> | undefined
  const document = root?.Document as Record<string, unknown> | undefined

  if (!document) {
    return []
  }

  const folders = toArray(document.Folder as Record<string, unknown> | Record<string, unknown>[] | undefined)

  const pointFolder = folders.find((folder) => folder.id === 'TbuluHisPointFolder')
  if (!pointFolder) {
    return []
  }

  return toArray((pointFolder as Record<string, unknown>).Placemark as unknown[] | unknown | undefined)
}

function parseCoordinateString(value: string): CoordinatePair | null {
  const parts = value.split(',').map((item) => item.trim())

  if (parts.length < 2) {
    return null
  }

  const longitude = Number(parts[0])
  const latitude = Number(parts[1])

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null
  }

  return [longitude, latitude]
}

function parseTrack(parsed: Record<string, unknown>): CoordinatePair[] {
  const root = parsed.kml as Record<string, unknown> | undefined
  const document = root?.Document as Record<string, unknown> | undefined
  const folders = toArray(document?.Folder as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const placemarks = folders.flatMap((folder) =>
    toArray((folder as Record<string, unknown>).Placemark as Record<string, unknown> | Record<string, unknown>[] | undefined)
  )

  for (const placemark of placemarks) {
    const track = placemark['gx:Track'] as Record<string, unknown> | undefined

    if (!track) {
      continue
    }

    const coords = toArray(track['gx:coord'] as string | string[] | undefined)
      .map((item) => readStringValue(item))
      .map((item) => item.split(/\s+/).map((token) => token.trim()))
      .filter((tokens) => tokens.length >= 2)
      .map((tokens) => [Number(tokens[0]), Number(tokens[1])] as CoordinatePair)
      .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude))

    if (coords.length) {
      return coords
    }
  }

  return []
}

function parsePlacemark(record: Record<string, unknown>, index: number): RawPlacemark | null {
  const point = record.Point as Record<string, unknown> | undefined
  const coordinateValue = readStringValue(point?.coordinates)
  const coordinates = parseCoordinateString(coordinateValue)

  if (!coordinates) {
    return null
  }

  const extendedData = record.ExtendedData as Record<string, unknown> | undefined
  const dataNodes = toArray(extendedData?.Data as Record<string, unknown> | Record<string, unknown>[] | undefined)

  const data: Record<string, string> = {}
  dataNodes.forEach((node) => {
    const key = readStringValue((node as Record<string, unknown>).name)
    if (!key) {
      return
    }

    data[key] = readStringValue((node as Record<string, unknown>).value)
  })

  return {
    id: readStringValue(record.id) || `placemark-${index + 1}`,
    name: readStringValue(record.name),
    descriptionHtml: readStringValue(record.description),
    coordinates,
    styleUrl: readStringValue(record.styleUrl),
    data
  }
}

function uniquePoiId(base: string, existing: Set<string>): string {
  let counter = 1
  let candidate = base

  while (existing.has(candidate)) {
    counter += 1
    candidate = `${base}-${counter}`
  }

  existing.add(candidate)
  return candidate
}

function buildPhotoAsset(
  placemark: RawPlacemark,
  bytes: Uint8Array,
  createObjectUrls: boolean
): PhotoAsset {
  const originalPath = `files/${placemark.data.FileName || placemark.data.FilePath || placemark.id}`
  const fileName = originalPath.split('/').pop() || `${placemark.id}.png`
  const mimeType = mimeTypeForFileName(fileName)
  const asset: PhotoAsset = {
    id: `${placemark.id}:${fileName}`,
    name: fileName,
    originalPath,
    mimeType,
    size: bytes.byteLength,
    bytes
  }

  if (createObjectUrls && typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
    const safeBytes = Uint8Array.from(bytes)
    asset.previewUrl = URL.createObjectURL(new Blob([safeBytes], { type: mimeType }))
  }

  return asset
}

function buildPoiRecord(
  placemark: RawPlacemark,
  routeWgs84: CoordinatePair[],
  photos: PhotoAsset[],
  existingIds: Set<string>
): PoiRecord {
  const fallbackName = `marker-${String(placemark.id).replace(/[^\d]/g, '') || 'point'}`
  const sourceName = normalizeName(placemark.name, fallbackName)
  const type = inferPoiType(sourceName, photos.length > 0)
  const theme = buildTheme(type)
  const keyBase = slugify(sourceName)
  const id = uniquePoiId(keyBase, existingIds)
  const routeIndex = nearestRouteIndex(placemark.coordinates, routeWgs84)
  const visible = type !== 'end'
  const cardVisible = type !== 'start' && type !== 'end'
  const checkinVisible = type !== 'start' && type !== 'end'

  return {
    id,
    key: id,
    sourceName,
    name: sourceName,
    type,
    visible,
    cardVisible,
    checkinVisible,
    themeTag: theme.tag,
    themeTone: theme.tone,
    shortHint: photos.length ? '已关联现场照片，可边看图边命名景点。' : '当前点暂无照片，可按位置和轨迹关系补充说明。',
    description: placemark.descriptionHtml || '从 KMZ 导入的原始标注点。',
    stayText: '建议停留 5 分钟',
    sceneLine: photos.length ? '可以结合照片内容决定这个点是否值得做公开景点。' : '如果它只是提示点，可保留为隐藏触发点。',
    guideTip: '拖动地图中的点位或在右侧直接修改名称和展示方式。',
    triggerRadiusM: type === 'scenic' ? 40 : 30,
    routeIndex,
    sort: routeIndex,
    orderText: '',
    sequenceText: '',
    locationWgs84: roundCoordinatePair(placemark.coordinates),
    locationGcj02: roundCoordinatePair(wgs84ToGcj02(...placemark.coordinates)),
    photos
  }
}

function refreshPoiOrdering(pois: PoiRecord[]): PoiRecord[] {
  const sorted = [...pois].sort((left, right) => {
    if (left.sort !== right.sort) {
      return left.sort - right.sort
    }

    return left.routeIndex - right.routeIndex
  })

  let visibleCardOrder = 1

  sorted.forEach((poi) => {
    if (poi.cardVisible) {
      poi.orderText = String(visibleCardOrder).padStart(2, '0')
      poi.sequenceText = `第 ${String(visibleCardOrder).padStart(2, '0')} 站`
      visibleCardOrder += 1
      return
    }

    poi.orderText = ''
    poi.sequenceText =
      poi.type === 'start' ? '路线起点' : poi.type === 'end' ? '路线终点' : poi.themeTag
  })

  return sorted
}

function summarizePois(pois: PoiRecord[]): EditorDocument['poiSummary'] {
  return {
    visibleCount: pois.filter((poi) => poi.visible).length,
    cardCount: pois.filter((poi) => poi.cardVisible).length,
    hiddenTriggerCount: pois.filter((poi) => !poi.visible).length,
    totalCount: pois.length
  }
}

function findPhotoBytesMap(zip: JSZip): Map<string, Uint8Array> {
  const fileMap = new Map<string, Uint8Array>()

  Object.entries(zip.files).forEach(([name, file]) => {
    if (file.dir) {
      return
    }

    if (!name.startsWith('files/')) {
      return
    }

    fileMap.set(name, new Uint8Array())
  })

  return fileMap
}

export async function parseKmzArrayBuffer(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  options: { createObjectUrls?: boolean } = {}
): Promise<EditorDocument> {
  const createObjectUrls = options.createObjectUrls ?? true
  const zip = await JSZip.loadAsync(arrayBuffer)
  const kmlEntry = Object.values(zip.files).find((entry) => entry.name.toLowerCase().endsWith('.kml'))

  if (!kmlEntry) {
    throw new Error('导入失败：KMZ 中没有找到 KML 文件。')
  }

  const kmlText = await kmlEntry.async('text')
  const parsed = xmlParser.parse(kmlText) as Record<string, unknown>
  const routeWgs84 = parseTrack(parsed)

  if (!routeWgs84.length) {
    throw new Error('导入失败：没有找到轨迹坐标。')
  }

  const placemarkRecords = getFolderPlacemarks(parsed)
    .map((item, index) => parsePlacemark(item as Record<string, unknown>, index))
    .filter((item): item is RawPlacemark => Boolean(item))

  const photoBytesMap = new Map<string, Uint8Array>()
  await Promise.all(
    Object.values(zip.files)
      .filter((entry) => !entry.dir && entry.name.startsWith('files/'))
      .map(async (entry) => {
        photoBytesMap.set(entry.name, await entry.async('uint8array'))
      })
  )

  const existingIds = new Set<string>()
  const warnings: string[] = []
  const poiRecords = placemarkRecords.map((placemark) => {
    const photoCandidates = Array.from(new Set([
      placemark.data.FileName ? `files/${placemark.data.FileName}` : '',
      placemark.data.FilePath ? `files/${placemark.data.FilePath}` : ''
    ].filter(Boolean)))

    const photos = photoCandidates
      .map((path) => {
        const bytes = photoBytesMap.get(path)
        return bytes ? buildPhotoAsset(placemark, bytes, createObjectUrls) : null
      })
      .filter((item): item is PhotoAsset => Boolean(item))

    if (!placemark.name.trim() && photos.length) {
      warnings.push(`图片标注点 ${placemark.id} 没有名称，已分配临时名称。`)
    }

    return buildPoiRecord(placemark, routeWgs84, photos, existingIds)
  })

  const orderedPois = refreshPoiOrdering(poiRecords)
  const routeGcj02 = routeWgs84.map((point) => roundCoordinatePair(wgs84ToGcj02(...point)))
  const summary = summarizePois(orderedPois)

  return {
    sourceFile: fileName,
    sourceCoordinateSystem: 'WGS84',
    outputCoordinateSystem: 'GCJ-02',
    route: {
      id: 'route-main',
      name: fileName.replace(/\.kmz$/i, '') || '导入轨迹',
      distanceMeters: totalDistanceMeters(routeWgs84),
      sourcePointCount: routeWgs84.length,
      simplifiedPointCount: routeGcj02.length,
      pathWgs84: routeWgs84.map(roundCoordinatePair),
      pathGcj02: routeGcj02
    },
    poiSummary: summary,
    pois: orderedPois,
    editorMeta: {
      importedAt: new Date().toISOString(),
      sourceKmzName: fileName,
      warnings
    }
  }
}

export async function parseKmzFile(file: File): Promise<EditorDocument> {
  const arrayBuffer = await file.arrayBuffer()
  return parseKmzArrayBuffer(arrayBuffer, file.name, { createObjectUrls: true })
}

export function releasePhotoUrls(document: EditorDocument | null): void {
  if (!document || typeof URL === 'undefined') {
    return
  }

  document.pois.forEach((poi) => {
    poi.photos.forEach((photo) => {
      if (photo.previewUrl) {
        URL.revokeObjectURL(photo.previewUrl)
      }
    })
  })
}

export function recomputeRouteIndexes(document: EditorDocument): EditorDocument {
  const route = document.route.pathWgs84
  const pois = document.pois.map((poi) => ({
    ...poi,
    routeIndex: nearestRouteIndex(poi.locationWgs84, route)
  }))

  const orderedPois = refreshPoiOrdering(pois)
  return {
    ...document,
    poiSummary: summarizePois(orderedPois),
    pois: orderedPois,
    route: {
      ...document.route,
      distanceMeters: totalDistanceMeters(route),
      sourcePointCount: route.length,
      simplifiedPointCount: route.length,
      pathGcj02: route.map((point) => roundCoordinatePair(wgs84ToGcj02(...point)))
    }
  }
}
