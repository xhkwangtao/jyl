import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import type { CoordinatePair, EditorDocument, PoiRecord } from '../types'
import { projectToMeters, unprojectFromMeters } from '../lib/geo'

export type EditorMode =
  | 'select'
  | 'add-point'
  | 'move-poi'
  | 'move-route-point'
  | 'insert-route-point'

interface SpatialEditorProps {
  document: EditorDocument
  pois: PoiRecord[]
  selectedPoiId: string | null
  selectedRouteIndex: number | null
  mode: EditorMode
  onSelectPoi: (poiId: string | null) => void
  onSelectRouteIndex: (index: number | null) => void
  onAddPoi: (locationGcj02: CoordinatePair) => void
  onMovePoi: (poiId: string, locationGcj02: CoordinatePair) => void
  onMoveRoutePoint: (index: number, locationGcj02: CoordinatePair) => void
  onInsertRoutePoint: (index: number, locationGcj02: CoordinatePair) => void
}

interface WorldPoint {
  longitude: number
  latitude: number
  x: number
  y: number
}

interface ViewBoxState {
  x: number
  y: number
  width: number
  height: number
}

interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

type DragState =
  | { type: 'pan'; startX: number; startY: number; viewBox: ViewBoxState }
  | { type: 'poi'; poiId: string }
  | { type: 'route'; routeIndex: number }

const WORLD_PADDING = 60

function colorForType(type: PoiRecord['type']): string {
  switch (type) {
    case 'start':
      return '#2b6f5f'
    case 'end':
      return '#7d5d54'
    case 'service':
      return '#1f7a8c'
    case 'guide':
      return '#9d7e2e'
    case 'junction':
      return '#8b4f8a'
    case 'scenic':
    default:
      return '#cf6f3c'
  }
}

function distanceToSegment(point: { x: number; y: number }, start: WorldPoint, end: WorldPoint): number {
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  const projectionX = start.x + t * dx
  const projectionY = start.y + t * dy

  return Math.hypot(point.x - projectionX, point.y - projectionY)
}

function buildBounds(points: WorldPoint[]): Bounds {
  if (!points.length) {
    return {
      minX: -100,
      maxX: 100,
      minY: -100,
      maxY: 100
    }
  }

  return points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y)
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    }
  )
}

function paddedViewBox(bounds: Bounds): ViewBoxState {
  const width = Math.max(bounds.maxX - bounds.minX, 160)
  const height = Math.max(bounds.maxY - bounds.minY, 160)

  return {
    x: bounds.minX - WORLD_PADDING,
    y: bounds.minY - WORLD_PADDING,
    width: width + WORLD_PADDING * 2,
    height: height + WORLD_PADDING * 2
  }
}

function buildGridLines(viewBox: ViewBoxState): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const size = Math.max(viewBox.width, viewBox.height)
  const step = size > 5000 ? 500 : size > 2000 ? 200 : 100
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = []

  const startX = Math.floor(viewBox.x / step) * step
  const endX = Math.ceil((viewBox.x + viewBox.width) / step) * step
  for (let x = startX; x <= endX; x += step) {
    lines.push({ x1: x, y1: viewBox.y, x2: x, y2: viewBox.y + viewBox.height })
  }

  const startY = Math.floor(viewBox.y / step) * step
  const endY = Math.ceil((viewBox.y + viewBox.height) / step) * step
  for (let y = startY; y <= endY; y += step) {
    lines.push({ x1: viewBox.x, y1: y, x2: viewBox.x + viewBox.width, y2: y })
  }

  return lines
}

