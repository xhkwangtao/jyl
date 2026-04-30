const assert = require('node:assert/strict')

const tests = []
const componentModulePath = require.resolve('../../miniprogram/components/tile-overlay/tile-overlay.js')

function test(name, run) {
  tests.push({ name, run })
}

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve))
}

function loadComponentDefinition() {
  const previousComponent = global.Component
  const previousWx = global.wx
  let componentDefinition = null

  global.wx = {
    env: {
      USER_DATA_PATH: 'wxfile://usr'
    }
  }
  global.Component = (definition) => {
    componentDefinition = definition
  }

  delete require.cache[componentModulePath]
  require(componentModulePath)
  delete require.cache[componentModulePath]

  if (previousComponent === undefined) {
    delete global.Component
  } else {
    global.Component = previousComponent
  }

  return {
    componentDefinition,
    restore() {
      if (previousWx === undefined) {
        delete global.wx
      } else {
        global.wx = previousWx
      }
    }
  }
}

function createComponentInstance(componentDefinition, properties = {}) {
  const normalizedProperties = {}
  Object.keys(componentDefinition.properties || {}).forEach((key) => {
    normalizedProperties[key] = componentDefinition.properties[key].value
  })

  const instance = {
    properties: {
      ...normalizedProperties,
      ...properties
    },
    data: {
      ...(componentDefinition.data || {})
    },
    setData(patch = {}) {
      this.data = {
        ...this.data,
        ...patch
      }
    },
    triggerEvent() {}
  }

  Object.entries(componentDefinition.methods || {}).forEach(([name, handler]) => {
    instance[name] = handler.bind(instance)
  })

  return instance
}

test('stale tile loads are retained when still required by the latest viewport', async () => {
  const { componentDefinition, restore } = loadComponentDefinition()
  const instance = createComponentInstance(componentDefinition)

  try {
    componentDefinition.lifetimes.attached.call(instance)
    instance.data.updateDebounceDelay = 0
    instance.properties.mapCtx = {
      addGroundOverlay() {},
      removeGroundOverlay() {},
      getScale({ success } = {}) {
        if (typeof success === 'function') {
          success({
            scale: 18
          })
        }
      },
      getRegion({ success } = {}) {
        if (typeof success === 'function') {
          success({
            southwest: {
              latitude: 40.48,
              longitude: 116.48
            },
            northeast: {
              latitude: 40.49,
              longitude: 116.49
            }
          })
        }
      }
    }

    const requiredTile = {
      x: 1,
      y: 2,
      z: 18,
      id: 18001002,
      overlayId: 501,
      stringId: 'tile-18-1-2',
      url: 'https://example.com/18/1/2.png',
      bounds: {}
    }

    let loadCallCount = 0
    let resolveFirstLoad = null
    const removedOverlayIds = []

    instance.setLoadingState = () => {}
    instance.calculateVisibleTiles = () => [requiredTile]
    instance.calculateRetainedTiles = () => []
    instance.pruneActiveTileCache = () => new Map()
    instance.scheduleTileSourcePrefetch = () => {}
    instance.removeOverlayEntries = (overlayEntries) => {
      const overlayIds = overlayEntries instanceof Map
        ? Array.from(overlayEntries.values())
        : Array.isArray(overlayEntries)
          ? overlayEntries
          : []
      removedOverlayIds.push(...overlayIds)
    }
    instance.scheduleUpdateTiles = () => {
      setImmediate(() => {
        instance.updateTiles()
      })
    }
    instance.loadTilesDirectly = () => {
      loadCallCount += 1
      if (loadCallCount === 1) {
        return new Promise((resolve) => {
          resolveFirstLoad = resolve
        })
      }

      return Promise.resolve({
        loadedTiles: [],
        failedTiles: []
      })
    }

    instance.updateTiles()
    instance.updateTiles()

    assert.equal(loadCallCount, 1)
    assert.ok(resolveFirstLoad, 'expected first tile load request to be pending')

    resolveFirstLoad({
      loadedTiles: [requiredTile],
      failedTiles: []
    })

    await flushAsyncWork()
    await flushAsyncWork()
    await flushAsyncWork()

    assert.equal(loadCallCount, 1)
    assert.deepEqual(removedOverlayIds, [])
    assert.equal(instance._activeTiles.get(requiredTile.url), requiredTile.overlayId)
  } finally {
    restore()
  }
})

