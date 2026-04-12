export type CoordinatePair = [number, number]

export type PoiType =
  | 'start'
  | 'end'
  | 'scenic'
  | 'service'
  | 'guide'
  | 'junction'

export interface PhotoAsset {
  id: string
  name: string
  originalPath: string
  mimeType: string
  size: number
  bytes?: Uint8Array
  previewUrl?: string
}

export interface PoiRecord {
  id: string
  key: string
  sourceName: string
  name: string
  type: PoiType
  visible: boolean
  cardVisible: boolean
  checkinVisible: boolean
  themeTag: string
  themeTone: string
  shortHint: string
  description: string
  stayText: string
  sceneLine: string
  guideTip: string
  triggerRadiusM: number
  routeIndex: number
  sort: number
  orderText: string
  sequenceText: string
  locationWgs84: CoordinatePair
  locationGcj02: CoordinatePair
  photos: PhotoAsset[]
}

export interface RouteRecord {
  id: string
  name: string
  distanceMeters: number
  sourcePointCount: number
  simplifiedPointCount: number
  pathWgs84: CoordinatePair[]
  pathGcj02: CoordinatePair[]
}

export interface EditorMeta {
  importedAt: string
  sourceKmzName: string
  warnings: string[]
}

export interface EditorDocument {
  sourceFile: string
  sourceCoordinateSystem: 'WGS84'
  outputCoordinateSystem: 'GCJ-02'
  route: RouteRecord
  poiSummary: {
    visibleCount: number
    cardCount: number
    hiddenTriggerCount: number
    totalCount: number
  }
  pois: PoiRecord[]
  editorMeta: EditorMeta
}
