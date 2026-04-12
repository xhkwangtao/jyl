import { useEffect, useMemo, useRef, useState } from 'react'
import SpatialEditor, { type EditorMode } from './components/SpatialEditor'
import TencentMapPanel, { type MapDiagnosticState } from './components/TencentMapPanel'
import { buildExportJson, buildExportWrapper, defaultJsFileName, defaultJsonFileName, downloadExportZip, downloadTextFile } from './lib/export'
import { gcj02ToWgs84, roundCoordinatePair } from './lib/geo'
import { createPoiAtGcj02, movePointOrder, recalculateDocument, replacePoi } from './lib/document'
import { parseKmzFile, releasePhotoUrls } from './lib/kmz'
import type { EditorDocument, PoiRecord, PoiType } from './types'

const POINT_TYPES: Array<{ value: PoiType; label: string }> = [
  { value: 'scenic', label: '景点' },
  { value: 'guide', label: '提示点' },
  { value: 'service', label: '服务点' },
  { value: 'junction', label: '岔路点' },
  { value: 'start', label: '起点' },
  { value: 'end', label: '终点' }
]

type PointFilter = 'all' | 'visible' | 'hidden' | 'photos'
type EditorSurface = 'tencent' | 'basic'

export default function App(): JSX.Element {
  const [documentState, setDocumentState] = useState<EditorDocument | null>(null)
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null)
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode>('select')
  const [pointFilter, setPointFilter] = useState<PointFilter>('all')
  const [searchText, setSearchText] = useState('')
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  const [statusText, setStatusText] = useState('等待导入 KMZ 文件')
  const [isImporting, setIsImporting] = useState(false)
  const [mapDiagnostic, setMapDiagnostic] = useState<MapDiagnosticState | null>(null)
  const [editorSurface, setEditorSurface] = useState<EditorSurface>('tencent')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const documentRef = useRef<EditorDocument | null>(null)

  useEffect(() => {
    documentRef.current = documentState
  }, [documentState])

  useEffect(() => {
    return () => {
      releasePhotoUrls(documentRef.current)
    }
  }, [])

  const orderedPois = documentState?.pois ?? []

  const filteredPois = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    return orderedPois.filter((poi) => {
      if (pointFilter === 'visible' && !poi.visible) {
        return false
      }

      if (pointFilter === 'hidden' && poi.visible) {
        return false
      }

      if (pointFilter === 'photos' && !poi.photos.length) {
        return false
      }

      if (!keyword) {
        return true
      }

      const haystack = [poi.name, poi.sourceName, poi.themeTag, poi.description].join(' ').toLowerCase()
      return haystack.includes(keyword)
    })
  }, [orderedPois, pointFilter, searchText])

  const selectedPoi = useMemo(
    () => orderedPois.find((poi) => poi.id === selectedPoiId) ?? null,
    [orderedPois, selectedPoiId]
  )
  const selectedPoiIndex = useMemo(
    () => orderedPois.findIndex((poi) => poi.id === selectedPoiId),
    [orderedPois, selectedPoiId]
  )

  useEffect(() => {
    setSelectedPhotoIndex(0)
  }, [selectedPoiId])

  useEffect(() => {
    if (mapDiagnostic?.loadState === 'error') {
      setEditorSurface('basic')
    }
  }, [mapDiagnostic?.loadState])

  function replaceDocument(nextDocument: EditorDocument | null): void {
    setDocumentState((current) => {
      if (current && current !== nextDocument) {
        releasePhotoUrls(current)
      }
      return nextDocument
    })
  }

  async function handleFileImport(file: File): Promise<void> {
    setIsImporting(true)
    setStatusText(`正在解析 ${file.name}`)

    try {
      const imported = await parseKmzFile(file)
      replaceDocument(imported)
      setSelectedPoiId(imported.pois.find((poi) => poi.photos.length)?.id ?? imported.pois[0]?.id ?? null)
      setSelectedRouteIndex(null)
      setEditorMode('select')
      setEditorSurface('tencent')
      setPointFilter('all')
      setSearchText('')
      setStatusText(`已导入 ${file.name}，共 ${imported.pois.length} 个点位`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入失败'
      setStatusText(message)
    } finally {
      setIsImporting(false)
    }
  }

  function updateDocument(updater: (current: EditorDocument) => EditorDocument): void {
    setDocumentState((current) => {
      if (!current) {
        return current
      }

      return updater(current)
    })
  }

  function handlePoiFieldChange<Key extends keyof PoiRecord>(field: Key, value: PoiRecord[Key]): void {
    if (!documentState || !selectedPoiId) {
      return
    }

    updateDocument((current) =>
      replacePoi(
        current,
        selectedPoiId,
        (poi) => ({
          ...poi,
          [field]: value
        }),
        { syncSortWithRoute: false }
      )
    )
  }

  function handlePoiCoordinateMove(poiId: string, locationGcj02: [number, number]): void {
    updateDocument((current) =>
      replacePoi(current, poiId, (poi) => ({
        ...poi,
        locationGcj02: roundCoordinatePair(locationGcj02),
        locationWgs84: roundCoordinatePair(gcj02ToWgs84(...locationGcj02))
      }))
    )
    setEditorMode('select')
  }

  function handleRoutePointMove(index: number, locationGcj02: [number, number]): void {
    updateDocument((current) => {
      const pathWgs84 = [...current.route.pathWgs84]
      pathWgs84[index] = roundCoordinatePair(gcj02ToWgs84(...locationGcj02))
      return recalculateDocument(
        {
          ...current,
          route: {
            ...current.route,
            pathWgs84
          }
        },
        { syncSortWithRoute: true }
      )
    })
    setEditorMode('select')
  }

  function handleInsertRoutePoint(index: number, locationGcj02: [number, number]): void {
    updateDocument((current) => {
      const pathWgs84 = [...current.route.pathWgs84]
      pathWgs84.splice(index, 0, roundCoordinatePair(gcj02ToWgs84(...locationGcj02)))
      setSelectedRouteIndex(index)

      return recalculateDocument(
        {
          ...current,
          route: {
            ...current.route,
            pathWgs84
          }
        },
        { syncSortWithRoute: true }
      )
    })
    setEditorMode('select')
  }

  function handleAddPoi(locationGcj02: [number, number]): void {
    updateDocument((current) => {
      const poi = createPoiAtGcj02(current, locationGcj02)
      setSelectedPoiId(poi.id)
      setSelectedRouteIndex(null)
      setEditorMode('select')

      return recalculateDocument(
        {
          ...current,
          pois: [...current.pois, poi]
        },
        { syncSortWithRoute: true }
      )
    })
    setEditorMode('select')
  }

  function handleDeleteSelectedPoi(): void {
    if (!selectedPoiId) {
      return
    }

    updateDocument((current) => {
      const nextPois = current.pois.filter((poi) => poi.id !== selectedPoiId)
      setSelectedPoiId(nextPois[0]?.id ?? null)

      return recalculateDocument(
        {
          ...current,
          pois: nextPois
        },
        { syncSortWithRoute: false }
      )
    })
  }

  function handleDeleteSelectedRoutePoint(): void {
    if (selectedRouteIndex === null) {
      return
    }

    updateDocument((current) => {
      if (current.route.pathWgs84.length <= 2) {
        return current
      }

      const pathWgs84 = current.route.pathWgs84.filter((_, index) => index !== selectedRouteIndex)
      const nextIndex = Math.min(selectedRouteIndex, pathWgs84.length - 1)
      setSelectedRouteIndex(pathWgs84.length ? nextIndex : null)

      return recalculateDocument(
        {
          ...current,
          route: {
            ...current.route,
            pathWgs84
          }
        },
        { syncSortWithRoute: true }
      )
    })
  }

  function handleExportJson(): void {
    if (!documentState) {
      return
    }

    downloadTextFile(buildExportJson(documentState), defaultJsonFileName(documentState), 'application/json')
  }

  function handleExportJs(): void {
    if (!documentState) {
      return
    }

    downloadTextFile(buildExportWrapper(documentState), defaultJsFileName(documentState), 'application/javascript')
  }

  async function handleExportZip(): Promise<void> {
    if (!documentState) {
      return
    }

    await downloadExportZip(documentState)
  }

  function handleSelectPoiByOffset(offset: number): void {
    if (!orderedPois.length) {
      return
    }

    const baseIndex = selectedPoiIndex >= 0 ? selectedPoiIndex : 0
    const nextIndex = Math.max(0, Math.min(baseIndex + offset, orderedPois.length - 1))
    const nextPoi = orderedPois[nextIndex]

    if (!nextPoi) {
      return
    }

    setSelectedPoiId(nextPoi.id)
    setSelectedRouteIndex(null)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="hero-copy">
          <p className="eyebrow">Jiuyanlou Scenic Editor</p>
          <h1>轨迹与照片地图编辑器</h1>
          <p className="hero-description">
            把 KMZ 里的轨迹和标注点照片直接放到一个网页里，边看图边改名字，边拖点边修路线，最后导出给小程序继续用。
          </p>
        </div>

        <div className="hero-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? '正在导入…' : '导入 KMZ'}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={handleExportJson}
            disabled={!documentState}
          >
            导出 JSON
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={handleExportJs}
            disabled={!documentState}
          >
            导出 JS 包装
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              void handleExportZip()
            }}
            disabled={!documentState}
          >
            导出图片包
          </button>
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept=".kmz"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                void handleFileImport(file)
              }
              event.target.value = ''
            }}
          />
        </div>
      </header>

      <section className="status-strip">
        <div>
          <strong>当前状态：</strong>
          <span>{statusText}</span>
        </div>
        <div className="status-hints">
          <span>当前主编辑区已经改为腾讯地图底图，坐标直接输出 GCJ-02。</span>
          <span>若腾讯底图不显示，优先检查 Web Key、白名单和本地访问地址是否一致。</span>
        </div>
      </section>

      {documentState ? (
        <>
          <section className="stats-grid">
            <article className="stat-card">
              <span>轨迹点</span>
              <strong>{documentState.route.pathGcj02.length}</strong>
            </article>
            <article className="stat-card">
              <span>点位总数</span>
              <strong>{documentState.poiSummary.totalCount}</strong>
            </article>
            <article className="stat-card">
              <span>公开点位</span>
              <strong>{documentState.poiSummary.cardCount}</strong>
            </article>
            <article className="stat-card">
              <span>隐藏触发点</span>
              <strong>{documentState.poiSummary.hiddenTriggerCount}</strong>
            </article>
            <article className="stat-card wide">
              <span>导入警告</span>
              <strong>{documentState.editorMeta.warnings.length}</strong>
              <small>大多是“图片点没有原始名称”，可直接在右侧改。</small>
            </article>
          </section>

          <section className="workspace">
            <div className="workspace-main">
              <div className="mode-switch">
                <button
                  className={editorMode === 'select' ? 'mode-chip mode-chip-active' : 'mode-chip'}
                  type="button"
                  onClick={() => setEditorMode('select')}
                >
                  选择
                </button>
                <button
                  className={editorMode === 'add-point' ? 'mode-chip mode-chip-active' : 'mode-chip'}
                  type="button"
                  onClick={() => setEditorMode('add-point')}
                >
                  地图点一下添加景点
                </button>
                <button
                  className={editorMode === 'move-poi' ? 'mode-chip mode-chip-active' : 'mode-chip'}
                  type="button"
                  onClick={() => setEditorMode('move-poi')}
                  disabled={!selectedPoiId}
                >
                  移动选中景点
                </button>
                <button
                  className={editorMode === 'insert-route-point' ? 'mode-chip mode-chip-active' : 'mode-chip'}
                  type="button"
                  onClick={() => setEditorMode('insert-route-point')}
                >
                  地图点一下插入轨迹点
                </button>
                <button
                  className={editorMode === 'move-route-point' ? 'mode-chip mode-chip-active' : 'mode-chip'}
                  type="button"
                  onClick={() => setEditorMode('move-route-point')}
                >
                  选轨迹点并移动
                </button>
                <button
                  className="mode-chip danger-chip"
                  type="button"
                  onClick={handleDeleteSelectedRoutePoint}
                  disabled={selectedRouteIndex === null}
                >
                  删除选中轨迹点
                </button>
              </div>

              <div className="surface-switch">
                <button
                  className={editorSurface === 'tencent' ? 'mode-chip mode-chip-active' : 'mode-chip'}
                  type="button"
                  onClick={() => setEditorSurface('tencent')}
                >
                  腾讯地图
                </button>
                <button
                  className={editorSurface === 'basic' ? 'mode-chip mode-chip-active' : 'mode-chip'}
                  type="button"
                  onClick={() => setEditorSurface('basic')}
                >
                  基础编辑
                </button>
                <span className="surface-hint">
                  {editorSurface === 'tencent'
                    ? '适合对照真实底图调整位置。'
                    : '不依赖腾讯底图，适合在网络或鉴权异常时继续改点。'}
                </span>
              </div>

              {editorSurface === 'tencent' ? (
                <TencentMapPanel
                  document={documentState}
                  selectedPoiId={selectedPoiId}
                  selectedRouteIndex={selectedRouteIndex}
                  mode={editorMode}
                  onSelectPoi={(poiId) => {
                    setSelectedPoiId(poiId)
                  }}
                  onSelectRouteIndex={(routeIndex) => {
                    setSelectedRouteIndex(routeIndex)
                  }}
                  onAddPoi={handleAddPoi}
                  onMovePoi={handlePoiCoordinateMove}
                  onMoveRoutePoint={handleRoutePointMove}
                  onInsertRoutePoint={handleInsertRoutePoint}
                  onDiagnosticChange={setMapDiagnostic}
                />
              ) : (
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>基础编辑视图</h2>
                      <p>这里不依赖腾讯底图，可直接拖动点位和轨迹点继续编辑。</p>
                    </div>
                  </div>
                  <SpatialEditor
                    document={documentState}
                    pois={documentState.pois}
                    selectedPoiId={selectedPoiId}
                    selectedRouteIndex={selectedRouteIndex}
                    mode={editorMode}
                    onSelectPoi={(poiId) => {
                      setSelectedPoiId(poiId)
                    }}
                    onSelectRouteIndex={(routeIndex) => {
                      setSelectedRouteIndex(routeIndex)
                    }}
                    onAddPoi={handleAddPoi}
                    onMovePoi={handlePoiCoordinateMove}
                    onMoveRoutePoint={handleRoutePointMove}
                    onInsertRoutePoint={handleInsertRoutePoint}
                  />
                </section>
              )}

              {mapDiagnostic ? (
                <section className="panel diagnostic-panel">
                  <div className="panel-header">
                    <div>
                      <h2>地图诊断面板</h2>
                      <p>这里显示当前网页地图接入是否真正成功。</p>
                    </div>
                  </div>

                  <div className="diagnostic-grid">
                    <div className="diagnostic-item">
                      <span>当前访问地址</span>
                      <strong>{mapDiagnostic.currentHost || '未知'}</strong>
                    </div>
                    <div className="diagnostic-item">
                      <span>是否读取到 Key</span>
                      <strong>{mapDiagnostic.keyPresent ? '是' : '否'}</strong>
                    </div>
                    <div className="diagnostic-item">
                      <span>Key 预览</span>
                      <strong>{mapDiagnostic.keyPreview}</strong>
                    </div>
                    <div className="diagnostic-item">
                      <span>加载状态</span>
                      <strong>{mapDiagnostic.loadState}</strong>
                    </div>
                    <div className="diagnostic-item">
                      <span>TMap 对象</span>
                      <strong>{mapDiagnostic.tmapObjectReady ? '已就绪' : '未就绪'}</strong>
                    </div>
                    <div className="diagnostic-item">
                      <span>地图实例</span>
                      <strong>{mapDiagnostic.mapInstanceReady ? '已创建' : '未创建'}</strong>
                    </div>
                    <div className="diagnostic-item">
                      <span>景点图层</span>
                      <strong>{mapDiagnostic.poiLayerReady ? '已创建' : '未创建'}</strong>
                    </div>
                    <div className="diagnostic-item">
                      <span>轨迹图层</span>
                      <strong>{mapDiagnostic.routeLayerReady ? '已创建' : '未创建'}</strong>
                    </div>
                    <div className="diagnostic-item">
                      <span>轨迹点图层</span>
                      <strong>{mapDiagnostic.routeVertexLayerReady ? '已创建' : '未创建'}</strong>
                    </div>
                    <div className="diagnostic-item">
                      <span>景点数量</span>
                      <strong>{mapDiagnostic.poiCount}</strong>
                    </div>
                    <div className="diagnostic-item">
                      <span>轨迹点数量</span>
                      <strong>{mapDiagnostic.routePointCount}</strong>
                    </div>
                    <div className="diagnostic-item">
                      <span>当前模式</span>
                      <strong>{mapDiagnostic.mode}</strong>
                    </div>
                    <div className="diagnostic-item">
                      <span>选中景点</span>
                      <strong>{mapDiagnostic.selectedPoiId || '无'}</strong>
                    </div>
                    <div className="diagnostic-item">
                      <span>选中轨迹点</span>
                      <strong>{mapDiagnostic.selectedRouteIndex === null ? '无' : mapDiagnostic.selectedRouteIndex + 1}</strong>
                    </div>
                    <div className="diagnostic-item diagnostic-item-wide">
                      <span>错误信息</span>
                      <strong>{mapDiagnostic.loadError || '无'}</strong>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="workspace-sidebar">
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>点位列表</h2>
                    <p>按当前展示顺序查看和筛选景点、提示点与隐藏点。</p>
                  </div>
                </div>
                <div className="list-toolbar">
                  <input
                    className="search-input"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="搜索名称、来源名或描述"
                  />
                  <div className="filter-row">
                    {([
                      ['all', '全部'],
                      ['visible', '公开'],
                      ['hidden', '隐藏'],
                      ['photos', '有照片']
                    ] as Array<[PointFilter, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        className={pointFilter === value ? 'filter-chip filter-chip-active' : 'filter-chip'}
                        type="button"
                        onClick={() => setPointFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="poi-list">
                  {filteredPois.map((poi) => (
                    <button
                      key={poi.id}
                      className={poi.id === selectedPoiId ? 'poi-row poi-row-active' : 'poi-row'}
                      type="button"
                      onClick={() => {
                        setSelectedPoiId(poi.id)
                        setSelectedRouteIndex(null)
                      }}
                    >
                      <div className="poi-row-main">
                        <strong>{poi.name}</strong>
                        <span>{poi.sequenceText || poi.themeTag}</span>
                      </div>
                      <div className="poi-row-meta">
                        <span>{poi.type}</span>
                        <span>{poi.photos.length ? `${poi.photos.length} 张图` : '无图'}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel inspector-panel">
                <div className="panel-header">
                  <div>
                    <h2>点位编辑</h2>
                    <p>如果地图上不好点，直接在这里选中点位并编辑。</p>
                  </div>
                </div>

                {orderedPois.length ? (
                  <div className="manual-selector">
                    <div className="manual-selector-head">
                      <div>
                        <strong>不用点地图，直接在这里切换点位</strong>
                        <span>下方表单会跟着当前点位立即切换，可直接改名称、类型和文案。</span>
                      </div>
                      <div className="selector-pill">
                        {selectedPoiIndex >= 0 ? `第 ${selectedPoiIndex + 1} / ${orderedPois.length} 个` : `共 ${orderedPois.length} 个`}
                      </div>
                    </div>

                    <label className="field field-wide">
                      <span>选择要编辑的点位</span>
                      <select
                        value={selectedPoiId ?? ''}
                        onChange={(event) => {
                          const nextId = event.target.value || null
                          setSelectedPoiId(nextId)
                          setSelectedRouteIndex(null)
                        }}
                      >
                        {orderedPois.map((poi) => (
                          <option key={poi.id} value={poi.id}>
                            {poi.orderText ? `${poi.orderText} · ` : ''}
                            {poi.name}
                            {poi.photos.length ? ` · ${poi.photos.length}张图` : ' · 无图'}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="manual-selector-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => handleSelectPoiByOffset(-1)}
                        disabled={!orderedPois.length || selectedPoiIndex <= 0}
                      >
                        上一个点位
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => handleSelectPoiByOffset(1)}
                        disabled={!orderedPois.length || selectedPoiIndex >= orderedPois.length - 1}
                      >
                        下一个点位
                      </button>
                    </div>
                  </div>
                ) : null}

                {selectedPoi ? (
                  <>
                    <div className="photo-panel">
                      {selectedPoi.photos.length ? (
                        <>
                          <div className="photo-preview-shell">
                            <img
                              className="photo-preview"
                              src={selectedPoi.photos[Math.min(selectedPhotoIndex, selectedPoi.photos.length - 1)]?.previewUrl}
                              alt={selectedPoi.name}
                            />
                          </div>
                          <div className="photo-strip">
                            {selectedPoi.photos.map((photo, index) => (
                              <button
                                key={photo.id}
                                className={index === selectedPhotoIndex ? 'thumb-button thumb-button-active' : 'thumb-button'}
                                type="button"
                                onClick={() => setSelectedPhotoIndex(index)}
                              >
                                <img src={photo.previewUrl} alt={photo.name} />
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="empty-photo">
                          <strong>这个点没有照片</strong>
                          <span>可以先按轨迹位置命名，后续再决定是否保留。</span>
                        </div>
                      )}
                    </div>

                    <div className="form-grid">
                      <label className="field">
                        <span>景点名称</span>
                        <input
                          value={selectedPoi.name}
                          onChange={(event) => handlePoiFieldChange('name', event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>来源名称</span>
                        <input
                          value={selectedPoi.sourceName}
                          onChange={(event) => handlePoiFieldChange('sourceName', event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>点位类型</span>
                        <select
                          value={selectedPoi.type}
                          onChange={(event) => handlePoiFieldChange('type', event.target.value as PoiType)}
                        >
                          {POINT_TYPES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>标签</span>
                        <input
                          value={selectedPoi.themeTag}
                          onChange={(event) => handlePoiFieldChange('themeTag', event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>色调</span>
                        <input
                          value={selectedPoi.themeTone}
                          onChange={(event) => handlePoiFieldChange('themeTone', event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>触发半径（米）</span>
                        <input
                          type="number"
                          value={selectedPoi.triggerRadiusM}
                          onChange={(event) => handlePoiFieldChange('triggerRadiusM', Number(event.target.value) || 0)}
                        />
                      </label>
                      <label className="field field-wide">
                        <span>短提示</span>
                        <input
                          value={selectedPoi.shortHint}
                          onChange={(event) => handlePoiFieldChange('shortHint', event.target.value)}
                        />
                      </label>
                      <label className="field field-wide">
                        <span>景点描述</span>
                        <textarea
                          rows={3}
                          value={selectedPoi.description}
                          onChange={(event) => handlePoiFieldChange('description', event.target.value)}
                        />
                      </label>
                      <label className="field field-wide">
                        <span>停留建议</span>
                        <input
                          value={selectedPoi.stayText}
                          onChange={(event) => handlePoiFieldChange('stayText', event.target.value)}
                        />
                      </label>
                      <label className="field field-wide">
                        <span>场景线索</span>
                        <textarea
                          rows={2}
                          value={selectedPoi.sceneLine}
                          onChange={(event) => handlePoiFieldChange('sceneLine', event.target.value)}
                        />
                      </label>
                      <label className="field field-wide">
                        <span>导览提醒</span>
                        <textarea
                          rows={2}
                          value={selectedPoi.guideTip}
                          onChange={(event) => handlePoiFieldChange('guideTip', event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="toggle-grid">
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={selectedPoi.visible}
                          onChange={(event) => handlePoiFieldChange('visible', event.target.checked)}
                        />
                        <span>在地图公开显示</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={selectedPoi.cardVisible}
                          onChange={(event) => handlePoiFieldChange('cardVisible', event.target.checked)}
                        />
                        <span>出现在停留卡片里</span>
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={selectedPoi.checkinVisible}
                          onChange={(event) => handlePoiFieldChange('checkinVisible', event.target.checked)}
                        />
                        <span>允许小程序打卡</span>
                      </label>
                    </div>

                    <div className="coordinate-panel">
                      <div>
                        <span>GCJ-02</span>
                        <strong>
                          {selectedPoi.locationGcj02[0].toFixed(6)}, {selectedPoi.locationGcj02[1].toFixed(6)}
                        </strong>
                      </div>
                      <div>
                        <span>WGS84</span>
                        <strong>
                          {selectedPoi.locationWgs84[0].toFixed(6)}, {selectedPoi.locationWgs84[1].toFixed(6)}
                        </strong>
                      </div>
                    </div>

                    <div className="panel-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => updateDocument((current) => movePointOrder(current, selectedPoi.id, -1))}
                      >
                        上移
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => updateDocument((current) => movePointOrder(current, selectedPoi.id, 1))}
                      >
                        下移
                      </button>
                      <button className="danger-button" type="button" onClick={handleDeleteSelectedPoi}>
                        删除点位
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="empty-inspector">
                    {selectedRouteIndex !== null ? (
                      <>
                        <strong>当前选中的是轨迹点 {selectedRouteIndex + 1}</strong>
                        <span>你可以在左侧顶部点击“移动选中轨迹点”或“删除选中轨迹点”。如果要编辑景点名称，请改为点选景点标注。</span>
                      </>
                    ) : (
                      <>
                        <strong>还没有选中点位</strong>
                        <span>从左侧列表或地图上点一个景点标注，就能开始看图和改名称。</span>
                      </>
                    )}
                  </div>
                )}
              </section>
            </aside>
          </section>
        </>
      ) : (
        <section className="empty-state">
          <div className="empty-card">
            <h2>先导入一个 KMZ</h2>
            <p>
              这个编辑器会读取轨迹、标注点和打包在 KMZ 里的照片。导入后，你就可以直接拖动点位、改路线、看图命名景点，并导出给小程序继续使用。
            </p>
            <button className="primary-button" type="button" onClick={() => fileInputRef.current?.click()}>
              选择 KMZ 文件
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
