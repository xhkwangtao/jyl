import { useEffect, useMemo, useRef, useState } from 'react'
import type { CoordinatePair, EditorDocument } from '../types'
import { buildMarkerStyleMap, buildPolylineStyles, loadTencentMap } from '../lib/tmap'
import type { EditorMode } from './SpatialEditor'
import { haversineMeters } from '../lib/geo'

interface TencentMapPanelProps {
  document: EditorDocument
  selectedPoiId: string | null
  selectedRouteIndex: number | null
  mode: EditorMode
  onSelectPoi: (poiId: string | null) => void
  onSelectRouteIndex: (routeIndex: number | null) => void
  onAddPoi: (locationGcj02: CoordinatePair) => void
  onMovePoi: (poiId: string, locationGcj02: CoordinatePair) => void
  onMoveRoutePoint: (routeIndex: number, locationGcj02: CoordinatePair) => void
  onInsertRoutePoint: (routeIndex: number, locationGcj02: CoordinatePair) => void
  onDiagnosticChange?: (diagnostic: MapDiagnosticState) => void
}

export interface MapDiagnosticState {
  currentHost: string
  keyPresent: boolean
  keyPreview: string
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  loadError: string
  tmapObjectReady: boolean
  mapInstanceReady: boolean
  poiLayerReady: boolean
  routeLayerReady: boolean
  routeVertexLayerReady: boolean
  poiCount: number
  routePointCount: number
  selectedPoiId: string | null
  selectedRouteIndex: number | null
  mode: EditorMode
}

function averageCenter(points: Array<[number, number]>): { lat: number; lng: number } {
  if (!points.length) {
    return { lat: 39.9042, lng: 116.4074 }
  }

  const summary = points.reduce(
    (acc, [lng, lat]) => ({
      lng: acc.lng + lng,
      lat: acc.lat + lat
    }),
    { lng: 0, lat: 0 }
  )

  return {
    lng: summary.lng / points.length,
    lat: summary.lat / points.length
  }
}

function buildLatLngs(TMap: any, points: Array<[number, number]>): any[] {
  return points.map(([lng, lat]) => new TMap.LatLng(lat, lng))
}

function getLatLng(event: any): CoordinatePair | null {
  const latLng = event?.latLng ?? event?.geometry?.position ?? null
  if (!latLng) {
    return null
  }

  const latitude =
    typeof latLng.getLat === 'function' ? latLng.getLat() : latLng.lat
  const longitude =
    typeof latLng.getLng === 'function' ? latLng.getLng() : latLng.lng

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null
  }

  return [Number(longitude), Number(latitude)]
}

function tryFitBounds(TMap: any, map: any, points: Array<[number, number]>): void {
  if (!points.length || typeof map?.fitBounds !== 'function' || typeof TMap?.LatLngBounds !== 'function') {
    return
  }

  const lngList = points.map(([lng]) => lng)
  const latList = points.map(([, lat]) => lat)
  const southWest = new TMap.LatLng(Math.min(...latList), Math.min(...lngList))
  const northEast = new TMap.LatLng(Math.max(...latList), Math.max(...lngList))

  try {
    map.fitBounds(new TMap.LatLngBounds(southWest, northEast), { padding: 64 })
  } catch (_error) {
    // keep center/zoom fallback if the current SDK version differs
  }
}

function buildModeHint(mode: EditorMode, selectedPoiId: string | null, selectedRouteIndex: number | null): string {
  if (mode === 'add-point') {
    return '当前是“添加景点”模式：直接在地图上点一下，新景点就会加到那个位置。'
  }

  if (mode === 'move-poi') {
    return selectedPoiId
      ? '当前是“移动景点”模式：在地图上点一个新位置，选中的景点会移动过去。'
      : '请先点选一个景点，再进入“移动景点”模式。'
  }

  if (mode === 'insert-route-point') {
    return '当前是“插入轨迹点”模式：在轨迹附近点一下，会自动插入到最近的轨迹段。'
  }

  if (mode === 'move-route-point') {
    return selectedRouteIndex !== null
      ? '当前是“移动轨迹点”模式：再在地图上点一个新位置，选中的轨迹点会移动过去。'
      : '当前是“移动轨迹点”模式：先点地图上的小圆点选中一个轨迹点。'
  }

  return '选择模式：点景点可编辑名称，点轨迹小圆点可选中轨迹点。'
}

