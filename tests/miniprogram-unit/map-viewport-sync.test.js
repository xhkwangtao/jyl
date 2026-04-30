const assert = require('node:assert/strict')

const tests = []
const pageModulePath = require.resolve('../../miniprogram/subpackages/guide/pages/map/map.js')

function test(name, run) {
  tests.push({ name, run })
}

function wait(delayMs = 0) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function loadPageDefinition() {
  const previousPage = global.Page
  const previousWx = global.wx
  let pageDefinition = null

  global.wx = {
    getStorageSync() {
      return ''
    },
    setStorageSync() {},
    getSystemInfoSync() {
      return {}
    },
    getNetworkType({ success } = {}) {
      if (typeof success === 'function') {
        success({
          networkType: ''
        })
      }
    }
  }

  global.Page = (definition) => {
    pageDefinition = definition
  }

  delete require.cache[pageModulePath]
  require(pageModulePath)
  delete require.cache[pageModulePath]

  if (previousPage === undefined) {
    delete global.Page
  } else {
    global.Page = previousPage
  }

  return {
    pageDefinition,
    restore() {
      if (previousWx === undefined) {
        delete global.wx
      } else {
        global.wx = previousWx
      }
    }
  }
}

function createPageInstance(pageDefinition, data = {}) {
  const instance = {
    data: {
      ...(pageDefinition.data || {}),
      ...data
    },
    setDataCalls: [],
    setData(patch = {}) {
      this.setDataCalls.push(patch)
      this.data = {
        ...this.data,
        ...patch
      }
    }
  }

  Object.entries(pageDefinition).forEach(([key, value]) => {
    if (typeof value === 'function') {
      instance[key] = value.bind(instance)
    }
  })

  return instance
}

test('syncViewportFromMapContext ignores tiny center drift to avoid viewport feedback loops', () => {
  const { pageDefinition, restore } = loadPageDefinition()
  const instance = createPageInstance(pageDefinition, {
    longitude: 116.491722,
    latitude: 40.491364,
    scale: 18
  })

  try {
    instance.mapCtx = {
      getCenterLocation({ success } = {}) {
        if (typeof success === 'function') {
          success({
            longitude: 116.4917224,
            latitude: 40.4913643
          })
        }
      }
    }
    instance.clampScaleToAllowedZooms = (scale) => Number(scale)
    instance.getDefaultMapScale = () => 18

    instance.syncViewportFromMapContext({
      scale: 18
    })

    assert.deepEqual(instance.setDataCalls, [])
    assert.equal(instance.pendingViewportSyncUpdate, undefined)
  } finally {
    restore()
  }
})

test('onRegionChange still refreshes overlay for update events without marking the viewport as user-adjusted', () => {
  const { pageDefinition, restore } = loadPageDefinition()
  const instance = createPageInstance(pageDefinition, {
    scale: 18
  })

  try {
    let syncCallCount = 0
    let refreshCallCount = 0

    instance.syncViewportFromMapContext = () => {
      syncCallCount += 1
    }
    instance.refreshGroundTileOverlayViewport = () => {
      refreshCallCount += 1
    }

    instance.onRegionChange({
      detail: {
        type: 'end',
        causedBy: 'update',
        scale: 18
      }
    })

    assert.equal(syncCallCount, 1)
    assert.equal(refreshCallCount, 1)
    assert.equal(instance.userAdjustedViewport, undefined)
  } finally {
    restore()
  }
})

test('onMapReady does not manually reinitialize tile overlay after mapCtx binding', async () => {
  const { pageDefinition, restore } = loadPageDefinition()
  const instance = createPageInstance(pageDefinition, {
    mapCtx: null,
    scale: 18
  })

  try {
    const mapCtx = {}
    let tileOverlayInitCount = 0

    instance.selectComponent = (selector) => {
      if (selector === '#guideMapCore') {
        return {
          getMapContext() {
            return mapCtx
          }
        }
      }

      if (selector === '#tileOverlay') {
        return {
          properties: {},
          initTileOverlay() {
            tileOverlayInitCount += 1
          }
        }
      }

      return null
    }
    instance.isGroundTileOverlayEnabled = () => true
    instance.ensureCustomTileLayerReady = () => Promise.resolve()
    instance.refreshGroundTileOverlayViewport = () => {}
    instance.pendingViewportFocus = null

    instance.onMapReady()
    await wait(180)

    assert.equal(instance.data.mapCtx, mapCtx)
    assert.equal(tileOverlayInitCount, 0)
  } finally {
    restore()
  }
})

test('getDefaultMapScale prefers the next lower overlay zoom for faster first paint', () => {
  const { pageDefinition, restore } = loadPageDefinition()
  const instance = createPageInstance(pageDefinition)

  try {
    instance.isGroundTileOverlayEnabled = () => true
    instance.groundTileOverlayConfig = {
      allowedZooms: [16, 17, 18, 19]
    }

    assert.equal(instance.getDefaultMapScale(), 18)
  } finally {
    restore()
  }
})