test('invalidateNativeOverlays clears active overlay bookkeeping but keeps local tile caches', () => {
  const { componentDefinition, restore } = loadComponentDefinition()
  const instance = createComponentInstance(componentDefinition)

  try {
    componentDefinition.lifetimes.attached.call(instance)

    instance._activeTiles.set('https://example.com/18/1/2.png', 501)
    instance._activeTileMeta.set('https://example.com/18/1/2.png', {
      overlayId: 501
    })
    instance._tileLocalPathCache.set('https://example.com/18/1/2.png', 'wxfile://usr/jyl-ground-tiles/18/1/2.png')
    instance._lastVisibleTileSignature = 'tile-18-1-2'
    instance._failedTiles.set('tile-18-1-2', {
      stringId: 'tile-18-1-2'
    })

    instance.invalidateNativeOverlays()

    assert.equal(instance._activeTiles.size, 0)
    assert.equal(instance._activeTileMeta.size, 0)
    assert.equal(instance._failedTiles.size, 0)
    assert.equal(instance._lastVisibleTileSignature, '')
    assert.equal(
      instance._tileLocalPathCache.get('https://example.com/18/1/2.png'),
      'wxfile://usr/jyl-ground-tiles/18/1/2.png'
    )
  } finally {
    restore()
  }
})

test('restoreNativeOverlaysFromCache reattaches previous visible tiles from local cache', async () => {
  const { componentDefinition, restore } = loadComponentDefinition()
  const instance = createComponentInstance(componentDefinition, {
    visible: true
  })

  try {
    const addedOverlays = []

    componentDefinition.lifetimes.attached.call(instance)
    instance.properties.mapCtx = {
      addGroundOverlay({ id, src, bounds, visible, opacity, zIndex, success } = {}) {
        addedOverlays.push({
          id,
          src,
          bounds,
          visible,
          opacity,
          zIndex
        })
        if (typeof success === 'function') {
          success()
        }
      },
      removeGroundOverlay() {}
    }
    instance.getResolvedTileConfig = () => ({
      opacity: 0.96,
      zIndex: 1
    })

    const sourceUrl = 'https://example.com/18/1/2.png'
    const cachedLocalPath = 'wxfile://usr/jyl-ground-tiles/remote/example.com/18/1/2.png'
    const tileMeta = {
      url: sourceUrl,
      stringId: 'tile-18-1-2',
      x: 1,
      y: 2,
      z: 18,
      bounds: {
        southwest: {
          latitude: 40.48,
          longitude: 116.48
        },
        northeast: {
          latitude: 40.49,
          longitude: 116.49
        }
      }
    }

    instance._activeTiles.set(sourceUrl, 501)
    instance._activeTileMeta.set(sourceUrl, tileMeta)
    instance._tileLocalPathCache.set(sourceUrl, cachedLocalPath)
    instance.calculateVisibleTiles = () => [{
      ...tileMeta
    }]

    instance.invalidateNativeOverlays({
      preserveActiveTileSnapshot: true
    })

    assert.equal(instance._activeTiles.size, 0)
    assert.equal(instance._restorableTileMeta.size, 1)

    const result = await instance.restoreNativeOverlaysFromCache()

    assert.equal(result.restoredTiles.length, 1)
    assert.equal(result.failedTiles.length, 0)
    assert.equal(addedOverlays.length, 1)
    assert.equal(addedOverlays[0].src, cachedLocalPath)
    assert.equal(addedOverlays[0].visible, true)
    assert.equal(instance._activeTiles.size, 1)
    assert.ok(instance._activeTiles.get(sourceUrl))
  } finally {
    restore()
  }
})

