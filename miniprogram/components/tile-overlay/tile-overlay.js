const { getZoomConfig } = require('./zoom-adaptive-config')

const DEFAULT_LOCAL_TILE_CACHE_DIR = 'jyl-ground-tiles'
const TILE_SOURCE_PREPARE_CONCURRENCY = 6
const TILE_OVERLAY_MAX_CONCURRENT_LOADS = 4
const TILE_OVERLAY_RETRY_LIMIT = 2
const TILE_OVERLAY_RETRY_DELAY_MS = 120
const TILE_PREFETCH_CONCURRENCY = 2
const TILE_PREFETCH_DELAY_MS = 80
const TILE_PREFETCH_ZOOM_OFFSETS = [1, -1]
const TILE_PREFETCH_MAX_TILES_PER_ZOOM = 18
const TILE_PREFETCH_MAX_TILES_PER_RING = 24
const TILE_PREFETCH_SAME_ZOOM_RING_MULTIPLIERS = [0.4, 0.8]
const TILE_PREFETCH_SAME_ZOOM_MAX_BUFFER_RATIO = 0.18
const TILE_RETENTION_BUFFER_MULTIPLIER = 2
const TILE_RETENTION_MAX_BUFFER_RATIO = 0.45
const TILE_OVERLAY_CACHE_SIZE_MULTIPLIER = 2.2
const TILE_OVERLAY_CACHE_MIN_SIZE = 96
const TILE_OVERLAY_CACHE_MAX_SIZE = 280

const DEFAULT_TILE_CONFIG = {
  packageRoots: [],
  zoomBaseUrlMap: null,
  tileCoverageByZoom: null,
  baseUrl: '',
  urlTemplate: '',
  coordinateSystem: 'wgs84',
  tileScheme: 'xyz',
  tileFormat: 'png',
  minZoom: 16,
  maxZoom: 19,
  allowedZooms: [16, 17, 18, 19],
  localCacheDirName: DEFAULT_LOCAL_TILE_CACHE_DIR,
  opacity: 0.96,
  zIndex: 1
}

const DEFAULT_MAP_BOUNDS = {
  southwest: {
    latitude: 40.4802,
    longitude: 116.4842
  },
  northeast: {
    latitude: 40.4911,
    longitude: 116.5030
  }
}

function normalizeStringValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeMiniProgramPackagePath(value) {
  return normalizeStringValue(value)
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
}

function buildMiniProgramPackagePathCandidates(value) {
  const normalizedPath = normalizeMiniProgramPackagePath(value)
  if (!normalizedPath) {
    return []
  }

  return Array.from(new Set([
    normalizedPath,
    `/${normalizedPath}`
  ]))
}

function isRemoteTileUrl(value) {
  return /^https?:\/\//i.test(normalizeStringValue(value))
}

function isWxFileUrl(value) {
  return /^wxfile:\/\//i.test(normalizeStringValue(value))
}

function shouldStagePackageTile(value) {
  const normalizedPath = normalizeMiniProgramPackagePath(value)
  return !!normalizedPath && !isRemoteTileUrl(value) && !isWxFileUrl(value)
}

function shouldCacheTileLocally(value) {
  return shouldStagePackageTile(value) || isRemoteTileUrl(value)
}

function sanitizePathSegment(segment) {
  return String(segment || '')
    .replace(/[^0-9A-Za-z._-]/g, '_')
    .replace(/^_+|_+$/g, '')
}

function buildRemoteTileCacheRelativePath(sourceUrl) {
  const normalizedUrl = normalizeStringValue(sourceUrl)
    .replace(/[?#].*$/, '')
    .replace(/^https?:\/\//i, '')

  if (!normalizedUrl) {
    return ''
  }

  const sanitizedSegments = normalizedUrl
    .split('/')
    .map((segment) => sanitizePathSegment(segment))
    .filter(Boolean)

  return sanitizedSegments.length ? `remote/${sanitizedSegments.join('/')}` : ''
}

function buildTileCacheRelativePath(sourcePath) {
  if (shouldStagePackageTile(sourcePath)) {
    return normalizeMiniProgramPackagePath(sourcePath)
  }

  if (isRemoteTileUrl(sourcePath)) {
    return buildRemoteTileCacheRelativePath(sourcePath)
  }

  return ''
}

function getDirectoryPath(filePath) {
  const normalizedPath = normalizeStringValue(filePath)
  const lastSlashIndex = normalizedPath.lastIndexOf('/')
  return lastSlashIndex > 0 ? normalizedPath.slice(0, lastSlashIndex) : ''
}

function normalizeUserDataPath(value) {
  const normalizedPath = normalizeStringValue(value)
  if (!normalizedPath) {
    return ''
  }

  if (normalizedPath.startsWith('http://usr/')) {
    return normalizedPath.replace(/^http:\/\/usr\//, 'wxfile://usr/')
  }

  if (normalizedPath === 'http://usr') {
    return 'wxfile://usr'
  }

  return normalizedPath
}

function wait(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(delayMs) || 0))
  })
}

