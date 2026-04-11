const {
  JYL_MARKER_POINTS
} = require('../../config/jyl-map-data.js')

const MAP_INCLUDE_POINTS = JYL_MARKER_POINTS.map((point) => ({
  latitude: point.latitude,
  longitude: point.longitude
}))

const POINT_GUIDE_META = {
  'ticket-gate': {
    themeTag: '起点',
    themeTone: 'forest',
    stayText: '建议停留 5 分钟',
    shortHint: '入园后先确认路线与补给',
    sceneLine: '游客进入景区后的第一站，适合先辨认整体方向再开始游览。',
    guideTip: '建议从这里先看一遍景区全览，再决定先去步道还是直接向主楼方向前进。'
  },
  'trail-start': {
    themeTag: '步道',
    themeTone: 'teal',
    stayText: '建议停留 8 分钟',
    shortHint: '正式进入山间步道',
    sceneLine: '这里是由入口转入步道的重要节点，适合整理节奏后继续上行。',
    guideTip: '如果是第一次来，建议在这里短暂停留，确认前往营盘遗址和主楼的方向。'
  },
  'huoyanshan-camp-site': {
    themeTag: '遗址',
    themeTone: 'stone',
    stayText: '建议停留 10 分钟',
    shortHint: '沿线遗迹与地势看点',
    sceneLine: '更适合边走边看的一站，能感受到营盘遗址与沿线地势关系。',
    guideTip: '适合把这里作为途中停留点，拍照后继续向主楼推进，节奏会更顺。'
  },
  'jiuyanlou-main-tower': {
    themeTag: '主楼',
    themeTone: 'gold',
    stayText: '建议停留 15 分钟',
    shortHint: '九眼楼最具代表性的观景点',
    sceneLine: '九眼楼核心敌楼，通常是整段游览中最值得停留和观景的一站。',
    guideTip: '建议把这里作为重点停留点，抵达后多留几分钟远眺和拍照。'
  }
}

const DEFAULT_SCENIC_CENTER = buildCenter(MAP_INCLUDE_POINTS)
const DEFAULT_SCENIC_SCALE = 15

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

    return {
      id: point.id,
      latitude: point.latitude,
      longitude: point.longitude,
      width: isActive ? point.activeWidth : point.width,
      height: isActive ? point.activeHeight : point.height,
      iconPath: isActive ? point.activeMarkerIconPath : point.markerIconPath,
      label: buildMarkerLabel(point, isActive)
    }
  })
}

function getGuideMeta(point) {
  return POINT_GUIDE_META[point.key] || {
    themeTag: '景点',
    themeTone: 'teal',
    stayText: '建议停留 8 分钟',
    shortHint: point.description,
    sceneLine: point.description,
    guideTip: '点击景点卡片可切换地图焦点。'
  }
}

function getMarkerById(markerId) {
  return DISPLAY_MARKER_POINTS.find((item) => String(item.id) === String(markerId)) || null
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

function getPointOrderText(pointId) {
  const index = DISPLAY_MARKER_POINTS.findIndex((point) => String(point.id) === String(pointId))

  if (index < 0) {
    return ''
  }

  return `第 ${String(index + 1).padStart(2, '0')} 站`
}

function buildPointCards(selectedPointId) {
  return DISPLAY_MARKER_POINTS.map((point, index) => {
    const guideMeta = getGuideMeta(point)

    return {
      id: point.id,
      name: point.name,
      themeTag: guideMeta.themeTag,
      themeTone: guideMeta.themeTone,
      orderText: String(index + 1).padStart(2, '0'),
      isActive: String(point.id) === String(selectedPointId)
    }
  })
}

function buildSelectedPoint(point, userLocation) {
  if (!point) {
    return null
  }

  const distance = calculateDistanceMeters(userLocation, point)
  const guideMeta = getGuideMeta(point)

  return {
    ...point,
    themeTag: guideMeta.themeTag,
    themeTone: guideMeta.themeTone,
    stayText: guideMeta.stayText,
    sceneLine: guideMeta.sceneLine,
    guideTip: guideMeta.guideTip,
    sequenceText: getPointOrderText(point.id),
    distanceText: formatDistanceText(distance)
  }
}

function buildFocusSummary(selectedPoint, locationStatus) {
  if (!selectedPoint) {
    return {
      title: '九眼楼景区全览',
      subtitle: '点击下方景点卡片查看详情'
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
    subtitle: `${selectedPoint.themeTag} · 已切换到当前景点`
  }
}

const DISPLAY_MARKER_POINTS = JYL_MARKER_POINTS.map((point) => ({
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
    navigationBarTotalHeight: 64,
    safeAreaBottom: 20,
    longitude: DEFAULT_SCENIC_CENTER.longitude,
    latitude: DEFAULT_SCENIC_CENTER.latitude,
    scale: DEFAULT_SCENIC_SCALE,
    showLocation: false,
    markers: buildMarkers(DISPLAY_MARKER_POINTS, DEFAULT_SELECTED_POINT_ID),
    markerCount: DISPLAY_MARKER_POINTS.length,
    locationStatus: '默认景区视角',
    focusSummary: buildFocusSummary(null, '默认景区视角'),
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
      latitude: DEFAULT_SCENIC_CENTER.latitude,
      longitude: DEFAULT_SCENIC_CENTER.longitude,
      scale: DEFAULT_SCENIC_SCALE
    }, () => {
      if (initialPointId) {
        this.focusPointById(initialPointId)
      }
    })
  },

  onReady() {
    this.mapCtx = wx.createMapContext('jyl-map', this)
  },

  onUnload() {
    if (this.detailCardPulseTimer) {
      clearTimeout(this.detailCardPulseTimer)
      this.detailCardPulseTimer = null
    }
  },

  loadUserLocation(moveToUserLocation = false) {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const userLocation = {
          latitude: res.latitude,
          longitude: res.longitude
        }

        this.setData({
          userLocation,
          showLocation: true,
          locationStatus: '我的位置已开启',
          focusSummary: buildFocusSummary(this.data.selectedPoint, '我的位置已开启'),
          selectedPoint: buildSelectedPoint(this.data.selectedPoint, userLocation),
          pointCards: buildPointCards(this.data.selectedPoint?.id)
        })

        if (moveToUserLocation && this.mapCtx) {
          this.mapCtx.moveToLocation()
        }
      },
      fail: () => {
        this.setData({
          locationStatus: '未开启定位权限',
          focusSummary: buildFocusSummary(this.data.selectedPoint, '未开启定位权限')
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
    const selectedPoint = getMarkerById(pointId)

    if (!selectedPoint) {
      return
    }

    const detailPoint = buildSelectedPoint(selectedPoint, this.data.userLocation)

    this.setData({
      markers: buildMarkers(DISPLAY_MARKER_POINTS, selectedPoint.id),
      selectedPoint: detailPoint,
      focusSummary: buildFocusSummary(detailPoint, this.data.locationStatus),
      pointCards: buildPointCards(selectedPoint.id),
      latitude: selectedPoint.latitude,
      longitude: selectedPoint.longitude,
      scale: 16
    }, () => {
      if (revealDetail) {
        this.revealDetailCard()
      }
    })
  },

  onResetView() {
    this.setData({
      markers: buildMarkers(DISPLAY_MARKER_POINTS, null),
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
      scale: 18
    })
  }
})
