const {
  JYL_MARKER_POINTS,
  JYL_ROUTE,
  JYL_ROUTE_MARKER_POINTS,
  JYL_ROUTE_POLYLINES,
  JYL_MAP_META
} = require('../../config/jyl-map-data.js')

const MAP_INCLUDE_POINTS = [
  ...JYL_ROUTE.pathPoints,
  ...JYL_ROUTE_MARKER_POINTS.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude
  }))
]

const DEFAULT_SCENIC_CENTER = buildCenter(MAP_INCLUDE_POINTS)
const DEFAULT_SCENIC_SCALE = 13
const DEFAULT_ENTRY_POINT = JYL_ROUTE_MARKER_POINTS.find((point) => point.type === 'start') || JYL_ROUTE_MARKER_POINTS[0] || null
const DEFAULT_ENTRY_CENTER = DEFAULT_ENTRY_POINT
  ? {
    latitude: DEFAULT_ENTRY_POINT.latitude,
    longitude: DEFAULT_ENTRY_POINT.longitude
  }
  : DEFAULT_SCENIC_CENTER
const DEFAULT_ENTRY_SCALE = 17

function buildCenter(points) {
  const bounds = points.reduce((acc, point) => {
    return {
      minLatitude: Math.min(acc.minLatitude, point.latitude),
      maxLatitude: Math.max(acc.maxLatitude, point.latitude),
      minLongitude: Math.min(acc.minLongitude, point.longitude),
      maxLongitude: Math.max(acc.maxLongitude, point.longitude)
    }
  }, {
    minLatitude: Number.POSITIVE_INFINITY,
    maxLatitude: Number.NEGATIVE_INFINITY,
    minLongitude: Number.POSITIVE_INFINITY,
    maxLongitude: Number.NEGATIVE_INFINITY
  })

  return {
    latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
    longitude: (bounds.minLongitude + bounds.maxLongitude) / 2
  }
}

function buildMarkerLabel(point, isActive) {
  return {
    content: point.name,
    color: isActive ? '#FFFFFF' : '#17343D',
    fontSize: isActive ? 12 : 11,
    anchorX: 0,
    anchorY: -42,
    bgColor: isActive ? '#245F6D' : 'rgba(255, 253, 249, 0.96)',
    padding: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: isActive ? '#245F6D' : 'rgba(36, 72, 92, 0.14)'
  }
}

function buildActiveIconPath(iconPath) {
  if (typeof iconPath !== 'string') {
    return '/images/poi/icons/scenic-spot-selected.png'
  }

  return iconPath.replace(/(\.\w+)$/, '-selected$1')
}

function buildMarkers(markerPoints, selectedPointId) {
  return markerPoints.map((point) => {
    const isActive = String(point.id) === String(selectedPointId)

    const marker = {
      id: point.markerId,
      latitude: point.latitude,
      longitude: point.longitude,
      width: isActive ? point.activeWidth : point.width,
      height: isActive ? point.activeHeight : point.height,
      iconPath: isActive ? point.activeMarkerIconPath : point.markerIconPath
    }

    if (isActive) {
      marker.label = buildMarkerLabel(point, true)
    }

    return marker
  })
}

function getPointMeta(point) {
  return {
    themeTag: point.themeTag || '导览',
    themeTone: point.themeTone || 'teal',
    stayText: point.stayText || '建议停留 5 分钟',
    shortHint: point.shortHint || point.description,
    sceneLine: point.sceneLine || point.description,
    guideTip: point.guideTip || '点击下方导览点卡片可切换地图焦点。'
  }
}

function toRadians(deg) {
  return deg * Math.PI / 180
}

function calculateDistanceMeters(pointA, pointB) {
  if (!pointA || !pointB) {
    return null
  }

  const earthRadius = 6378137
  const deltaLat = toRadians(pointB.latitude - pointA.latitude)
  const deltaLng = toRadians(pointB.longitude - pointA.longitude)
  const lat1 = toRadians(pointA.latitude)
  const lat2 = toRadians(pointB.latitude)

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(earthRadius * c)
}

function formatDistanceText(distance) {
  if (typeof distance !== 'number') {
    return '未获取我的位置'
  }

  if (distance >= 1000) {
    return `距我 ${(distance / 1000).toFixed(2)} km`
  }

  return `距我 ${distance} m`
}