function screenToLatLng(
  map: any,
  container: HTMLDivElement,
  clientX: number,
  clientY: number
): CoordinatePair | null {
  const bounds = map?.getBounds?.()
  if (!bounds) return null

  const rect = container.getBoundingClientRect()
  if (!rect.width || !rect.height) return null

  const ratioX = (clientX - rect.left) / rect.width
  const ratioY = (clientY - rect.top) / rect.height

  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  const swLat = typeof sw.getLat === 'function' ? sw.getLat() : sw.lat
  const swLng = typeof sw.getLng === 'function' ? sw.getLng() : sw.lng
  const neLat = typeof ne.getLat === 'function' ? ne.getLat() : ne.lat
  const neLng = typeof ne.getLng === 'function' ? ne.getLng() : ne.lng

  return [
    swLng + ratioX * (neLng - swLng),
    neLat - ratioY * (neLat - swLat)
  ]
}

function resolvePoiIdFromEvent(event: any, pois: EditorDocument['pois'], thresholdMeters = 90): string | null {
  const directId =
    event?.geometry?.properties?.poiId ??
    event?.geometry?.id ??
    event?.id ??
    null
  if (directId) {
    return String(directId)
  }

  const eventCoordinate = getLatLng(event)
  if (!eventCoordinate) {
    return null
  }

  let bestPoiId: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  pois.forEach((poi) => {
    const distance = haversineMeters(poi.locationGcj02, eventCoordinate)
    if (distance < bestDistance) {
      bestDistance = distance
      bestPoiId = poi.id
    }
  })

  return bestDistance <= thresholdMeters ? bestPoiId : null
}

function resolveRouteIndexByCoordinate(
  coordinate: CoordinatePair,
  routePoints: Array<[number, number]>,
  thresholdMeters = 25
): number | null {
  let bestIndex: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  routePoints.forEach((point, index) => {
    const distance = haversineMeters(point, coordinate)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })

  return bestDistance <= thresholdMeters ? bestIndex : null
}