test('onShow restores cached tile overlays before requesting a precise viewport refresh', async () => {
  const { pageDefinition, restore } = loadPageDefinition()
  const instance = createPageInstance(pageDefinition)
  const snapshot = {
    capturedAt: Date.now(),
    tiles: [{
      url: 'https://example.com/18/1/2.png',
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
      },
      sourceCandidates: ['wxfile://usr/jyl-ground-tiles/remote/example.com/18/1/2.png']
    }]
  }
  const appInstance = {
    globalData: {
      guideMapTileOverlaySnapshot: snapshot
    }
  }
  const previousGetApp = global.getApp

  global.getApp = () => appInstance
  try {
    let invalidateCallCount = 0
    let primeCallCount = 0
    let restoreCallCount = 0
    let refreshCallCount = 0
    let invalidateOptions = null
    const refreshOptions = []

    instance.selectComponent = (selector) => {
      if (selector === '#tileOverlay') {
        return {
          invalidateNativeOverlays(options) {
            invalidateCallCount += 1
            invalidateOptions = options || null
          },
          primeRestorableTileSnapshot(value) {
            primeCallCount += 1
            assert.deepEqual(value, snapshot)
          },
          restoreNativeOverlaysFromCache() {
            restoreCallCount += 1
            return Promise.resolve()
          }
        }
      }

      return null
    }
    instance.refreshAudioAccessState = () => {}
    instance.prefetchMapFeatureAccess = () => {}
    instance.checkLocationPermission = () => {}
    instance.checkPendingNavigationRequest = () => {}
    instance.ensureCustomTileLayerVisible = () => {}
    instance.refreshGroundTileOverlayViewport = (options) => {
      refreshCallCount += 1
      refreshOptions.push(options || null)
    }
    instance.isGroundTileOverlayEnabled = () => true
    instance.mapCtx = {}
    instance.data.navigationActive = false
    instance.data.audioPlaying = false

    instance.onShow()
    await wait(0)

    assert.equal(invalidateCallCount, 1)
    assert.equal(primeCallCount, 1)
    assert.equal(restoreCallCount, 1)
    assert.deepEqual(invalidateOptions, {
      preserveActiveTileSnapshot: true
    })
    assert.equal(refreshCallCount, 1)
    assert.deepEqual(refreshOptions[0], {
      immediate: true
    })
  } finally {
    if (previousGetApp === undefined) {
      delete global.getApp
    } else {
      global.getApp = previousGetApp
    }
    restore()
  }
})

test('onHide stores the visible tile snapshot and onMapReady restores it for a new page instance', async () => {
  const { pageDefinition, restore } = loadPageDefinition()
  const snapshot = {
    capturedAt: Date.now(),
    tiles: [{
      url: 'https://example.com/18/1/2.png',
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
      },
      sourceCandidates: ['wxfile://usr/jyl-ground-tiles/remote/example.com/18/1/2.png']
    }]
  }
  const appInstance = {
    globalData: {}
  }
  const previousGetApp = global.getApp

  global.getApp = () => appInstance

  try {
    const leavingInstance = createPageInstance(pageDefinition)
    leavingInstance.runtimeViewportState = {
      longitude: 116.498,
      latitude: 40.489,
      scale: 17
    }
    leavingInstance.selectComponent = (selector) => {
      if (selector === '#tileOverlay') {
        return {
          captureVisibleTileSnapshot() {
            return snapshot
          }
        }
      }

      return null
    }
    leavingInstance.stopNavigationTracking = () => {}
    leavingInstance.stopAutoAudioTracking = () => {}
    leavingInstance.setCustomTileLayerVisibility = () => {}
    leavingInstance.disableKeepScreenOn = () => {}
    leavingInstance.isGroundTileOverlayEnabled = () => true

    leavingInstance.onHide()

    assert.deepEqual(appInstance.globalData.guideMapTileOverlaySnapshot, snapshot)
    assert.deepEqual(appInstance.globalData.guideMapViewportState, {
      longitude: 116.498,
      latitude: 40.489,
      scale: 17
    })

    const enteringInstance = createPageInstance(pageDefinition, {
      mapCtx: null,
      scale: 18
    })
    const mapCtx = {}
    let primedSnapshot = null
    let restoreCallCount = 0
    let refreshCallCount = 0

    enteringInstance.selectComponent = (selector) => {
      if (selector === '#guideMapCore') {
        return {
          getMapContext() {
            return mapCtx
          }
        }
      }

      if (selector === '#tileOverlay') {
        return {
          properties: {},
          primeRestorableTileSnapshot(value) {
            primedSnapshot = value
          },
          restoreNativeOverlaysFromCache() {
            restoreCallCount += 1
            return Promise.resolve()
          }
        }
      }

      return null
    }
    enteringInstance.ensureCustomTileLayerReady = () => Promise.resolve()
    enteringInstance.refreshGroundTileOverlayViewport = () => {
      refreshCallCount += 1
    }
    enteringInstance.pendingViewportFocus = null
    enteringInstance.isGroundTileOverlayEnabled = () => true

    enteringInstance.onMapReady()
    await wait(0)

    assert.deepEqual(primedSnapshot, snapshot)
    assert.equal(restoreCallCount, 1)
    assert.equal(refreshCallCount, 1)
  } finally {
    if (previousGetApp === undefined) {
      delete global.getApp
    } else {
      global.getApp = previousGetApp
    }
    restore()
  }
})