function buildPointCards(selectedPointId) {
  return DISPLAY_CARD_POINTS.map((point) => {
    const guideMeta = getPointMeta(point)

    return {
      id: point.id,
      name: point.name,
      themeTag: guideMeta.themeTag,
      themeTone: guideMeta.themeTone,
      orderText: point.orderText || '',
      isActive: String(point.id) === String(selectedPointId)
    }
  })
}

function buildSelectedPoint(point, userLocation) {
  if (!point) {
    return null
  }

  const distance = calculateDistanceMeters(userLocation, point)
  const guideMeta = getPointMeta(point)

  return {
    ...point,
    themeTag: guideMeta.themeTag,
    themeTone: guideMeta.themeTone,
    stayText: guideMeta.stayText,
    shortHint: guideMeta.shortHint,
    sceneLine: guideMeta.sceneLine,
    guideTip: guideMeta.guideTip,
    sequenceText: point.sequenceText || point.themeTag,
    distanceText: formatDistanceText(distance)
  }
}

function buildFocusSummary(selectedPoint, locationStatus) {
  if (!selectedPoint) {
    if (locationStatus === '入口视角') {
      return {
        title: DEFAULT_ENTRY_POINT?.name || '路线入口',
        subtitle: `入口视角 · ${JYL_MAP_META.markerCount} 个地图点位，${JYL_MAP_META.cardCount} 个打卡点`
      }
    }

    return {
      title: JYL_ROUTE.name,
      subtitle: locationStatus === '我的位置已开启'
        ? `${JYL_ROUTE.distanceText} · 已显示我的位置`
        : `${JYL_ROUTE.distanceText} · ${JYL_MAP_META.markerCount} 个地图点位，${JYL_MAP_META.cardCount} 个打卡点`
    }
  }

  if (locationStatus === '我的位置已开启') {
    return {
      title: selectedPoint.name,
      subtitle: `${selectedPoint.themeTag} · 已显示我的位置`
    }
  }

  return {
    title: selectedPoint.name,
    subtitle: `${selectedPoint.themeTag} · 已切换到当前导览点`
  }
}

function createDisplayPoint(point) {
  return {
    ...point,
    width: point.type === 'start' ? 34 : 32,
    height: point.type === 'start' ? 34 : 32,
    activeWidth: point.type === 'start' ? 42 : 40,
    activeHeight: point.type === 'start' ? 42 : 40,
    markerIconPath: point.iconPath,
    activeMarkerIconPath: buildActiveIconPath(point.iconPath)
  }
}

function isBaseMapMarker(point) {
  return point.type !== 'guide'
}

const ALL_ROUTE_DISPLAY_POINTS = JYL_ROUTE_MARKER_POINTS.map(createDisplayPoint)

const BASE_ROUTE_DISPLAY_POINTS = ALL_ROUTE_DISPLAY_POINTS.filter(isBaseMapMarker)

function getMapMarkerPoints(selectedPointId) {
  if (!selectedPointId) {
    return BASE_ROUTE_DISPLAY_POINTS
  }

  const selectedPoint = ALL_ROUTE_DISPLAY_POINTS.find((point) => String(point.id) === String(selectedPointId))
  if (!selectedPoint) {
    return BASE_ROUTE_DISPLAY_POINTS
  }

  const existsInBase = BASE_ROUTE_DISPLAY_POINTS.some((point) => String(point.id) === String(selectedPoint.id))
  if (existsInBase) {
    return BASE_ROUTE_DISPLAY_POINTS
  }

  return [...BASE_ROUTE_DISPLAY_POINTS, selectedPoint].sort((left, right) => left.routeIndex - right.routeIndex)
}

function getRouteMarkerById(markerId) {
  return ALL_ROUTE_DISPLAY_POINTS.find((item) => (
    String(item.id) === String(markerId) || String(item.markerId) === String(markerId)
  )) || null
}

const DISPLAY_CARD_POINTS = JYL_MARKER_POINTS.map((point) => ({
  ...point,
  width: 32,
  height: 32,
  activeWidth: 40,
  activeHeight: 40,
  markerIconPath: point.iconPath,
  activeMarkerIconPath: buildActiveIconPath(point.iconPath)
}))

const DEFAULT_SELECTED_POINT_ID = null