test('captured tile snapshot can be restored by a fresh tile overlay instance', async () => {
  const { componentDefinition, restore } = loadComponentDefinition()
  const sourceInstance = createComponentInstance(componentDefinition, {
    visible: true
  })
  const restoreInstance = createComponentInstance(componentDefinition, {
    visible: true
  })

  try {
    const addedOverlays = []
    const sourceUrl = 'https://example.com/18/1/2.png'
    const cachedLocalPath = 'wxfile://usr/jyl-ground-tiles/remote/example.com/18/1/2.png'
    const visibleTile = {
      url: sourceUrl,
      stringId: 'tile-18-1-2',
      x: 1,
      y: 2,
      z: 18,
      bounds: {
        southwest: {
          latitude: 40.48,
          longitude: 116.48
        },
        northeast: {
          latitude: 40.49,
          longitude: 116.49
        }
      }
    }

    componentDefinition.lifetimes.attached.call(sourceInstance)
    sourceInstance.calculateVisibleTiles = () => [visibleTile]
    sourceInstance._activeTiles.set(sourceUrl, 501)
    sourceInstance._activeTileMeta.set(sourceUrl, {
      ...visibleTile,
      overlayId: 501,
      lastVisibleAt: Date.now()
    })
    sourceInstance._tileLocalPathCache.set(sourceUrl, cachedLocalPath)

    const snapshot = sourceInstance.captureVisibleTileSnapshot()

    componentDefinition.lifetimes.attached.call(restoreInstance)
    restoreInstance.properties.mapCtx = {
      addGroundOverlay({ id, src, bounds, visible, opacity, zIndex, success } = {}) {
        addedOverlays.push({
          id,
          src,
          bounds,
          visible,
          opacity,
          zIndex
        })
        if (typeof success === 'function') {
          success()
        }
      },
      removeGroundOverlay() {}
    }
    restoreInstance.getResolvedTileConfig = () => ({
      opacity: 0.96,
      zIndex: 1
    })

    restoreInstance.primeRestorableTileSnapshot(snapshot)
    const result = await restoreInstance.restoreNativeOverlaysFromCache()

    assert.equal(snapshot.tiles.length, 1)
    assert.equal(snapshot.tiles[0].sourceCandidates[0], cachedLocalPath)
    assert.equal(result.restoredTiles.length, 1)
    assert.equal(result.failedTiles.length, 0)
    assert.equal(addedOverlays.length, 1)
    assert.equal(addedOverlays[0].src, cachedLocalPath)
    assert.ok(restoreInstance._activeTiles.get(sourceUrl))
  } finally {
    restore()
  }
})

test('resolveTileSourceCandidates returns the remote url immediately for first paint while local caching warms in background', async () => {
  const { componentDefinition, restore } = loadComponentDefinition()
  const instance = createComponentInstance(componentDefinition)

  try {
    componentDefinition.lifetimes.attached.call(instance)

    let warmupCallCount = 0
    let releaseWarmup = null
    instance.resolveTileRuntimeSrc = () => {
      warmupCallCount += 1
      return new Promise((resolve) => {
        releaseWarmup = resolve
      })
    }

    const sourceUrl = 'https://example.com/18/1/2.png'
    const sourceCandidates = await instance.resolveTileSourceCandidates({
      url: sourceUrl
    })

    assert.deepEqual(sourceCandidates, [sourceUrl])
    assert.equal(warmupCallCount, 1)
    assert.equal(typeof releaseWarmup, 'function')

    releaseWarmup('wxfile://usr/jyl-ground-tiles/remote/example.com/18/1/2.png')
    await flushAsyncWork()
  } finally {
    restore()
  }
})