test('onLoad initializes the map viewport from the persisted viewport when there is no direct entry target', () => {
  const { pageDefinition, restore } = loadPageDefinition()
  const appInstance = {
    globalData: {
      guideMapViewportState: {
        longitude: 116.498,
        latitude: 40.489,
        scale: 17
      }
    }
  }
  const previousGetApp = global.getApp

  global.getApp = () => appInstance

  try {
    const instance = createPageInstance(pageDefinition)
    instance.ensureGroundTilePackagesLoaded = () => Promise.resolve(false)
    instance.loadPublishedMapRuntimeData = () => Promise.resolve()
    instance.handleEntryRequest = () => {}
    const originalSetData = instance.setData
    instance.setData = function setDataWithCallback(patch = {}, callback) {
      originalSetData.call(this, patch)
      if (typeof callback === 'function') {
        callback()
      }
    }

    instance.onLoad({})

    assert.deepEqual(instance.runtimeViewportState, {
      longitude: 116.498,
      latitude: 40.489,
      scale: 17
    })
    assert.equal(instance.data.longitude, 116.498)
    assert.equal(instance.data.latitude, 40.489)
    assert.equal(instance.data.scale, 17)
  } finally {
    if (previousGetApp === undefined) {
      delete global.getApp
    } else {
      global.getApp = previousGetApp
    }
    restore()
  }
})

test('syncGroundTileOverlayAfterMount restores persisted tiles when the overlay mounts after package loading', async () => {
  const { pageDefinition, restore } = loadPageDefinition()
  const instance = createPageInstance(pageDefinition)
  const snapshot = {
    capturedAt: Date.now(),
    tiles: [{
      url: 'https://example.com/18/1/2.png',
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
      },
      sourceCandidates: ['wxfile://usr/jyl-ground-tiles/remote/example.com/18/1/2.png']
    }]
  }
  const appInstance = {
    globalData: {
      guideMapTileOverlaySnapshot: snapshot
    }
  }
  const previousGetApp = global.getApp

  global.getApp = () => appInstance

  try {
    let primeCallCount = 0
    let restoreCallCount = 0
    let refreshCallCount = 0

    instance.selectComponent = (selector) => {
      if (selector === '#tileOverlay') {
        return {
          properties: {},
          invalidateNativeOverlays() {},
          primeRestorableTileSnapshot(value) {
            primeCallCount += 1
            assert.deepEqual(value, snapshot)
          },
          restoreNativeOverlaysFromCache() {
            restoreCallCount += 1
            return Promise.resolve()
          }
        }
      }

      return null
    }
    instance.refreshGroundTileOverlayViewport = () => {
      refreshCallCount += 1
    }
    instance.isGroundTileOverlayEnabled = () => true
    instance.mapCtx = {}

    await instance.syncGroundTileOverlayAfterMount()

    assert.equal(primeCallCount, 1)
    assert.equal(restoreCallCount, 1)
    assert.equal(refreshCallCount, 1)
  } finally {
    if (previousGetApp === undefined) {
      delete global.getApp
    } else {
      global.getApp = previousGetApp
    }
    restore()
  }
})

test('refreshGroundTileOverlayViewport rebuilds tiles with the native map scale instead of stale page data', () => {
  const { pageDefinition, restore } = loadPageDefinition()
  const instance = createPageInstance(pageDefinition, {
    scale: 18
  })

  try {
    let updateBoundsCallCount = 0
    let scaleUsedForRefresh = null
    const tileOverlay = {
      properties: {},
      currentScale: null,
      updateBounds() {
        updateBoundsCallCount += 1
        scaleUsedForRefresh = this.currentScale
      }
    }

    instance.selectComponent = (selector) => {
      if (selector === '#tileOverlay') {
        return tileOverlay
      }

      return null
    }
    instance.isGroundTileOverlayEnabled = () => true
    instance.clampScaleToAllowedZooms = (scale) => Number(scale)
    instance.runtimeViewportState = {
      longitude: 116.491722,
      latitude: 40.491364,
      scale: 17
    }
    instance.mapCtx = {
      getScale({ success } = {}) {
        if (typeof success === 'function') {
          success({
            scale: 19
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

    instance.refreshGroundTileOverlayViewport({
      immediate: true
    })

    assert.equal(updateBoundsCallCount, 1)
    assert.equal(scaleUsedForRefresh, 19)
  } finally {
    restore()
  }
})

module.exports = tests