Page({
  data: {
    mapMounted: false,
    navigationBarTotalHeight: 64,
    safeAreaBottom: 20,
    longitude: DEFAULT_ENTRY_CENTER.longitude,
    latitude: DEFAULT_ENTRY_CENTER.latitude,
    scale: DEFAULT_ENTRY_SCALE,
    showLocation: false,
    routePolylines: [],
    markers: [],
    visibleMarkerCount: JYL_MAP_META.markerCount,
    cardCount: JYL_MAP_META.cardCount,
    routeDistanceText: JYL_ROUTE.distanceText,
    locationStatus: '入口视角',
    focusSummary: buildFocusSummary(null, '入口视角'),
    detailCardPulseClass: '',
    userLocation: null,
    selectedPoint: null,
    pointCards: buildPointCards(DEFAULT_SELECTED_POINT_ID)
  },

  onLoad(options = {}) {
    const systemInfo = wx.getSystemInfoSync()
    const safeArea = systemInfo.safeArea
    const menuButton = typeof wx.getMenuButtonBoundingClientRect === 'function'
      ? wx.getMenuButtonBoundingClientRect()
      : null
    const statusBarHeight = systemInfo.statusBarHeight || 20

    let navigationBarTotalHeight = statusBarHeight + 44
    if (menuButton) {
      navigationBarTotalHeight = statusBarHeight + (menuButton.top - statusBarHeight) * 2 + menuButton.height
    }

    const safeAreaBottom = safeArea
      ? Math.max(systemInfo.screenHeight - safeArea.bottom, 16)
      : 20

    const initialPointId = options.pointId || options.focusId || ''

    this.setData({
      navigationBarTotalHeight,
      safeAreaBottom,
      latitude: DEFAULT_ENTRY_CENTER.latitude,
      longitude: DEFAULT_ENTRY_CENTER.longitude,
      scale: DEFAULT_ENTRY_SCALE,
      locationStatus: '入口视角',
      focusSummary: buildFocusSummary(null, '入口视角')
    }, () => {
      if (initialPointId) {
        this.focusPointById(initialPointId)
      }
    })
  },

  onReady() {
    this.mapMountTimer = setTimeout(() => {
      this.setData({
        mapMounted: true
      }, () => {
        this.mapCtx = wx.createMapContext('jyl-map', this)
        this.initializeMapOverlays()
      })
    }, 80)
  },

  onUnload() {
    if (this.mapMountTimer) {
      clearTimeout(this.mapMountTimer)
      this.mapMountTimer = null
    }

    if (this.polylineTimer) {
      clearTimeout(this.polylineTimer)
      this.polylineTimer = null
    }

    if (this.markerTimer) {
      clearTimeout(this.markerTimer)
      this.markerTimer = null
    }

    if (this.detailCardPulseTimer) {
      clearTimeout(this.detailCardPulseTimer)
      this.detailCardPulseTimer = null
    }
  },

  initializeMapOverlays() {
    const selectedPointId = this.data.selectedPoint?.id || DEFAULT_SELECTED_POINT_ID

    this.polylineTimer = setTimeout(() => {
      this.setData({
        routePolylines: JYL_ROUTE_POLYLINES
      })
      this.polylineTimer = null
    }, 60)

    this.markerTimer = setTimeout(() => {
      this.setData({
        markers: buildMarkers(getMapMarkerPoints(selectedPointId), selectedPointId)
      })
      this.markerTimer = null
    }, 180)
  },

  loadUserLocation(moveToUserLocation = false) {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const userLocation = {
          latitude: res.latitude,
          longitude: res.longitude
        }

        const nextData = {
          userLocation,
          showLocation: true,
          locationStatus: '我的位置已开启',
          focusSummary: buildFocusSummary(this.data.selectedPoint, '我的位置已开启'),
          selectedPoint: buildSelectedPoint(this.data.selectedPoint, userLocation),
          pointCards: buildPointCards(this.data.selectedPoint?.id)
        }

        if (moveToUserLocation) {
          nextData.latitude = userLocation.latitude
          nextData.longitude = userLocation.longitude
          nextData.scale = 15
        }

        this.setData(nextData)
      },
      fail: (error) => {
        this.setData({
          locationStatus: '未开启定位权限',
          focusSummary: buildFocusSummary(this.data.selectedPoint, '未开启定位权限')
        })

        const message = typeof error?.errMsg === 'string' && error.errMsg.includes('timeout')
          ? '定位超时，请在开发者工具中设置模拟位置后重试'
          : '未获取到当前位置，请检查定位权限'

        wx.showToast({
          title: message,
          icon: 'none',
          duration: 2200
        })
      }
    })
  },

  onMarkerTap(event) {
    const markerId = event?.detail?.markerId
    this.focusPointById(markerId, true)
  },

  onPointCardTap(event) {
    const pointId = event?.currentTarget?.dataset?.id
    this.focusPointById(pointId, true)
  },

  focusPointById(pointId, revealDetail = false) {
    const selectedPoint = getRouteMarkerById(pointId)

    if (!selectedPoint) {
      return
    }

    const detailPoint = buildSelectedPoint(selectedPoint, this.data.userLocation)

    this.setData({
      markers: buildMarkers(getMapMarkerPoints(selectedPoint.id), selectedPoint.id),
      selectedPoint: detailPoint,
      focusSummary: buildFocusSummary(detailPoint, this.data.locationStatus),
      pointCards: buildPointCards(selectedPoint.id),
      latitude: selectedPoint.latitude,
      longitude: selectedPoint.longitude,
      scale: DEFAULT_ENTRY_SCALE
    }, () => {
      if (revealDetail) {
        this.revealDetailCard()
      }
    })
  },

  onResetView() {
    this.onShowOverview()
  },

  onFocusEntry() {
    this.setData({
      markers: buildMarkers(getMapMarkerPoints(null), null),
      showLocation: false,
      locationStatus: '入口视角',
      focusSummary: buildFocusSummary(null, '入口视角'),
      detailCardPulseClass: '',
      latitude: DEFAULT_ENTRY_CENTER.latitude,
      longitude: DEFAULT_ENTRY_CENTER.longitude,
      scale: DEFAULT_ENTRY_SCALE,
      selectedPoint: null,
      pointCards: buildPointCards(null)
    })
  },

  onShowOverview() {
    this.setData({
      markers: buildMarkers(getMapMarkerPoints(null), null),
      showLocation: false,
      locationStatus: '默认景区视角',
      focusSummary: buildFocusSummary(null, '默认景区视角'),
      detailCardPulseClass: '',
      latitude: DEFAULT_SCENIC_CENTER.latitude,
      longitude: DEFAULT_SCENIC_CENTER.longitude,
      scale: DEFAULT_SCENIC_SCALE,
      selectedPoint: null,
      pointCards: buildPointCards(null)
    })
  },

  revealDetailCard() {
    if (this.detailCardPulseTimer) {
      clearTimeout(this.detailCardPulseTimer)
      this.detailCardPulseTimer = null
    }

    this.setData({
      detailCardPulseClass: 'detail-card-enter'
    }, () => {
      const runScroll = () => {
        this.scrollToDetailCard()
      }

      if (typeof wx.nextTick === 'function') {
        wx.nextTick(runScroll)
      } else {
        setTimeout(runScroll, 80)
      }

      this.detailCardPulseTimer = setTimeout(() => {
        this.setData({
          detailCardPulseClass: ''
        })
        this.detailCardPulseTimer = null
      }, 700)
    })
  },

  scrollToDetailCard() {
    const query = wx.createSelectorQuery()
    query.select('#detail-card').boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec((result) => {
      const detailRect = result?.[0]
      const viewport = result?.[1]

      if (!detailRect || !viewport) {
        return
      }

      const targetTop = Math.max(
        0,
        viewport.scrollTop + detailRect.top - this.data.navigationBarTotalHeight - 24
      )

      wx.pageScrollTo({
        scrollTop: targetTop,
        duration: 420
      })
    })
  },

  onLocateMe() {
    this.loadUserLocation(true)
  },

  onNavigateToSelectedPoint() {
    const selectedPoint = this.data.selectedPoint

    if (!selectedPoint) {
      return
    }

    wx.openLocation({
      latitude: selectedPoint.latitude,
      longitude: selectedPoint.longitude,
      name: selectedPoint.name,
      address: selectedPoint.description,
      scale: 18,
      fail: (error) => {
        const message = typeof error?.errMsg === 'string' && error.errMsg.includes('timeout')
          ? '当前环境无法直接拉起导航，请在真机中重试'
          : '打开导航失败，请稍后重试'

        wx.showToast({
          title: message,
          icon: 'none',
          duration: 2200
        })
      }
    })
  }
})