Component({
  properties: {
    mapCtx: {
      type: Object,
      value: null
    },
    scale: {
      type: Number,
      value: 16,
      observer: 'onScaleChange'
    },
    visible: {
      type: Boolean,
      value: true,
      observer: 'onVisibilityChange'
    },
    bounds: {
      type: Object,
      value: null
    },
    tileServerConfig: {
      type: Object,
      value: null
    },
    tileOpacity: {
      type: Number,
      value: null
    },
    tileZIndex: {
      type: Number,
      value: null
    },
    allowedZooms: {
      type: Array,
      value: []
    }
  },

  data: {
    currentTileCount: 0,
    isLoading: false,
    lastUpdateTime: 0,
    updateDebounceDelay: 100
  },

  lifetimes: {
    attached() {
      this._activeTiles = new Map()
      this._activeTileMeta = new Map()
      this._restorableTileMeta = new Map()
      this._failedTiles = new Map()
      this._tileLocalPathCache = new Map()
      this._tileSourceReadyPromises = new Map()
      this._tileImageInfoPathCache = new Map()
      this._tileImageInfoPromises = new Map()
      this._prefetchedTileSourceUrls = new Set()
      this._tileSourcePrefetchPromises = new Map()
      this._lastVisibleTileSignature = ''
      this._tileUpdateRequestId = 0
      this._tilePrefetchRequestId = 0
      this._pendingTilePrefetchRequestId = 0
      this._loadingRequestId = 0
      this._overlayIdSeed = 1
      this._isTileUpdateInFlight = false
      this._needsFollowUpTileUpdate = false
      this.dynamicBounds = null
      this.currentScale = this.properties.scale || 16
      this.isInitializing = false
      this._missingTileSourceWarned = false
      this._failedTileCount = 0

      if (this.properties.mapCtx) {
        this.initTileOverlay()
      }
    },

    detached() {
      this.clearAllTiles()
      this._activeTileMeta.clear()
      this._restorableTileMeta.clear()
      this._tileLocalPathCache.clear()
      this._tileSourceReadyPromises.clear()
      this._tileImageInfoPathCache.clear()
      this._tileImageInfoPromises.clear()
      this._prefetchedTileSourceUrls.clear()
      this._tileSourcePrefetchPromises.clear()
      this._lastVisibleTileSignature = ''
      if (this.updateTimer) {
        clearTimeout(this.updateTimer)
        this.updateTimer = null
      }
      if (this.prefetchTimer) {
        clearTimeout(this.prefetchTimer)
        this.prefetchTimer = null
      }
    }
  },

  methods: {
    createOverlayInstanceId() {
      const overlayId = this._overlayIdSeed
      this._overlayIdSeed += 1
      return overlayId
    },

    upsertActiveTileEntry(tile, options = {}) {
      const sourceUrl = normalizeStringValue(tile?.url)
      const overlayId = Number(tile?.overlayId || tile?.id)
      if (!sourceUrl || !Number.isFinite(overlayId)) {
        return
      }

      const now = Date.now()
      const previousMeta = this._activeTileMeta.get(sourceUrl) || {}
      this._activeTiles.set(sourceUrl, overlayId)
      this._activeTileMeta.set(sourceUrl, {
        ...previousMeta,
        url: sourceUrl,
        overlayId,
        stringId: tile?.stringId || previousMeta.stringId || '',
        x: Number.isFinite(Number(tile?.x)) ? Number(tile.x) : previousMeta.x,
        y: Number.isFinite(Number(tile?.y)) ? Number(tile.y) : previousMeta.y,
        z: Number.isFinite(Number(tile?.z)) ? Number(tile.z) : previousMeta.z,
        bounds: tile?.bounds || previousMeta.bounds || null,
        runtimeSrc: normalizeStringValue(tile?.runtimeSrc) || previousMeta.runtimeSrc || '',
        sourceCandidates: Array.isArray(tile?.sourceCandidates) && tile.sourceCandidates.length
          ? tile.sourceCandidates.slice()
          : (Array.isArray(previousMeta.sourceCandidates) ? previousMeta.sourceCandidates.slice() : []),
        createdAt: previousMeta.createdAt || now,
        lastTouchedAt: now,
        lastVisibleAt: options.visible ? now : (previousMeta.lastVisibleAt || 0)
      })
    },

    touchActiveTileEntry(sourceUrl, options = {}) {
      const normalizedSourceUrl = normalizeStringValue(sourceUrl)
      if (!normalizedSourceUrl) {
        return
      }

      const previousMeta = this._activeTileMeta.get(normalizedSourceUrl)
      if (!previousMeta) {
        return
      }

      const now = Date.now()
      this._activeTileMeta.set(normalizedSourceUrl, {
        ...previousMeta,
        lastTouchedAt: now,
        lastVisibleAt: options.visible ? now : previousMeta.lastVisibleAt
      })
    },

    getTileOverlayCacheLimit(zoom = this.getZoomLevel()) {
      const zoomConfig = this.getZoomAdaptiveConfig(zoom)
      const configuredMaxTiles = Number(zoomConfig?.maxTiles)
      if (!Number.isFinite(configuredMaxTiles) || configuredMaxTiles <= 0) {
        return TILE_OVERLAY_CACHE_MAX_SIZE
      }

      return Math.max(
        TILE_OVERLAY_CACHE_MIN_SIZE,
        Math.min(
          TILE_OVERLAY_CACHE_MAX_SIZE,
          Math.round(configuredMaxTiles * TILE_OVERLAY_CACHE_SIZE_MULTIPLIER)
        )
      )
    },

    pruneActiveTileCache(protectedTileUrlSet = new Set(), zoom = this.getZoomLevel()) {
      if (!(this._activeTiles instanceof Map) || this._activeTiles.size <= 0) {
        return new Map()
      }

      const overflowCount = this._activeTiles.size - this.getTileOverlayCacheLimit(zoom)
      if (overflowCount <= 0) {
        return new Map()
      }

      const removableCandidates = Array.from(this._activeTiles.entries())
        .filter(([url]) => !protectedTileUrlSet.has(url))
        .map(([url, overlayId]) => {
          const meta = this._activeTileMeta.get(url) || {}
          return {
            url,
            overlayId,
            createdAt: Number(meta.createdAt) || 0,
            lastTouchedAt: Number(meta.lastTouchedAt) || 0,
            lastVisibleAt: Number(meta.lastVisibleAt) || 0
          }
        })
        .sort((left, right) => {
          if (left.lastVisibleAt !== right.lastVisibleAt) {
            return left.lastVisibleAt - right.lastVisibleAt
          }

          if (left.lastTouchedAt !== right.lastTouchedAt) {
            return left.lastTouchedAt - right.lastTouchedAt
          }

          return left.createdAt - right.createdAt
        })

      if (!removableCandidates.length) {
        return new Map()
      }

      const removableEntries = removableCandidates.slice(0, overflowCount)
      const removableMap = new Map()

      removableEntries.forEach(({ url, overlayId }) => {
        removableMap.set(url, overlayId)
        this._activeTiles.delete(url)
        this._activeTileMeta.delete(url)
      })

      return removableMap
    },

    setLoadingState(isLoading, requestId = 0) {
      if (isLoading) {
        this._loadingRequestId = requestId
        if (!this.data.isLoading) {
          this.setData({
            isLoading: true
          })
        }
        return
      }

      if (requestId && this._loadingRequestId && this._loadingRequestId !== requestId) {
        return
      }

      this._loadingRequestId = 0
      if (this.data.isLoading) {
        this.setData({
          isLoading: false
        })
      }
    },

    normalizeAllowedZooms(allowedZooms) {
      if (!Array.isArray(allowedZooms)) {
        return []
      }

      return [...new Set(
        allowedZooms
          .map((zoom) => Number(zoom))
          .filter((zoom) => Number.isFinite(zoom))
          .map((zoom) => Math.round(zoom))
      )].sort((left, right) => left - right)
    },

    normalizeCoordinateSystem(coordinateSystem) {
      return String(coordinateSystem || '').toLowerCase() === 'gcj02' ? 'gcj02' : 'wgs84'
    },

    normalizeTileScheme(tileScheme) {
      return String(tileScheme || '').toLowerCase() === 'tms' ? 'tms' : 'xyz'
    },

    normalizeTileCoverageByZoom(tileCoverageByZoom) {
      if (!tileCoverageByZoom || typeof tileCoverageByZoom !== 'object') {
        return null
      }

      const normalizedCoverage = {}
      Object.keys(tileCoverageByZoom).forEach((zoomKey) => {
        const rawCoverage = tileCoverageByZoom[zoomKey]
        if (!rawCoverage || typeof rawCoverage !== 'object') {
          return
        }

        const minX = Number(rawCoverage.minX)
        const maxX = Number(rawCoverage.maxX)
        const minY = Number(rawCoverage.minY)
        const maxY = Number(rawCoverage.maxY)
        if (![minX, maxX, minY, maxY].every(Number.isFinite)) {
          return
        }

        normalizedCoverage[Math.round(Number(zoomKey))] = {
          minX: Math.min(minX, maxX),
          maxX: Math.max(minX, maxX),
          minY: Math.min(minY, maxY),
          maxY: Math.max(minY, maxY)
        }
      })

      return Object.keys(normalizedCoverage).length ? normalizedCoverage : null
    },

    getResolvedTileConfig() {
      const serverConfig = this.properties.tileServerConfig || {}
      const propertyAllowedZooms = this.normalizeAllowedZooms(this.properties.allowedZooms)
      const configAllowedZooms = this.normalizeAllowedZooms(serverConfig.allowedZooms)
      const allowedZooms = propertyAllowedZooms.length
        ? propertyAllowedZooms
        : (configAllowedZooms.length ? configAllowedZooms : DEFAULT_TILE_CONFIG.allowedZooms)

      return {
        ...DEFAULT_TILE_CONFIG,
        ...serverConfig,
        allowedZooms,
        packageRoots: Array.isArray(serverConfig.packageRoots) ? serverConfig.packageRoots.slice() : [],
        zoomBaseUrlMap: serverConfig.zoomBaseUrlMap && typeof serverConfig.zoomBaseUrlMap === 'object'
          ? serverConfig.zoomBaseUrlMap
          : null,
        tileCoverageByZoom: this.normalizeTileCoverageByZoom(serverConfig.tileCoverageByZoom),
        coordinateSystem: this.normalizeCoordinateSystem(serverConfig.coordinateSystem || serverConfig.coordSystem),
        tileScheme: this.normalizeTileScheme(serverConfig.tileScheme || serverConfig.scheme),
        minZoom: typeof serverConfig.minZoom === 'number' ? serverConfig.minZoom : DEFAULT_TILE_CONFIG.minZoom,
        maxZoom: typeof serverConfig.maxZoom === 'number' ? serverConfig.maxZoom : DEFAULT_TILE_CONFIG.maxZoom,
        tileFormat: serverConfig.tileFormat || serverConfig.format || DEFAULT_TILE_CONFIG.tileFormat,
        localCacheDirName: normalizeStringValue(serverConfig.localCacheDirName) || DEFAULT_TILE_CONFIG.localCacheDirName,
        opacity: typeof this.properties.tileOpacity === 'number'
          ? this.properties.tileOpacity
          : (typeof serverConfig.opacity === 'number' ? serverConfig.opacity : DEFAULT_TILE_CONFIG.opacity),
        zIndex: typeof this.properties.tileZIndex === 'number'
          ? this.properties.tileZIndex
          : (typeof serverConfig.zIndex === 'number' ? serverConfig.zIndex : DEFAULT_TILE_CONFIG.zIndex)
      }
    },

    getConfiguredBounds() {
      const bounds = this.properties.bounds
      if (
        bounds
        && bounds.southwest
        && bounds.northeast
        && typeof bounds.southwest.latitude === 'number'
        && typeof bounds.southwest.longitude === 'number'
        && typeof bounds.northeast.latitude === 'number'
        && typeof bounds.northeast.longitude === 'number'
      ) {
        return bounds
      }

      return DEFAULT_MAP_BOUNDS
    },

    getTileCoverage(z) {
      const config = this.getResolvedTileConfig()
      const tileCoverageByZoom = config.tileCoverageByZoom
      if (!tileCoverageByZoom || !tileCoverageByZoom[z]) {
        return null
      }

      return tileCoverageByZoom[z]
    },

    hasRemoteTileSource() {
      const config = this.getResolvedTileConfig()

      if (isRemoteTileUrl(config.baseUrl) || isRemoteTileUrl(config.urlTemplate)) {
        return true
      }

      const zoomBaseUrlMap = config.zoomBaseUrlMap
      if (!zoomBaseUrlMap || typeof zoomBaseUrlMap !== 'object') {
        return false
      }

      return Object.values(zoomBaseUrlMap).some((rule) => {
        if (typeof rule === 'string') {
          return isRemoteTileUrl(rule)
        }

        if (!Array.isArray(rule)) {
          return false
        }

        return rule.some((item) => isRemoteTileUrl(item?.baseUrl))
      })
    },

    initTileOverlay() {
      const mapCtx = this.properties.mapCtx
      if (!mapCtx || this.isInitializing) {
        return
      }

      this.isInitializing = true

      mapCtx.getScale({
        success: (scaleResult = {}) => {
          if (typeof scaleResult.scale === 'number') {
            this.currentScale = scaleResult.scale
          }

          mapCtx.getRegion({
            success: (regionResult) => {
              this.dynamicBounds = regionResult
              this.updateTiles()
            },
            fail: () => {
              this.updateTiles()
            },
            complete: () => {
              this.isInitializing = false
            }
          })
        },
        fail: () => {
          mapCtx.getRegion({
            success: (regionResult) => {
              this.dynamicBounds = regionResult
              this.updateTiles()
            },
            fail: () => {
              this.updateTiles()
            },
            complete: () => {
              this.isInitializing = false
            }
          })
        }
      })
    },

    onScaleChange(newScale, oldScale) {
      if (!this.properties.mapCtx) {
        return
      }

      if (newScale === oldScale && this.currentScale === newScale) {
        return
      }

      this.currentScale = newScale
      const currentBounds = this.getCurrentBounds()
      if (!currentBounds) {
        return
      }

      const previewTiles = this.calculateTilesForZoom(this.getZoomLevel(), {
        bounds: currentBounds
      })
      this.scheduleTileSourcePrefetch(previewTiles)
    },

    onVisibilityChange(visible) {
      const mapCtx = this.properties.mapCtx
      if (!mapCtx || !this._activeTiles || typeof mapCtx.updateGroundOverlay !== 'function') {
        return
      }

      for (const [, overlayId] of this._activeTiles.entries()) {
        mapCtx.updateGroundOverlay({
          id: overlayId,
          visible: !!visible
        })
      }
    },

    updateTiles() {
      const now = Date.now()
      if (now - this.data.lastUpdateTime < this.data.updateDebounceDelay) {
        return
      }

      const mapCtx = this.properties.mapCtx
      if (!mapCtx || typeof mapCtx.addGroundOverlay !== 'function' || typeof mapCtx.removeGroundOverlay !== 'function') {
        return
      }

      this.setData({
        lastUpdateTime: now
      })

      const requiredTiles = this.prioritizeVisibleTiles(this.calculateVisibleTiles())
      const requiredTileSignature = requiredTiles.map((tile) => tile.stringId).join('|')
      const requiredTileUrlSet = new Set(requiredTiles.map((tile) => tile.url))
      const requiredTileIdSet = new Set(requiredTiles.map((tile) => tile.stringId))
      const retainedTileUrlSet = new Set(this.calculateRetainedTiles().map((tile) => tile.url))
      const updateRequestId = this._tileUpdateRequestId + 1
      const hasMissingRequiredTiles = requiredTiles.some((tile) => !this._activeTiles.has(tile.url))
      const shouldSkipRefresh = (
        requiredTileSignature
        && requiredTileSignature === this._lastVisibleTileSignature
        && this._failedTiles.size === 0
        && !hasMissingRequiredTiles
      )

      if (shouldSkipRefresh) {
        if (this.data.currentTileCount !== requiredTiles.length) {
          this.setData({
            currentTileCount: requiredTiles.length
          })
        }
        return
      }

      if (this._isTileUpdateInFlight) {
        this._tileUpdateRequestId += 1
        this._needsFollowUpTileUpdate = true
        return
      }

      this._isTileUpdateInFlight = true
      this._tileUpdateRequestId = updateRequestId
      this._lastVisibleTileSignature = requiredTileSignature
      for (const tileId of Array.from(this._failedTiles.keys())) {
        if (!requiredTileIdSet.has(tileId)) {
          this._failedTiles.delete(tileId)
        }
      }

      const finalizeTileUpdate = () => {
        this._isTileUpdateInFlight = false

        if (this._needsFollowUpTileUpdate) {
          this._needsFollowUpTileUpdate = false
          this.scheduleUpdateTiles('bounds')
        }
      }

      const retainedActiveTiles = new Map()
      const tilesToLoad = []

      for (const [url, overlayId] of this._activeTiles.entries()) {
        if (requiredTileUrlSet.has(url)) {
          retainedActiveTiles.set(url, overlayId)
          this.touchActiveTileEntry(url, {
            visible: true
          })
          continue
        }

        if (retainedTileUrlSet.has(url)) {
          this.touchActiveTileEntry(url)
        }
      }

      requiredTiles.forEach((tile) => {
        if (retainedActiveTiles.has(tile.url)) {
          return
        }

        tilesToLoad.push(tile)
      })

      this.setData({
        currentTileCount: requiredTiles.length
      })

      if (!tilesToLoad.length) {
        this._failedTiles = new Map()
        this.setLoadingState(false, updateRequestId)
        const removableActiveTiles = this.pruneActiveTileCache(
          new Set([...requiredTileUrlSet, ...retainedTileUrlSet]),
          this.getZoomLevel()
        )
        this.removeOverlayEntries(removableActiveTiles)
        this.scheduleTileSourcePrefetch(requiredTiles, updateRequestId)
        finalizeTileUpdate()
        return
      }

      this.loadTilesDirectly(tilesToLoad, updateRequestId)
        .then(({ loadedTiles = [], failedTiles = [] } = {}) => {
          if (updateRequestId !== this._tileUpdateRequestId) {
            this.reconcileStaleLoadedTiles(loadedTiles)
            return
          }

          const nextFailedTiles = new Map()

          loadedTiles.forEach((tile) => {
            this.upsertActiveTileEntry(tile, {
              visible: true
            })
          })
          failedTiles.forEach((tile) => {
            nextFailedTiles.set(tile.stringId, tile)
          })

          this._failedTiles = nextFailedTiles
          const removableActiveTiles = this.pruneActiveTileCache(
            new Set([...requiredTileUrlSet, ...retainedTileUrlSet]),
            this.getZoomLevel()
          )
          this.removeOverlayEntries(removableActiveTiles)

          if (loadedTiles.length) {
            this.triggerEvent('tilesLoaded', {
              tiles: loadedTiles
            })
          }

          if (failedTiles.length) {
            this.triggerEvent('tilesError', {
              tiles: failedTiles
            })
          }

          this.scheduleTileSourcePrefetch(requiredTiles, updateRequestId)
        })
        .catch((error) => {
          if (updateRequestId !== this._tileUpdateRequestId) {
            return
          }

          this._failedTiles = new Map(tilesToLoad.map((tile) => [tile.stringId, {
            ...tile,
            error
          }]))
        })
        .finally(() => {
          finalizeTileUpdate()
        })
    },

    prioritizeVisibleTiles(tiles = []) {
      if (!Array.isArray(tiles) || tiles.length <= 1) {
        return Array.isArray(tiles) ? tiles.slice() : []
      }

      let tileXTotal = 0
      let tileYTotal = 0

      tiles.forEach((tile) => {
        tileXTotal += Number(tile?.x)
        tileYTotal += Number(tile?.y)
      })

      const centerTileX = tileXTotal / tiles.length
      const centerTileY = tileYTotal / tiles.length

      return tiles
        .slice()
        .sort((left, right) => {
          const leftDistance = Math.abs(Number(left?.x) - centerTileX) + Math.abs(Number(left?.y) - centerTileY)
          const rightDistance = Math.abs(Number(right?.x) - centerTileX) + Math.abs(Number(right?.y) - centerTileY)
          if (leftDistance !== rightDistance) {
            return leftDistance - rightDistance
          }

          const leftY = Number(left?.y)
          const rightY = Number(right?.y)
          if (leftY !== rightY) {
            return leftY - rightY
          }

          return Number(left?.x) - Number(right?.x)
        })
    },

    removeOverlayEntries(overlayEntries) {
      const mapCtx = this.properties.mapCtx
      if (!mapCtx || typeof mapCtx.removeGroundOverlay !== 'function') {
        return
      }

      const overlayIds = overlayEntries instanceof Map
        ? Array.from(overlayEntries.values())
        : Array.isArray(overlayEntries)
          ? overlayEntries
          : []

      overlayIds.forEach((overlayId) => {
        mapCtx.removeGroundOverlay({
          id: overlayId,
          fail: () => {}
        })
      })
    },

    reconcileStaleLoadedTiles(loadedTiles = []) {
      if (!Array.isArray(loadedTiles) || !loadedTiles.length) {
        return
      }

      const requiredTileUrlSet = new Set(this.calculateVisibleTiles().map((tile) => tile.url))
      const retainedTileUrlSet = new Set(this.calculateRetainedTiles().map((tile) => tile.url))
      const reusableTileUrlSet = new Set([
        ...requiredTileUrlSet,
        ...retainedTileUrlSet
      ])
      const removableOverlayIds = []

      loadedTiles.forEach((tile) => {
        const sourceUrl = normalizeStringValue(tile?.url)
        const overlayId = Number(tile?.overlayId || tile?.id)

        if (!sourceUrl || !Number.isFinite(overlayId)) {
          return
        }

        if (!reusableTileUrlSet.has(sourceUrl)) {
          removableOverlayIds.push(overlayId)
          return
        }

        this.upsertActiveTileEntry(tile, {
          visible: requiredTileUrlSet.has(sourceUrl)
        })
      })

      if (removableOverlayIds.length) {
        this.removeOverlayEntries(removableOverlayIds)
      }
    },

    getMiniProgramFileSystemManager() {
      if (typeof wx.getFileSystemManager !== 'function') {
        return null
      }

      return wx.getFileSystemManager()
    },

    accessFileSystemPath(path) {
      const fs = this.getMiniProgramFileSystemManager()
      const targetPath = normalizeStringValue(path)
      if (!fs || !targetPath) {
        return Promise.reject(new Error('filesystem unavailable'))
      }

      return new Promise((resolve, reject) => {
        fs.access({
          path: targetPath,
          success: () => resolve(targetPath),
          fail: reject
        })
      })
    },

    ensureFileSystemDirectory(path) {
      const fs = this.getMiniProgramFileSystemManager()
      const dirPath = normalizeStringValue(path)
      if (!fs || !dirPath) {
        return Promise.reject(new Error('filesystem unavailable'))
      }

      return new Promise((resolve, reject) => {
        fs.mkdir({
          dirPath,
          recursive: true,
          success: () => resolve(dirPath),
          fail: (error) => {
            const errorMessage = String(error?.errMsg || '')
            if (errorMessage.includes('file already exists')) {
              resolve(dirPath)
              return
            }

            reject(error)
          }
        })
      })
    },

    copyMiniProgramPackageFile(sourcePath, targetPath) {
      const fs = this.getMiniProgramFileSystemManager()
      const packagePathCandidates = buildMiniProgramPackagePathCandidates(sourcePath)
      const localTargetPath = normalizeStringValue(targetPath)

      if (!fs || !packagePathCandidates.length || !localTargetPath) {
        return Promise.reject(new Error('package file copy path is empty'))
      }

      return new Promise((resolve, reject) => {
        const readAndWriteCandidate = (packagePath, copyError, next) => {
          fs.readFile({
            filePath: packagePath,
            success: (readResult = {}) => {
              fs.writeFile({
                filePath: localTargetPath,
                data: readResult.data,
                success: () => resolve(localTargetPath),
                fail: reject
              })
            },
            fail: (readError) => next(readError || copyError)
          })
        }

        const tryCandidateAt = (index, lastError) => {
          if (index >= packagePathCandidates.length) {
            reject(lastError || new Error('package file copy failed'))
            return
          }

          const packagePath = packagePathCandidates[index]
          const continueWithNext = (error) => {
            tryCandidateAt(index + 1, error)
          }

          fs.copyFile({
            srcPath: packagePath,
            destPath: localTargetPath,
            success: () => resolve(localTargetPath),
            fail: (copyError) => readAndWriteCandidate(packagePath, copyError, continueWithNext)
          })
        }

        tryCandidateAt(0, null)
      })
    },

    copyLocalFile(sourcePath, targetPath) {
      const fs = this.getMiniProgramFileSystemManager()
      const normalizedSourcePath = normalizeUserDataPath(sourcePath)
      const normalizedTargetPath = normalizeUserDataPath(targetPath)

      if (!fs || !normalizedSourcePath || !normalizedTargetPath) {
        return Promise.reject(new Error('local file copy path is empty'))
      }

      return new Promise((resolve, reject) => {
        fs.copyFile({
          srcPath: normalizedSourcePath,
          destPath: normalizedTargetPath,
          success: () => resolve(normalizedTargetPath),
          fail: (copyError) => {
            fs.readFile({
              filePath: normalizedSourcePath,
              success: (readResult = {}) => {
                fs.writeFile({
                  filePath: normalizedTargetPath,
                  data: readResult.data,
                  success: () => resolve(normalizedTargetPath),
                  fail: reject
                })
              },
              fail: (readError) => reject(readError || copyError)
            })
          }
        })
      })
    },

    buildLocalTileCachePath(sourcePath) {
      const tileConfig = this.getResolvedTileConfig()
      const normalizedSourcePath = buildTileCacheRelativePath(sourcePath)
      const userDataPath = normalizeUserDataPath(wx && wx.env ? wx.env.USER_DATA_PATH : '')
      if (!normalizedSourcePath || !userDataPath) {
        return ''
      }

      return `${userDataPath}/${tileConfig.localCacheDirName}/${normalizedSourcePath}`
    },

    downloadRemoteTileToLocalPath(sourceUrl, targetPath) {
      const normalizedSourceUrl = normalizeStringValue(sourceUrl)
      const normalizedTargetPath = normalizeUserDataPath(targetPath)
      if (!normalizedSourceUrl || !normalizedTargetPath) {
        return Promise.reject(new Error('remote tile cache path is empty'))
      }

      return new Promise((resolve, reject) => {
        wx.downloadFile({
          url: normalizedSourceUrl,
          success: (result = {}) => {
            if (!(result.statusCode >= 200 && result.statusCode < 300) || !result.tempFilePath) {
              reject(result)
              return
            }

            this.copyLocalFile(result.tempFilePath, normalizedTargetPath)
              .then(() => resolve(normalizedTargetPath))
              .catch(reject)
          },
          fail: reject
        })
      })
    },

    getImageInfoPath(src) {
      const sourcePath = normalizeStringValue(src)
      if (!sourcePath || typeof wx.getImageInfo !== 'function') {
        return Promise.resolve(sourcePath)
      }

      const cachedPath = this._tileImageInfoPathCache.get(sourcePath)
      if (cachedPath) {
        return Promise.resolve(cachedPath)
      }

      const pendingPromise = this._tileImageInfoPromises.get(sourcePath)
      if (pendingPromise) {
        return pendingPromise
      }

      const resolvePromise = new Promise((resolve, reject) => {
        wx.getImageInfo({
          src: sourcePath,
          success: (result = {}) => {
            const resolvedPath = normalizeUserDataPath(result.path) || sourcePath
            this._tileImageInfoPathCache.set(sourcePath, resolvedPath)
            resolve(resolvedPath)
          },
          fail: reject
        })
      }).finally(() => {
        this._tileImageInfoPromises.delete(sourcePath)
      })

      this._tileImageInfoPromises.set(sourcePath, resolvePromise)
      return resolvePromise
    },

    resolveTileSourceCandidates(tile) {
      const sourceUrl = normalizeStringValue(tile?.url)
      if (!sourceUrl) {
        return Promise.resolve([])
      }

      if (!shouldCacheTileLocally(sourceUrl)) {
        return Promise.resolve([sourceUrl])
      }

      const cachedSourceCandidates = this.buildSnapshotSourceCandidates(sourceUrl, tile?.sourceCandidates)
      const hasReadyLocalCandidate = cachedSourceCandidates.some((candidate) => candidate && candidate !== sourceUrl)
      if (hasReadyLocalCandidate) {
        return Promise.resolve(cachedSourceCandidates)
      }

      if (isRemoteTileUrl(sourceUrl)) {
        this.warmTileSourceCacheInBackground(tile)
        return Promise.resolve([sourceUrl])
      }

      return this.resolveTileRuntimeSrc(tile)
        .then((stagedPath) => Array.from(new Set([
          normalizeStringValue(stagedPath),
          sourceUrl
        ].filter(Boolean))))
    },

    warmTileSourceCacheInBackground(tile) {
      this.resolveTileRuntimeSrc(tile).catch(() => {})
    },

    normalizeTileSourceCandidates(sourceCandidates) {
      if (!Array.isArray(sourceCandidates) || !sourceCandidates.length) {
        return Promise.resolve([])
      }

      const normalizedCandidates = []
      let chain = Promise.resolve()

      sourceCandidates.forEach((sourceCandidate) => {
        chain = chain
          .then(() => this.getImageInfoPath(sourceCandidate)
            .then((imageInfoPath) => {
              normalizedCandidates.push(imageInfoPath)
            })
            .catch(() => {
              normalizedCandidates.push(sourceCandidate)
            }))
      })

      return chain.then(() => Array.from(new Set(normalizedCandidates.filter(Boolean))))
    },

    resolveTileRuntimeSrc(tile) {
      const sourceUrl = normalizeStringValue(tile?.url)
      if (!sourceUrl || !shouldCacheTileLocally(sourceUrl)) {
        return Promise.resolve(sourceUrl)
      }

      const cachedLocalPath = this._tileLocalPathCache.get(sourceUrl)
      if (cachedLocalPath) {
        return Promise.resolve(cachedLocalPath)
      }

      const pendingPromise = this._tileSourceReadyPromises.get(sourceUrl)
      if (pendingPromise) {
        return pendingPromise
      }

      const localTargetPath = this.buildLocalTileCachePath(sourceUrl)
      if (!localTargetPath) {
        return Promise.resolve(sourceUrl)
      }

      const localTargetDir = getDirectoryPath(localTargetPath)
      const resolvePromise = this.ensureFileSystemDirectory(localTargetDir)
        .then(() => this.accessFileSystemPath(localTargetPath).catch(() => {
          if (shouldStagePackageTile(sourceUrl)) {
            return this.copyMiniProgramPackageFile(sourceUrl, localTargetPath)
              .catch((packageCopyError) => {
                return this.getImageInfoPath(sourceUrl)
                  .then((imageInfoPath) => {
                    const normalizedImageInfoPath = normalizeUserDataPath(imageInfoPath)
                    if (!normalizedImageInfoPath || normalizedImageInfoPath === sourceUrl) {
                      throw packageCopyError
                    }

                    return this.copyLocalFile(normalizedImageInfoPath, localTargetPath)
                  })
              })
          }

          if (isRemoteTileUrl(sourceUrl)) {
            return this.downloadRemoteTileToLocalPath(sourceUrl, localTargetPath)
          }

          return Promise.reject(new Error('unsupported tile source type'))
        }))
        .then((resolvedLocalPath) => {
          const normalizedResolvedLocalPath = normalizeUserDataPath(resolvedLocalPath)
          this._tileLocalPathCache.set(sourceUrl, normalizedResolvedLocalPath)
          return normalizedResolvedLocalPath
        })
        .catch((error) => {
          console.warn('[tile-overlay] local tile stage failed', {
            sourceUrl,
            localTargetPath,
            userDataPath: normalizeUserDataPath(wx && wx.env ? wx.env.USER_DATA_PATH : ''),
            error
          })
          return this.getImageInfoPath(sourceUrl).catch(() => sourceUrl)
        })
        .finally(() => {
          this._tileSourceReadyPromises.delete(sourceUrl)
        })

      this._tileSourceReadyPromises.set(sourceUrl, resolvePromise)
      return resolvePromise
    },

    prepareTilesForOverlay(tilesToLoad) {
      if (!Array.isArray(tilesToLoad) || !tilesToLoad.length) {
        return Promise.resolve([])
      }

      const preparedTiles = new Array(tilesToLoad.length)
      let cursor = 0
      const workerCount = Math.max(1, Math.min(TILE_SOURCE_PREPARE_CONCURRENCY, tilesToLoad.length))
      const worker = async () => {
        while (cursor < tilesToLoad.length) {
          const currentIndex = cursor
          cursor += 1
          const tile = tilesToLoad[currentIndex]
          const sourceCandidates = await this.resolveTileSourceCandidates(tile)
          const normalizedSourceCandidates = await this.normalizeTileSourceCandidates(sourceCandidates)
          preparedTiles[currentIndex] = {
            ...tile,
            overlayId: this.createOverlayInstanceId(),
            runtimeSrc: normalizedSourceCandidates[0] || '',
            sourceCandidates: normalizedSourceCandidates
          }
        }
      }

      return Promise.all(Array.from({ length: workerCount }, () => worker())).then(() => preparedTiles)
    },

    addGroundOverlayWithSourceFallback(mapCtx, tile, tileConfig, onSuccess, onFail) {
      const sourceCandidates = Array.from(new Set([
        ...(Array.isArray(tile.sourceCandidates) ? tile.sourceCandidates.map((item) => normalizeStringValue(item)) : []),
        normalizeStringValue(tile.runtimeSrc),
        normalizeStringValue(tile.url)
      ].filter(Boolean)))

      const trySourceAt = (index, lastError) => {
        if (index >= sourceCandidates.length) {
          onFail(lastError)
          return
        }

        mapCtx.addGroundOverlay({
          id: tile.overlayId || tile.id,
          src: sourceCandidates[index],
          bounds: tile.bounds,
          visible: !!this.properties.visible,
          opacity: tileConfig.opacity,
          zIndex: tileConfig.zIndex,
          success: () => onSuccess(sourceCandidates[index]),
          fail: (error) => trySourceAt(index + 1, error)
        })
      }

      trySourceAt(0, null)
    },

    addGroundOverlayWithRetry(mapCtx, tile, tileConfig, attempt = 0) {
      return new Promise((resolve, reject) => {
        this.addGroundOverlayWithSourceFallback(
          mapCtx,
          tile,
          tileConfig,
          (resolvedSrc) => {
            resolve(resolvedSrc)
          },
          (error) => {
            if (attempt >= TILE_OVERLAY_RETRY_LIMIT) {
              reject(error)
              return
            }

            wait(TILE_OVERLAY_RETRY_DELAY_MS * (attempt + 1))
              .then(() => this.addGroundOverlayWithRetry(mapCtx, tile, tileConfig, attempt + 1))
              .then(resolve)
              .catch(reject)
          }
        )
      })
    },

    loadTilesDirectly(tilesToLoad, requestId = 0) {
      const mapCtx = this.properties.mapCtx
      if (!mapCtx || !tilesToLoad.length) {
        this.setLoadingState(false, requestId)
        return Promise.resolve({
          loadedTiles: [],
          failedTiles: []
        })
      }

      const tileConfig = this.getResolvedTileConfig()
      let pendingCount = tilesToLoad.length
      const loadedTiles = []
      const failedTiles = []

      this.setLoadingState(true, requestId)

      return new Promise((resolve) => {
        const finalize = () => {
          pendingCount -= 1
          if (pendingCount > 0) {
            return
          }

          this.setLoadingState(false, requestId)
          resolve({
            loadedTiles,
            failedTiles
          })
        }

        this.prepareTilesForOverlay(tilesToLoad)
          .then((preparedTiles) => {
            let cursor = 0
            const workerCount = Math.max(1, Math.min(TILE_OVERLAY_MAX_CONCURRENT_LOADS, preparedTiles.length))
            const runWorker = async () => {
              while (cursor < preparedTiles.length) {
                const currentIndex = cursor
                cursor += 1
                const tile = preparedTiles[currentIndex]

                try {
                  await this.addGroundOverlayWithRetry(mapCtx, tile, tileConfig)
                  if (requestId && requestId !== this._tileUpdateRequestId) {
                    this.removeOverlayEntries([tile.overlayId || tile.id])
                  } else {
                    loadedTiles.push(tile)
                  }
                } catch (error) {
                  if (!requestId || requestId === this._tileUpdateRequestId) {
                    failedTiles.push({
                      ...tile,
                      error
                    })
                  }
                } finally {
                  finalize()
                }
              }
            }

            return Promise.all(Array.from({ length: workerCount }, () => runWorker()))
          })
          .catch((error) => {
            console.warn('[tile-overlay] prepare tiles failed', error)
            this.setLoadingState(false, requestId)
            const preparedFailedTiles = tilesToLoad.map((tile) => ({
              ...tile,
              error
            }))
            resolve({
              loadedTiles: [],
              failedTiles: preparedFailedTiles
            })
          })
      })
    },

    clearAllTiles() {
      const mapCtx = this.properties.mapCtx
      this._tileUpdateRequestId += 1
      this._tilePrefetchRequestId += 1
      this._pendingTilePrefetchRequestId = 0
      this._isTileUpdateInFlight = false
      this._needsFollowUpTileUpdate = false
      this.setLoadingState(false)
      if (this.prefetchTimer) {
        clearTimeout(this.prefetchTimer)
        this.prefetchTimer = null
      }

      if (mapCtx && this._activeTiles && typeof mapCtx.removeGroundOverlay === 'function') {
        for (const [, overlayId] of this._activeTiles.entries()) {
          mapCtx.removeGroundOverlay({
            id: overlayId,
            fail: () => {}
          })
        }
      }

      this._activeTiles.clear()
      this._activeTileMeta.clear()
      this._restorableTileMeta.clear()
      this._failedTiles.clear()
      this._lastVisibleTileSignature = ''
      this.setData({
        currentTileCount: 0,
        isLoading: false
      })
    },

    buildSnapshotSourceCandidates(sourceUrl, explicitSourceCandidates = []) {
      const normalizedSourceUrl = normalizeStringValue(sourceUrl)
      if (!normalizedSourceUrl) {
        return []
      }

      const normalizedExplicitCandidates = Array.isArray(explicitSourceCandidates)
        ? explicitSourceCandidates.map((item) => normalizeStringValue(item)).filter(Boolean)
        : []

      return Array.from(new Set([
        ...normalizedExplicitCandidates,
        normalizeStringValue(this._tileLocalPathCache.get(normalizedSourceUrl)),
        normalizeStringValue(this._tileImageInfoPathCache.get(normalizedSourceUrl)),
        normalizedSourceUrl
      ].filter(Boolean)))
    },

    captureVisibleTileSnapshot() {
      const visibleTiles = Array.isArray(this.calculateVisibleTiles?.())
        ? this.calculateVisibleTiles()
        : []

      if (!visibleTiles.length) {
        return null
      }

      const snapshotTiles = visibleTiles
        .map((visibleTile) => {
          const sourceUrl = normalizeStringValue(visibleTile?.url)
          if (!sourceUrl) {
            return null
          }

          const activeTileMeta = this._activeTileMeta.get(sourceUrl) || {}
          const sourceCandidates = this.buildSnapshotSourceCandidates(
            sourceUrl,
            activeTileMeta.sourceCandidates || visibleTile?.sourceCandidates
          )

          if (!sourceCandidates.length) {
            return null
          }

          return {
            url: sourceUrl,
            stringId: visibleTile?.stringId || activeTileMeta.stringId || '',
            x: Number.isFinite(Number(visibleTile?.x)) ? Number(visibleTile.x) : activeTileMeta.x,
            y: Number.isFinite(Number(visibleTile?.y)) ? Number(visibleTile.y) : activeTileMeta.y,
            z: Number.isFinite(Number(visibleTile?.z)) ? Number(visibleTile.z) : activeTileMeta.z,
            bounds: visibleTile?.bounds || activeTileMeta.bounds || null,
            sourceCandidates
          }
        })
        .filter((tile) => tile && tile.bounds)

      if (!snapshotTiles.length) {
        return null
      }

      return {
        capturedAt: Date.now(),
        tiles: snapshotTiles
      }
    },

    primeRestorableTileSnapshot(snapshot) {
      const snapshotTiles = Array.isArray(snapshot?.tiles) ? snapshot.tiles : []
      this._restorableTileMeta = new Map()

      snapshotTiles.forEach((tile) => {
        const sourceUrl = normalizeStringValue(tile?.url)
        if (!sourceUrl || !tile?.bounds) {
          return
        }

        const sourceCandidates = this.buildSnapshotSourceCandidates(sourceUrl, tile?.sourceCandidates)
        if (!sourceCandidates.length) {
          return
        }

        const localCandidate = sourceCandidates.find((candidate) => isWxFileUrl(candidate))
        if (localCandidate) {
          this._tileLocalPathCache.set(sourceUrl, localCandidate)
        }

        this._restorableTileMeta.set(sourceUrl, {
          ...tile,
          url: sourceUrl,
          sourceCandidates
        })
      })
    },

    invalidateNativeOverlays(options = {}) {
      const preserveActiveTileSnapshot = !!options.preserveActiveTileSnapshot
      this._tileUpdateRequestId += 1
      this._tilePrefetchRequestId += 1
      this._pendingTilePrefetchRequestId = 0
      this._isTileUpdateInFlight = false
      this._needsFollowUpTileUpdate = false
      if (preserveActiveTileSnapshot) {
        this.primeRestorableTileSnapshot(this.captureVisibleTileSnapshot())
      } else {
        this._restorableTileMeta.clear()
      }
      this._activeTiles.clear()
      this._activeTileMeta.clear()
      this._failedTiles.clear()
      this._lastVisibleTileSignature = ''
      this.setLoadingState(false)
      this.setData({
        currentTileCount: 0,
        isLoading: false
      })
    },

    restoreNativeOverlaysFromCache() {
      const mapCtx = this.properties.mapCtx
      if (
        !mapCtx
        || typeof mapCtx.addGroundOverlay !== 'function'
        || !(this._restorableTileMeta instanceof Map)
        || this._restorableTileMeta.size <= 0
      ) {
        return Promise.resolve({
          restoredTiles: [],
          failedTiles: []
        })
      }

      const tileConfig = this.getResolvedTileConfig()
      const cachedTiles = Array.from(this._restorableTileMeta.values())
        .filter((tileMeta) => {
          return normalizeStringValue(tileMeta?.url) && tileMeta?.bounds
        })
        .map((tileMeta) => {
          const sourceCandidates = this.buildSnapshotSourceCandidates(tileMeta.url, tileMeta.sourceCandidates)
          return {
            ...tileMeta,
            overlayId: this.createOverlayInstanceId(),
            runtimeSrc: sourceCandidates[0] || '',
            sourceCandidates
          }
        })

      if (!cachedTiles.length) {
        return Promise.resolve({
          restoredTiles: [],
          failedTiles: []
        })
      }

      const restoredTiles = []
      const failedTiles = []
      let cursor = 0
      const workerCount = Math.max(1, Math.min(TILE_OVERLAY_MAX_CONCURRENT_LOADS, cachedTiles.length))

      return Promise.all(Array.from({ length: workerCount }, async () => {
        while (cursor < cachedTiles.length) {
          const currentIndex = cursor
          cursor += 1
          const tile = cachedTiles[currentIndex]

          try {
            await this.addGroundOverlayWithRetry(mapCtx, tile, tileConfig)
            restoredTiles.push(tile)
            this.upsertActiveTileEntry(tile, {
              visible: true
            })
          } catch (error) {
            failedTiles.push({
              ...tile,
              error
            })
          }
        }
      })).then(() => ({
        restoredTiles,
        failedTiles
      }))
    },

    calculateVisibleTiles() {
      const zoom = this.getZoomLevel()
      return this.calculateTilesForZoom(zoom, {
        bounds: this.getCurrentBounds(),
        bufferRatio: 0
      })
    },

    calculateRetainedTiles() {
      const zoom = this.getZoomLevel()
      const retentionBufferRatio = Math.min(
        this.getZoomAdaptiveConfig(zoom).bufferRatio * TILE_RETENTION_BUFFER_MULTIPLIER,
        TILE_RETENTION_MAX_BUFFER_RATIO
      )

      return this.calculateTilesForZoom(zoom, {
        bounds: this.getCurrentBounds(),
        bufferRatio: retentionBufferRatio
      })
    },

    buildBufferedBounds(bounds, bufferRatio) {
      if (
        !bounds
        || !bounds.southwest
        || !bounds.northeast
        || !Number.isFinite(Number(bounds.southwest.latitude))
        || !Number.isFinite(Number(bounds.southwest.longitude))
        || !Number.isFinite(Number(bounds.northeast.latitude))
        || !Number.isFinite(Number(bounds.northeast.longitude))
      ) {
        return null
      }

      const latRange = bounds.northeast.latitude - bounds.southwest.latitude
      const lngRange = bounds.northeast.longitude - bounds.southwest.longitude

      return {
        southwest: {
          latitude: bounds.southwest.latitude - latRange * bufferRatio,
          longitude: bounds.southwest.longitude - lngRange * bufferRatio
        },
        northeast: {
          latitude: bounds.northeast.latitude + latRange * bufferRatio,
          longitude: bounds.northeast.longitude + lngRange * bufferRatio
        }
      }
    },

    calculateTilesForZoom(zoom, options = {}) {
      const {
        bounds = this.getCurrentBounds(),
        bufferRatio
      } = options

      if (!bounds) {
        return []
      }

      const zoomConfig = this.getZoomAdaptiveConfig(zoom)
      const effectiveBufferRatio = Number.isFinite(Number(bufferRatio))
        ? Math.max(0, Number(bufferRatio))
        : zoomConfig.bufferRatio
      const bufferedBounds = this.buildBufferedBounds(bounds, effectiveBufferRatio)
      if (!bufferedBounds) {
        return []
      }

      const sourceBounds = this.convertMapBoundsToTileSource(bufferedBounds)
      let minTileX = Math.floor(this.longitudeToTileX(sourceBounds.southwest.longitude, zoom))
      let maxTileX = Math.ceil(this.longitudeToTileX(sourceBounds.northeast.longitude, zoom))
      let minTileY = Math.floor(this.latitudeToTileY(sourceBounds.northeast.latitude, zoom))
      let maxTileY = Math.ceil(this.latitudeToTileY(sourceBounds.southwest.latitude, zoom))

      const tileCoverage = this.getTileCoverage(zoom)
      if (tileCoverage) {
        minTileX = Math.max(minTileX, tileCoverage.minX)
        maxTileX = Math.min(maxTileX, tileCoverage.maxX)
        minTileY = Math.max(minTileY, tileCoverage.minY)
        maxTileY = Math.min(maxTileY, tileCoverage.maxY)
      }

      if (minTileX > maxTileX || minTileY > maxTileY) {
        return []
      }

      const tiles = []
      for (let x = minTileX; x <= maxTileX; x += 1) {
        for (let y = minTileY; y <= maxTileY; y += 1) {
          if (!this.isTileValid(x, y, zoom)) {
            continue
          }

          const tile = this.createTileObject(x, y, zoom)
          if (tile) {
            tiles.push(tile)
          }
        }
      }

      return tiles
    },

    createTileObject(x, y, z) {
      const tileCoverage = this.getTileCoverage(z)
      if (
        tileCoverage
        && (x < tileCoverage.minX || x > tileCoverage.maxX || y < tileCoverage.minY || y > tileCoverage.maxY)
      ) {
        return null
      }

      const tileUrl = this.getTileUrl(x, y, z)
      if (!tileUrl) {
        return null
      }

      return {
        x,
        y,
        z,
        id: z * 1000000000000 + x * 1000000 + y,
        stringId: `tile-${z}-${x}-${y}`,
        url: tileUrl,
        bounds: this.tileToLatLngBounds(x, y, z)
      }
    },

    isTileValid(x, y, z) {
      const maxTileNum = Math.pow(2, z)
      return x >= 0 && x < maxTileNum && y >= 0 && y < maxTileNum
    },

    getTileUrl(x, y, z) {
      const config = this.getResolvedTileConfig()
      const zoomBaseUrlRule = config.zoomBaseUrlMap ? config.zoomBaseUrlMap[z] : null
      const urlTemplate = typeof config.urlTemplate === 'string' ? config.urlTemplate.trim() : ''
      const requestY = this.getTileRequestY(y, z)
      const tmsY = Math.pow(2, z) - 1 - y
      let resolvedUrl = ''

      if (typeof zoomBaseUrlRule === 'string' && zoomBaseUrlRule) {
        const normalizedBaseUrl = zoomBaseUrlRule.endsWith('/') ? zoomBaseUrlRule : `${zoomBaseUrlRule}/`
        resolvedUrl = `${normalizedBaseUrl}${z}/${x}/${requestY}.${config.tileFormat}`
      } else if (Array.isArray(zoomBaseUrlRule) && zoomBaseUrlRule.length) {
        const matchedRule = zoomBaseUrlRule.find((rule) => {
          const minX = Number(rule?.minX)
          const maxX = Number(rule?.maxX)
          return Number.isFinite(minX) && Number.isFinite(maxX) && x >= minX && x <= maxX
        })

        if (matchedRule?.baseUrl) {
          const normalizedBaseUrl = String(matchedRule.baseUrl).endsWith('/')
            ? String(matchedRule.baseUrl)
            : `${String(matchedRule.baseUrl)}/`
          resolvedUrl = `${normalizedBaseUrl}${z}/${x}/${requestY}.${config.tileFormat}`
        }
      }

      if (!resolvedUrl && urlTemplate) {
        resolvedUrl = urlTemplate
          .replace(/\{z\}/g, String(z))
          .replace(/\{x\}/g, String(x))
          .replace(/\{y\}/g, String(requestY))
          .replace(/\{xyzY\}/g, String(y))
          .replace(/\{tmsY\}/g, String(tmsY))
          .replace(/\{format\}/g, config.tileFormat)
      } else if (!resolvedUrl && config.baseUrl) {
        const normalizedBaseUrl = config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`
        resolvedUrl = `${normalizedBaseUrl}${z}/${x}/${requestY}.${config.tileFormat}`
      }

      if (!resolvedUrl) {
        if (!this._missingTileSourceWarned) {
          this._missingTileSourceWarned = true
          console.warn('[tile-overlay] invalid tile source config')
        }
        return ''
      }

      return resolvedUrl
    },

    getZoomLevel() {
      const config = this.getResolvedTileConfig()
      const allowedZooms = config.allowedZooms
      const rawScale = Number(this.currentScale || this.properties.scale || config.minZoom)
      let zoom = Math.round(rawScale)

      if (allowedZooms && allowedZooms.length) {
        zoom = this.findNearestAllowedZoom(zoom, allowedZooms)
      } else {
        zoom = Math.max(config.minZoom, Math.min(config.maxZoom, zoom))
      }

      return zoom
    },

    findNearestAllowedZoom(targetZoom, allowedZooms) {
      let nearestZoom = allowedZooms[0]
      let minDiff = Math.abs(targetZoom - nearestZoom)

      for (const zoom of allowedZooms) {
        const diff = Math.abs(targetZoom - zoom)
        if (diff < minDiff) {
          minDiff = diff
          nearestZoom = zoom
        }
      }

      return nearestZoom
    },

    getZoomAdaptiveConfig(zoom) {
      return getZoomConfig(zoom)
    },

    getCurrentBounds() {
      return this.dynamicBounds || this.getConfiguredBounds()
    },

    updateBounds(bounds) {
      this.dynamicBounds = bounds
      this.scheduleUpdateTiles('bounds')
    },

    pickTilePrefetchCandidates(tiles, maxCount) {
      if (!Array.isArray(tiles) || !tiles.length || maxCount <= 0) {
        return []
      }

      if (tiles.length <= maxCount) {
        return tiles.slice()
      }

      let minTileX = Number.POSITIVE_INFINITY
      let maxTileX = Number.NEGATIVE_INFINITY
      let minTileY = Number.POSITIVE_INFINITY
      let maxTileY = Number.NEGATIVE_INFINITY

      tiles.forEach((tile) => {
        minTileX = Math.min(minTileX, tile.x)
        maxTileX = Math.max(maxTileX, tile.x)
        minTileY = Math.min(minTileY, tile.y)
        maxTileY = Math.max(maxTileY, tile.y)
      })

      const centerTileX = (minTileX + maxTileX) / 2
      const centerTileY = (minTileY + maxTileY) / 2

      return tiles
        .slice()
        .sort((left, right) => {
          const leftDistance = Math.abs(left.x - centerTileX) + Math.abs(left.y - centerTileY)
          const rightDistance = Math.abs(right.x - centerTileX) + Math.abs(right.y - centerTileY)
          return leftDistance - rightDistance
        })
        .slice(0, maxCount)
    },

    prefetchTileSources(tiles, requestId = 0) {
      const filteredTiles = (tiles || []).filter((tile) => {
        const sourceUrl = normalizeStringValue(tile?.url)
        return sourceUrl
          && !this._activeTiles.has(sourceUrl)
          && !this._prefetchedTileSourceUrls.has(sourceUrl)
      })

      if (!filteredTiles.length) {
        return Promise.resolve()
      }

      let cursor = 0
      const workerCount = Math.max(1, Math.min(TILE_PREFETCH_CONCURRENCY, filteredTiles.length))
      const runWorker = async () => {
        while (cursor < filteredTiles.length) {
          if (requestId && requestId !== this._pendingTilePrefetchRequestId) {
            return
          }

          const currentIndex = cursor
          cursor += 1
          const tile = filteredTiles[currentIndex]
          const sourceUrl = normalizeStringValue(tile?.url)
          if (!sourceUrl || this._prefetchedTileSourceUrls.has(sourceUrl)) {
            continue
          }

          const pendingPromise = this._tileSourcePrefetchPromises.get(sourceUrl)
          if (pendingPromise) {
            await pendingPromise.catch(() => {})
            continue
          }

          const prefetchPromise = this.resolveTileSourceCandidates(tile)
            .then((sourceCandidates) => this.normalizeTileSourceCandidates(sourceCandidates))
            .then(() => {
              this._prefetchedTileSourceUrls.add(sourceUrl)
            })
            .catch(() => {})
            .finally(() => {
              this._tileSourcePrefetchPromises.delete(sourceUrl)
            })

          this._tileSourcePrefetchPromises.set(sourceUrl, prefetchPromise)
          await prefetchPromise
        }
      }

      return Promise.all(Array.from({ length: workerCount }, () => runWorker())).then(() => undefined)
    },

    scheduleTileSourcePrefetch(visibleTiles, requestId = 0) {
      if (!this.properties.visible || !Array.isArray(visibleTiles) || !visibleTiles.length) {
        return
      }

      const bounds = this.getCurrentBounds()
      if (!bounds) {
        return
      }

      const config = this.getResolvedTileConfig()
      const currentZoom = this.getZoomLevel()
      const allowedZoomSet = new Set(
        (Array.isArray(config.allowedZooms) && config.allowedZooms.length
          ? config.allowedZooms
          : [currentZoom]
        ).map((zoom) => Math.round(Number(zoom))).filter((zoom) => Number.isFinite(zoom))
      )

      const prefetchTiles = []
      const appendedSourceUrls = new Set(
        visibleTiles
          .map((tile) => normalizeStringValue(tile?.url))
          .filter(Boolean)
      )

      TILE_PREFETCH_SAME_ZOOM_RING_MULTIPLIERS.forEach((multiplier) => {
        const ringBufferRatio = Math.min(
          this.getZoomAdaptiveConfig(currentZoom).bufferRatio * multiplier,
          TILE_PREFETCH_SAME_ZOOM_MAX_BUFFER_RATIO
        )
        const ringTiles = this.prioritizeVisibleTiles(this.calculateTilesForZoom(currentZoom, {
          bounds,
          bufferRatio: ringBufferRatio
        }))
          .filter((tile) => {
            const sourceUrl = normalizeStringValue(tile?.url)
            return sourceUrl && !appendedSourceUrls.has(sourceUrl)
          })

        this.pickTilePrefetchCandidates(ringTiles, TILE_PREFETCH_MAX_TILES_PER_RING).forEach((tile) => {
          const sourceUrl = normalizeStringValue(tile?.url)
          if (!sourceUrl || appendedSourceUrls.has(sourceUrl)) {
            return
          }

          appendedSourceUrls.add(sourceUrl)
          prefetchTiles.push(tile)
        })
      })

      TILE_PREFETCH_ZOOM_OFFSETS.forEach((zoomOffset) => {
        const targetZoom = currentZoom + zoomOffset
        if (!allowedZoomSet.has(targetZoom)) {
          return
        }

        const zoomBufferRatio = Math.min(this.getZoomAdaptiveConfig(targetZoom).bufferRatio * 0.55, 0.12)
        const candidateTiles = this.calculateTilesForZoom(targetZoom, {
          bounds,
          bufferRatio: zoomBufferRatio
        })

        this.pickTilePrefetchCandidates(candidateTiles, TILE_PREFETCH_MAX_TILES_PER_ZOOM).forEach((tile) => {
          const sourceUrl = normalizeStringValue(tile?.url)
          if (!sourceUrl || appendedSourceUrls.has(sourceUrl)) {
            return
          }

          appendedSourceUrls.add(sourceUrl)
          prefetchTiles.push(tile)
        })
      })

      if (!prefetchTiles.length) {
        return
      }

      this._tilePrefetchRequestId += 1
      const prefetchRequestId = this._tilePrefetchRequestId
      this._pendingTilePrefetchRequestId = prefetchRequestId

      if (this.prefetchTimer) {
        clearTimeout(this.prefetchTimer)
      }

      this.prefetchTimer = setTimeout(() => {
        this.prefetchTimer = null
        if (requestId && requestId !== this._tileUpdateRequestId) {
          return
        }

        this.prefetchTileSources(prefetchTiles, prefetchRequestId)
      }, TILE_PREFETCH_DELAY_MS)
    },

    gcj02ToWgs84(gcjLng, gcjLat) {
      const a = 6378245.0
      const ee = 0.00669342162296594323
      if (this.isOutOfChina(gcjLng, gcjLat)) {
        return { longitude: gcjLng, latitude: gcjLat }
      }

      const dLat = this.transformLat(gcjLng - 105.0, gcjLat - 35.0)
      const dLng = this.transformLng(gcjLng - 105.0, gcjLat - 35.0)
      const radLat = gcjLat / 180.0 * Math.PI
      let magic = Math.sin(radLat)
      magic = 1 - ee * magic * magic
      const sqrtMagic = Math.sqrt(magic)
      const dLatRad = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI)
      const dLngRad = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI)

      return {
        longitude: gcjLng - dLngRad,
        latitude: gcjLat - dLatRad
      }
    },

    wgs84ToGcj02(wgsLng, wgsLat) {
      const a = 6378245.0
      const ee = 0.00669342162296594323
      if (this.isOutOfChina(wgsLng, wgsLat)) {
        return { longitude: wgsLng, latitude: wgsLat }
      }

      const dLat = this.transformLat(wgsLng - 105.0, wgsLat - 35.0)
      const dLng = this.transformLng(wgsLng - 105.0, wgsLat - 35.0)
      const radLat = wgsLat / 180.0 * Math.PI
      let magic = Math.sin(radLat)
      magic = 1 - ee * magic * magic
      const sqrtMagic = Math.sqrt(magic)
      const dLatRad = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI)
      const dLngRad = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI)

      return {
        longitude: wgsLng + dLngRad,
        latitude: wgsLat + dLatRad
      }
    },

    transformLat(x, y) {
      let result = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
      result += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0
      result += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0
      result += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0
      return result
    },

    transformLng(x, y) {
      let result = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
      result += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0
      result += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0
      result += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0
      return result
    },

    isOutOfChina(lng, lat) {
      return (lng < 72.004 || lng > 137.8347) || (lat < 0.8293 || lat > 55.8271)
    },

    convertMapPointToTileSource(longitude, latitude) {
      if (this.getResolvedTileConfig().coordinateSystem === 'gcj02') {
        return { longitude, latitude }
      }

      return this.gcj02ToWgs84(longitude, latitude)
    },

    convertTileSourcePointToMap(longitude, latitude) {
      if (this.getResolvedTileConfig().coordinateSystem === 'gcj02') {
        return { longitude, latitude }
      }

      return this.wgs84ToGcj02(longitude, latitude)
    },

    convertMapBoundsToTileSource(bounds) {
      return {
        southwest: this.convertMapPointToTileSource(bounds.southwest.longitude, bounds.southwest.latitude),
        northeast: this.convertMapPointToTileSource(bounds.northeast.longitude, bounds.northeast.latitude)
      }
    },

    longitudeToTileX(longitude, zoom) {
      return (longitude + 180) / 360 * Math.pow(2, zoom)
    },

    latitudeToTileY(latitude, zoom) {
      const latRad = latitude * Math.PI / 180
      return (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom)
    },

    getTileRequestY(y, z) {
      if (this.getResolvedTileConfig().tileScheme === 'tms') {
        return Math.pow(2, z) - 1 - y
      }

      return y
    },

    tileToSourceBounds(x, y, z) {
      const n = Math.pow(2, z)
      const lngMin = x / n * 360 - 180
      const lngMax = (x + 1) / n * 360 - 180
      const latMin = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI
      const latMax = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI

      return {
        southwest: { latitude: latMin, longitude: lngMin },
        northeast: { latitude: latMax, longitude: lngMax }
      }
    },

    tileToLatLngBounds(x, y, z) {
      const sourceBounds = this.tileToSourceBounds(x, y, z)
      const southwest = this.convertTileSourcePointToMap(
        sourceBounds.southwest.longitude,
        sourceBounds.southwest.latitude
      )
      const northeast = this.convertTileSourcePointToMap(
        sourceBounds.northeast.longitude,
        sourceBounds.northeast.latitude
      )

      return {
        southwest: { latitude: southwest.latitude, longitude: southwest.longitude },
        northeast: { latitude: northeast.latitude, longitude: northeast.longitude }
      }
    },

    scheduleUpdateTiles(trigger) {
      if (this.updateTimer) {
        clearTimeout(this.updateTimer)
      }

      const delay = trigger === 'bounds' ? 70 : 90
      this.updateTimer = setTimeout(() => {
        this.updateTimer = null
        this.updateTiles()
      }, delay)
    }
  },

  observers: {
    mapCtx(mapCtx) {
      if (mapCtx && typeof mapCtx === 'object') {
        setTimeout(() => {
          this.initTileOverlay()
        }, 80)
      }
    },

    'bounds, tileServerConfig, tileOpacity, tileZIndex, allowedZooms': function() {
      if (!this.properties.mapCtx || !this._activeTiles) {
        return
      }

      this.clearAllTiles()
      this.dynamicBounds = null
      this._missingTileSourceWarned = false
      this.scheduleUpdateTiles('bounds')
    }
  }
})