test('prioritizeVisibleTiles sorts tiles from viewport center outward for faster first paint', () => {
  const { componentDefinition, restore } = loadComponentDefinition()
  const instance = createComponentInstance(componentDefinition)

  try {
    componentDefinition.lifetimes.attached.call(instance)

    const sortedTiles = instance.prioritizeVisibleTiles([
      { x: 10, y: 10, stringId: 'top-left' },
      { x: 11, y: 10, stringId: 'top-right' },
      { x: 10, y: 11, stringId: 'bottom-left' },
      { x: 11, y: 11, stringId: 'bottom-right' },
      { x: 9, y: 11, stringId: 'outer-left' }
    ])

    assert.equal(sortedTiles[sortedTiles.length - 1].stringId, 'outer-left')
    assert.deepEqual(
      new Set(sortedTiles.slice(0, 4).map((tile) => tile.stringId)),
      new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    )
  } finally {
    restore()
  }
})

test('calculateVisibleTiles uses the current viewport only so on-screen tiles load before outer rings', () => {
  const { componentDefinition, restore } = loadComponentDefinition()
  const instance = createComponentInstance(componentDefinition)

  try {
    componentDefinition.lifetimes.attached.call(instance)
    let receivedOptions = null

    instance.getZoomLevel = () => 18
    instance.getCurrentBounds = () => ({
      southwest: { latitude: 40.48, longitude: 116.48 },
      northeast: { latitude: 40.49, longitude: 116.49 }
    })
    instance.calculateTilesForZoom = (_zoom, options = {}) => {
      receivedOptions = options
      return []
    }

    instance.calculateVisibleTiles()

    assert.equal(receivedOptions.bufferRatio, 0)
  } finally {
    restore()
  }
})

test('scheduleTileSourcePrefetch prioritizes same-zoom outer rings before cross-zoom warmup', async () => {
  const { componentDefinition, restore } = loadComponentDefinition()
  const instance = createComponentInstance(componentDefinition, {
    visible: true
  })
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout

  try {
    componentDefinition.lifetimes.attached.call(instance)
    global.setTimeout = (handler) => {
      handler()
      return 1
    }
    global.clearTimeout = () => {}

    const prefetchTiles = []
    instance.getCurrentBounds = () => ({
      southwest: { latitude: 40.48, longitude: 116.48 },
      northeast: { latitude: 40.49, longitude: 116.49 }
    })
    instance.getResolvedTileConfig = () => ({
      allowedZooms: [17, 18, 19]
    })
    instance.getZoomLevel = () => 18
    instance.getZoomAdaptiveConfig = () => ({
      bufferRatio: 0.2
    })
    instance.calculateTilesForZoom = (zoom, options = {}) => {
      const bufferRatio = Number(options.bufferRatio || 0)
      if (zoom === 18 && Math.abs(bufferRatio - 0.08) < 0.0001) {
        return [
          { url: 'ring-1-a', x: 10, y: 10, stringId: 'ring-1-a' },
          { url: 'visible-a', x: 11, y: 10, stringId: 'visible-a' }
        ]
      }

      if (zoom === 18 && Math.abs(bufferRatio - 0.16) < 0.0001) {
        return [
          { url: 'ring-2-a', x: 12, y: 10, stringId: 'ring-2-a' },
          { url: 'ring-1-a', x: 10, y: 10, stringId: 'ring-1-a' }
        ]
      }

      if (zoom === 19) {
        return [
          { url: 'zoom-19-a', x: 20, y: 20, stringId: 'zoom-19-a' }
        ]
      }

      if (zoom === 17) {
        return [
          { url: 'zoom-17-a', x: 5, y: 5, stringId: 'zoom-17-a' }
        ]
      }

      return []
    }
    instance.pickTilePrefetchCandidates = (tiles) => tiles
    instance.prefetchTileSources = (tiles) => {
      prefetchTiles.push(...tiles)
      return Promise.resolve()
    }

    instance.scheduleTileSourcePrefetch([
      { url: 'visible-a', x: 11, y: 10, stringId: 'visible-a' }
    ])
    await flushAsyncWork()

    assert.deepEqual(
      prefetchTiles.map((tile) => tile.url),
      ['ring-1-a', 'ring-2-a', 'zoom-19-a', 'zoom-17-a']
    )
  } finally {
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
    restore()
  }
})

module.exports = tests