export default function SpatialEditor({
  document,
  pois,
  selectedPoiId,
  selectedRouteIndex,
  mode,
  onSelectPoi,
  onSelectRouteIndex,
  onAddPoi,
  onMovePoi,
  onMoveRoutePoint,
  onInsertRoutePoint
}: SpatialEditorProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [viewBox, setViewBox] = useState<ViewBoxState>({
    x: 0,
    y: 0,
    width: 1000,
    height: 1000
  })

  const origin = document.route.pathGcj02[0] ?? [116.49, 40.49]

  const routeWorld = useMemo(
    () =>
      document.route.pathGcj02.map(([longitude, latitude]) => {
        const point = projectToMeters([longitude, latitude], origin)
        return { longitude, latitude, x: point.x, y: point.y }
      }),
    [document.route.pathGcj02, origin]
  )

  const poiWorld = useMemo(
    () =>
      pois.map((poi) => {
        const [longitude, latitude] = poi.locationGcj02
        const point = projectToMeters([longitude, latitude], origin)
        return {
          poi,
          longitude,
          latitude,
          x: point.x,
          y: point.y
        }
      }),
    [origin, pois]
  )

  const allWorldBounds = useMemo(() => buildBounds([...routeWorld, ...poiWorld]), [poiWorld, routeWorld])

  useEffect(() => {
    setViewBox(paddedViewBox(allWorldBounds))
  }, [allWorldBounds.maxX, allWorldBounds.maxY, allWorldBounds.minX, allWorldBounds.minY])

  const gridLines = useMemo(() => buildGridLines(viewBox), [viewBox])

  const routePath = useMemo(
    () => routeWorld.map((point) => `${point.x},${point.y}`).join(' '),
    [routeWorld]
  )

  function clientPointToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = svgRef.current
    if (!svg) {
      return null
    }

    const rect = svg.getBoundingClientRect()
    if (!rect.width || !rect.height) {
      return null
    }

    const x = viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width
    const y = viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height

    return { x, y }
  }

  function worldToGcj02(worldPoint: { x: number; y: number }): CoordinatePair {
    return unprojectFromMeters(worldPoint, origin)
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    if (!dragRef.current) {
      return
    }

    const world = clientPointToWorld(event.clientX, event.clientY)
    if (!world) {
      return
    }

    const dragState = dragRef.current

    if (dragState.type === 'pan') {
      const svg = svgRef.current
      if (!svg) {
        return
      }

      const rect = svg.getBoundingClientRect()
      const deltaX = ((event.clientX - dragState.startX) / rect.width) * dragState.viewBox.width
      const deltaY = ((event.clientY - dragState.startY) / rect.height) * dragState.viewBox.height

      setViewBox({
        ...dragState.viewBox,
        x: dragState.viewBox.x - deltaX,
        y: dragState.viewBox.y - deltaY
      })
      return
    }

    const nextCoordinate = worldToGcj02(world)

    if (dragState.type === 'poi') {
      onMovePoi(dragState.poiId, nextCoordinate)
      return
    }

    onMoveRoutePoint(dragState.routeIndex, nextCoordinate)
  }

  function handlePointerUp(): void {
    dragRef.current = null
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<SVGSVGElement>): void {
    if (event.target !== event.currentTarget) {
      return
    }

    if (mode !== 'select') {
      return
    }

    dragRef.current = {
      type: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      viewBox
    }
  }

  function handleCanvasClick(event: ReactMouseEvent<SVGSVGElement>): void {
    if (event.target !== event.currentTarget) {
      return
    }

    const world = clientPointToWorld(event.clientX, event.clientY)
    if (!world) {
      return
    }

    if (mode === 'add-point') {
      onAddPoi(worldToGcj02(world))
      return
    }

    if (mode === 'insert-route-point') {
      let bestIndex = 0
      let bestDistance = Number.POSITIVE_INFINITY

      for (let index = 0; index < routeWorld.length - 1; index += 1) {
        const distance = distanceToSegment(world, routeWorld[index], routeWorld[index + 1])
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = index
        }
      }

      onInsertRoutePoint(bestIndex + 1, worldToGcj02(world))
      return
    }

    onSelectPoi(null)
    onSelectRouteIndex(null)
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>): void {
    event.preventDefault()
    const world = clientPointToWorld(event.clientX, event.clientY)
    if (!world) {
      return
    }

    const scale = event.deltaY > 0 ? 1.12 : 0.88
    const nextWidth = Math.max(80, viewBox.width * scale)
    const nextHeight = Math.max(80, viewBox.height * scale)
    const ratioX = (world.x - viewBox.x) / viewBox.width
    const ratioY = (world.y - viewBox.y) / viewBox.height

    setViewBox({
      x: world.x - ratioX * nextWidth,
      y: world.y - ratioY * nextHeight,
      width: nextWidth,
      height: nextHeight
    })
  }

  return (
    <div className="editor-stage">
      <div className="stage-toolbar">
        <div>
          <strong>编辑视图</strong>
          <span> 坐标已统一到 GCJ-02，可直接对照小程序地图。</span>
        </div>
        <button
          className="ghost-button"
          type="button"
          onClick={() => setViewBox(paddedViewBox(allWorldBounds))}
        >
          重新适配视野
        </button>
      </div>

      <svg
        ref={svgRef}
        className="editor-svg"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={handleCanvasClick}
        onWheel={handleWheel}
      >
        <defs>
          <linearGradient id="stageGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f8f0db" />
            <stop offset="100%" stopColor="#e6ecdf" />
          </linearGradient>
        </defs>

        <rect
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.width}
          height={viewBox.height}
          fill="url(#stageGradient)"
          rx={24}
        />

        {gridLines.map((line, index) => (
          <line
            key={`grid-${index}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="rgba(34, 55, 43, 0.12)"
            strokeWidth={2}
          />
        ))}

        <polyline
          points={routePath}
          fill="none"
          stroke="#f4faf7"
          strokeWidth={16}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={routePath}
          fill="none"
          stroke="#245f6d"
          strokeWidth={8}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {routeWorld.map((point, index) => (
          <g key={`route-point-${index}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r={selectedRouteIndex === index ? 16 : 11}
              fill={selectedRouteIndex === index ? '#d4612e' : '#ffe8b8'}
              stroke="#17343d"
              strokeWidth={selectedRouteIndex === index ? 4 : 3}
              onPointerDown={(event) => {
                event.stopPropagation()
                dragRef.current = { type: 'route', routeIndex: index }
                onSelectRouteIndex(index)
                onSelectPoi(null)
              }}
            />
            {selectedRouteIndex === index ? (
              <text
                x={point.x}
                y={point.y - 22}
                textAnchor="middle"
                className="route-vertex-label"
              >
                轨迹点 {index + 1}
              </text>
            ) : null}
          </g>
        ))}

        {poiWorld.map(({ poi, x, y }) => {
          const selected = poi.id === selectedPoiId

          return (
            <g key={poi.id}>
              <circle
                cx={x}
                cy={y}
                r={selected ? 22 : 16}
                fill={colorForType(poi.type)}
                stroke={selected ? '#fff7e8' : '#17343d'}
                strokeWidth={selected ? 6 : 4}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  dragRef.current = { type: 'poi', poiId: poi.id }
                  onSelectPoi(poi.id)
                  onSelectRouteIndex(null)
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelectPoi(poi.id)
                  onSelectRouteIndex(null)
                }}
              />
              <text x={x} y={y + 5} textAnchor="middle" className="poi-dot-label">
                {poi.orderText || '•'}
              </text>
              <text
                x={x}
                y={y - (selected ? 32 : 25)}
                textAnchor="middle"
                className={selected ? 'poi-caption poi-caption-active' : 'poi-caption'}
              >
                {poi.name}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="stage-legend">
        <span>滚轮缩放</span>
        <span>拖动画布平移</span>
        <span>拖动圆点可改轨迹和景点位置</span>
      </div>
    </div>
  )
}