export default function TencentMapPanel({
  document,
  selectedPoiId,
  selectedRouteIndex,
  mode,
  onSelectPoi,
  onSelectRouteIndex,
  onAddPoi,
  onMovePoi,
  onMoveRoutePoint,
  onInsertRoutePoint,
  onDiagnosticChange
}: TencentMapPanelProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const poiMarkerRef = useRef<any>(null)
  const routeVertexRef = useRef<any>(null)
  const polylineRef = useRef<any>(null)
  const modeRef = useRef<EditorMode>(mode)
  const selectedPoiIdRef = useRef<string | null>(selectedPoiId)
  const selectedRouteIndexRef = useRef<number | null>(selectedRouteIndex)
  const selectPoiRef = useRef(onSelectPoi)
  const selectRouteIndexRef = useRef(onSelectRouteIndex)
  const addPoiRef = useRef(onAddPoi)
  const movePoiRef = useRef(onMovePoi)
  const moveRoutePointRef = useRef(onMoveRoutePoint)
  const insertRoutePointRef = useRef(onInsertRoutePoint)
  const routePointsRef = useRef(document.route.pathGcj02)
  const poiRecordsRef = useRef(document.pois)
  const ignoreNextMapClickRef = useRef(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const tmapKey = import.meta.env.VITE_TMAP_KEY || ''
  const center = useMemo(
    () => averageCenter(document.route.pathGcj02),
    [document.route.pathGcj02]
  )
  const modeHint = useMemo(
    () => buildModeHint(mode, selectedPoiId, selectedRouteIndex),
    [mode, selectedPoiId, selectedRouteIndex]
  )
  const diagnostic = useMemo<MapDiagnosticState>(() => {
    const keyPreview =
      tmapKey.length >= 8 ? `${tmapKey.slice(0, 4)}...${tmapKey.slice(-4)}` : tmapKey ? '已读取' : '未读取'

    return {
      currentHost: typeof window !== 'undefined' ? window.location.host : '',
      keyPresent: Boolean(tmapKey),
      keyPreview,
      loadState,
      loadError: loadError || '',
      tmapObjectReady: Boolean(typeof window !== 'undefined' && window.TMap),
      mapInstanceReady: Boolean(mapRef.current),
      poiLayerReady: Boolean(poiMarkerRef.current),
      routeLayerReady: Boolean(polylineRef.current),
      routeVertexLayerReady: Boolean(routeVertexRef.current),
      poiCount: document.pois.length,
      routePointCount: document.route.pathGcj02.length,
      selectedPoiId,
      selectedRouteIndex,
      mode
    }
  }, [
    document.pois.length,
    document.route.pathGcj02.length,
    loadError,
    loadState,
    mode,
    selectedPoiId,
    selectedRouteIndex,
    tmapKey
  ])

  useEffect(() => {
    onDiagnosticChange?.(diagnostic)
  }, [diagnostic, onDiagnosticChange])

  useEffect(() => {
    modeRef.current = mode
    selectedPoiIdRef.current = selectedPoiId
    selectedRouteIndexRef.current = selectedRouteIndex
    selectPoiRef.current = onSelectPoi
    selectRouteIndexRef.current = onSelectRouteIndex
    addPoiRef.current = onAddPoi
    movePoiRef.current = onMovePoi
    moveRoutePointRef.current = onMoveRoutePoint
    insertRoutePointRef.current = onInsertRoutePoint
    routePointsRef.current = document.route.pathGcj02
    poiRecordsRef.current = document.pois
  }, [
    document.pois,
    document.route.pathGcj02,
    mode,
    onAddPoi,
    onInsertRoutePoint,
    onMovePoi,
    onMoveRoutePoint,
    onSelectPoi,
    onSelectRouteIndex,
    selectedPoiId,
    selectedRouteIndex
  ])

  useEffect(() => {
    let disposed = false

    async function setup(): Promise<void> {
      if (!containerRef.current) {
        return
      }

      setLoadState('loading')
      setLoadError(null)

      try {
        const TMap = await loadTencentMap(tmapKey)

        if (disposed || !containerRef.current) {
          return
        }

        const map = new TMap.Map(containerRef.current, {
          center: new TMap.LatLng(center.lat, center.lng),
          zoom: 15.4,
          pitch: 0,
          rotation: 0,
          mapStyleId: 'style1'
        })

        const markerStyles = buildMarkerStyleMap(TMap)
        const polylineStyles = buildPolylineStyles(TMap)
        const poiMarkerLayer = new TMap.MultiMarker({
          map,
          styles: markerStyles,
          geometries: []
        })
        const routeVertexLayer = new TMap.MultiMarker({
          map,
          styles: markerStyles,
          geometries: []
        })
        const polylineLayer = new TMap.MultiPolyline({
          map,
          styles: polylineStyles,
          geometries: []
        })

        poiMarkerLayer.on('click', (event: any) => {
          ignoreNextMapClickRef.current = true
          const poiId = resolvePoiIdFromEvent(event, poiRecordsRef.current, 120)
          selectPoiRef.current(poiId)
          selectRouteIndexRef.current(null)
        })

        routeVertexLayer.on('click', (event: any) => {
          ignoreNextMapClickRef.current = true
          const rawId = String(
            event?.geometry?.properties?.routeIndex ??
              event?.geometry?.id ??
              ''
          )
          const routeIndex = Number(String(rawId).replace('route-vertex-', ''))

          if (!Number.isFinite(routeIndex)) {
            return
          }

          selectRouteIndexRef.current(routeIndex)
          selectPoiRef.current(null)
        })

        map.on('click', (event: any) => {
          if (ignoreNextMapClickRef.current) {
            ignoreNextMapClickRef.current = false
            return
          }

          const coordinate = getLatLng(event)
          if (!coordinate) {
            return
          }

          const nearPoiId = resolvePoiIdFromEvent(event, poiRecordsRef.current, 120)
          const nearRouteIndex = resolveRouteIndexByCoordinate(coordinate, routePointsRef.current, 40)

          if (modeRef.current === 'add-point') {
            addPoiRef.current(coordinate)
            return
          }

          if (modeRef.current === 'move-poi' && selectedPoiIdRef.current) {
            movePoiRef.current(selectedPoiIdRef.current, coordinate)
            return
          }

          if (modeRef.current === 'move-poi' && !selectedPoiIdRef.current && nearPoiId) {
            selectPoiRef.current(nearPoiId)
            selectRouteIndexRef.current(null)
            return
          }

          if (modeRef.current === 'move-route-point' && selectedRouteIndexRef.current !== null) {
            moveRoutePointRef.current(selectedRouteIndexRef.current, coordinate)
            return
          }

          if (modeRef.current === 'move-route-point' && selectedRouteIndexRef.current === null && nearRouteIndex !== null) {
            selectRouteIndexRef.current(nearRouteIndex)
            selectPoiRef.current(null)
            return
          }

          if (modeRef.current === 'insert-route-point') {
            let bestIndex = 0
            let bestDistance = Number.POSITIVE_INFINITY

            routePointsRef.current.forEach((point, index) => {
              if (index >= routePointsRef.current.length - 1) {
                return
              }

              const nextPoint = routePointsRef.current[index + 1]
              const distance = Math.hypot(point[0] - coordinate[0], point[1] - coordinate[1]) +
                Math.hypot(nextPoint[0] - coordinate[0], nextPoint[1] - coordinate[1])

              if (distance < bestDistance) {
                bestDistance = distance
                bestIndex = index
              }
            })

            insertRoutePointRef.current(bestIndex + 1, coordinate)
            return
          }

          if (nearPoiId) {
            selectPoiRef.current(nearPoiId)
            selectRouteIndexRef.current(null)
            return
          }

          if (nearRouteIndex !== null) {
            selectRouteIndexRef.current(nearRouteIndex)
            selectPoiRef.current(null)
            return
          }

          selectPoiRef.current(null)
          selectRouteIndexRef.current(null)
        })

        // --- Drag support via document-level pointer events ---
        // Marker mousedown does NOT propagate to map canvas (markers are DOM overlays),
        // so the map won't start panning. We track drag on document to avoid any conflict.

        function startDrag(
          dragType: 'poi' | 'route',
          markerId: string,
          startCoord: CoordinatePair,
          meta: { poiId?: string; routeIndex?: number },
          originalEvent: Event | undefined
        ): void {
          originalEvent?.preventDefault?.()
          originalEvent?.stopPropagation?.()

          const mapContainer = containerRef.current
          let moved = false
          let lastCoord = startCoord

          const onPointerMove = (moveEvent: PointerEvent): void => {
            if (!mapContainer) return
            const coord = screenToLatLng(map, mapContainer, moveEvent.clientX, moveEvent.clientY)
            if (!coord) return

            if (!moved) {
              if (haversineMeters(startCoord, coord) < 5) return
              moved = true
            }

            lastCoord = coord
            const pos = new TMap.LatLng(coord[1], coord[0])
            const layer = dragType === 'poi' ? poiMarkerLayer : routeVertexLayer
            layer.updateGeometries([{ id: markerId, position: pos }])
          }

          const onPointerUp = (): void => {
            document.removeEventListener('pointermove', onPointerMove)
            document.removeEventListener('pointerup', onPointerUp)

            if (!moved) return
            ignoreNextMapClickRef.current = true

            if (dragType === 'poi' && meta.poiId) {
              movePoiRef.current(meta.poiId, lastCoord)
            } else if (dragType === 'route' && meta.routeIndex !== undefined) {
              moveRoutePointRef.current(meta.routeIndex, lastCoord)
            }
          }

          document.addEventListener('pointermove', onPointerMove)
          document.addEventListener('pointerup', onPointerUp)
        }

        poiMarkerLayer.on('mousedown', (event: any) => {
          if (modeRef.current !== 'select') return
          const poiId = resolvePoiIdFromEvent(event, poiRecordsRef.current, 120)
          const coord = getLatLng(event)
          if (!poiId || !coord) return
          selectPoiRef.current(poiId)
          selectRouteIndexRef.current(null)
          ignoreNextMapClickRef.current = true
          startDrag('poi', poiId, coord, { poiId }, event.originalEvent)
        })

        routeVertexLayer.on('mousedown', (event: any) => {
          if (modeRef.current !== 'select') return
          const rawId = String(event?.geometry?.id ?? '')
          const routeIndex = Number(rawId.replace('route-vertex-', ''))
          const coord = getLatLng(event)
          if (!Number.isFinite(routeIndex) || !coord) return
          selectRouteIndexRef.current(routeIndex)
          selectPoiRef.current(null)
          ignoreNextMapClickRef.current = true
          startDrag('route', rawId, coord, { routeIndex }, event.originalEvent)
        })

        mapRef.current = map
        poiMarkerRef.current = poiMarkerLayer
        routeVertexRef.current = routeVertexLayer
        polylineRef.current = polylineLayer
        setLoadState('ready')
      } catch (error) {
        if (disposed) {
          return
        }

        setLoadState('error')
        setLoadError(error instanceof Error ? error.message : '腾讯地图加载失败。')
      }
    }

    setup().catch((error) => {
      setLoadState('error')
      setLoadError(error instanceof Error ? error.message : '腾讯地图加载失败。')
    })

    return () => {
      disposed = true

      if (poiMarkerRef.current) {
        poiMarkerRef.current.setMap?.(null)
        poiMarkerRef.current = null
      }

      if (routeVertexRef.current) {
        routeVertexRef.current.setMap?.(null)
        routeVertexRef.current = null
      }

      if (polylineRef.current) {
        polylineRef.current.setMap?.(null)
        polylineRef.current = null
      }

      if (mapRef.current) {
        mapRef.current.destroy?.()
        mapRef.current = null
      }
    }
  }, [center.lat, center.lng, tmapKey])

  useEffect(() => {
    const map = mapRef.current
    const poiMarkerLayer = poiMarkerRef.current
    const routeVertexLayer = routeVertexRef.current
    const polylineLayer = polylineRef.current
    const TMap = window.TMap

    if (!map || !poiMarkerLayer || !routeVertexLayer || !polylineLayer || !TMap) {
      return
    }

    polylineLayer.setGeometries([
      {
        id: 'route-shadow',
        styleId: 'routeShadow',
        paths: buildLatLngs(TMap, document.route.pathGcj02)
      },
      {
        id: 'route-main',
        styleId: 'routeMain',
        paths: buildLatLngs(TMap, document.route.pathGcj02)
      }
    ])

    poiMarkerLayer.setGeometries(
      document.pois.map((poi) => ({
        id: poi.id,
        styleId: poi.id === selectedPoiId ? `${poi.type}-active` : poi.type,
        position: new TMap.LatLng(poi.locationGcj02[1], poi.locationGcj02[0]),
        properties: {
          poiId: poi.id,
          name: poi.name
        }
      }))
    )

    const showRouteVertices =
      mode === 'select' ||
      mode === 'move-route-point' ||
      mode === 'insert-route-point' ||
      selectedRouteIndex !== null

    routeVertexLayer.setGeometries(
      showRouteVertices
        ? document.route.pathGcj02.map((point, index) => ({
            id: `route-vertex-${index}`,
            styleId: selectedRouteIndex === index ? 'routeVertex-active' : 'routeVertex',
            position: new TMap.LatLng(point[1], point[0]),
            properties: {
              routeIndex: index
            }
          }))
        : []
    )

    const selectedPoi = document.pois.find((poi) => poi.id === selectedPoiId)
    if (selectedPoi) {
      const selectedCenter = new TMap.LatLng(selectedPoi.locationGcj02[1], selectedPoi.locationGcj02[0])
      map.setCenter?.(selectedCenter)
    } else if (selectedRouteIndex !== null) {
      const point = document.route.pathGcj02[selectedRouteIndex]
      if (point) {
        map.setCenter?.(new TMap.LatLng(point[1], point[0]))
      }
    }
  }, [document, mode, selectedPoiId, selectedRouteIndex])

  useEffect(() => {
    const map = mapRef.current
    const TMap = window.TMap

    if (!map || !TMap) {
      return
    }

    if (selectedPoiId || selectedRouteIndex !== null) {
      return
    }

    tryFitBounds(TMap, map, document.route.pathGcj02)
  }, [document.route.pathGcj02, selectedPoiId, selectedRouteIndex])

  return (
    <section className="panel map-preview-panel">
      <div className="panel-header">
        <div>
          <h2>腾讯地图编辑视图</h2>
          <p>在这张图里直接选点、看轨迹、加点、移点和插入轨迹点。</p>
        </div>
      </div>

      <div className="tmap-shell">
        <div ref={containerRef} className="tmap-canvas" />

        {loadState === 'loading' ? (
          <div className="map-overlay-note">正在加载腾讯地图…</div>
        ) : null}

        {loadState === 'error' ? (
          <div className="map-overlay-note map-overlay-error">
            <strong>腾讯地图没有成功加载</strong>
            <span>{loadError}</span>
            <span>请确认 `.env.local` 的 `VITE_TMAP_KEY`、当前访问地址和腾讯控制台白名单一致。</span>
          </div>
        ) : null}

        {loadState === 'ready' ? (
          <div className="map-overlay-note map-overlay-mode">
            <strong>当前模式</strong>
            <span>{modeHint}</span>
          </div>
        ) : null}
      </div>
    </section>
  )
}
