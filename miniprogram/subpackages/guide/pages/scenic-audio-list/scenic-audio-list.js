const mapRuntimeService = require('../../../../services/map-runtime-service')
const {
  checkCurrentLocationInScenicArea,
  buildScenicVideoAccessDeniedMessage
} = require('../../../../utils/scenic-location')

const DEFAULT_COVER_IMAGE = '/images/poi-detail/1.png'
const DEFAULT_POINT_ICON = '/images/poi/icons/scenic-spot.png'

function normalizeString(value) {
  return String(value || '').trim()
}

function safeDecodeURIComponent(value) {
  const rawValue = normalizeString(value)
  if (!rawValue) {
    return ''
  }

  try {
    return decodeURIComponent(rawValue)
  } catch (error) {
    return rawValue
  }
}

function normalizeLookupText(value) {
  return normalizeString(value).toLowerCase().replace(/\s+/g, '')
}

function normalizeAssetUrl(value) {
  const normalizedValue = normalizeString(value)
  if (!normalizedValue) {
    return ''
  }

  if (/^https?:\/\//i.test(normalizedValue) || normalizedValue.startsWith('/')) {
    return normalizedValue
  }

  return `/${normalizedValue.replace(/^\/+/, '')}`
}

function normalizeNumber(value, fallbackValue = 0) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallbackValue
}

function formatSeconds(seconds = 0) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0))
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function buildPoiId(point = {}) {
  return normalizeString(point.id || point.poiId || point.key || point.markerId)
}

function extractAssetUrls(assets = []) {
  return (Array.isArray(assets) ? assets : [])
    .map((asset) => normalizeAssetUrl(asset?.file_url || asset?.url || asset?.src || ''))
    .filter(Boolean)
}

function uniqueUrls(urls = []) {
  const result = []
  const seen = new Set()

  ;(Array.isArray(urls) ? urls : []).forEach((url) => {
    const normalizedUrl = normalizeAssetUrl(url)
    if (!normalizedUrl || seen.has(normalizedUrl)) {
      return
    }

    seen.add(normalizedUrl)
    result.push(normalizedUrl)
  })

  return result
}

function getPointTypeLabel(pointType) {
  switch (normalizeLookupText(pointType)) {
    case 'start':
    case 'end':
      return '入口'
    case 'junction':
      return '路口'
    case 'service':
      return '服务点'
    case 'guide':
      return '导览点'
    case 'scenic':
    default:
      return '景点'
  }
}

function buildPointDescription(point = {}) {
  return normalizeString(
    point.audioGuideSummary
      || point.summary
      || point.shortHint
      || point.description
      || point.sceneLine
      || point.guideTip
      || '该景点内容已从地图点位接口同步。'
  )
}

function buildPointSubtitle(point = {}) {
  return normalizeString(
    point.sequenceText
      || point.themeTag
      || getPointTypeLabel(point.type)
      || '景点讲解'
  )
}

function buildMediaTags({ hasAudio, hasVideo, previewImageUrls }) {
  const tags = []

  if (hasAudio) {
    tags.push('音频')
  }

  if (hasVideo) {
    tags.push('视频')
  }

  if (Array.isArray(previewImageUrls) && previewImageUrls.length) {
    tags.push(previewImageUrls.length > 1 ? `图集 ${previewImageUrls.length}` : '图片')
  }

  return tags
}

function buildPoiEntry(point = {}, index = 0) {
  const id = buildPoiId(point)
  if (!id) {
    return null
  }

  const name = normalizeString(point.name || point.displayName || point.sourceName || `景点 ${index + 1}`) || `景点 ${index + 1}`
  const coverImage = normalizeAssetUrl(
    point.coverImage
      || point.coverImageUrl
      || point.galleryImageUrls?.[0]
      || point.galleryAssets?.[0]?.file_url
      || point.iconPath
      || DEFAULT_COVER_IMAGE
  ) || DEFAULT_COVER_IMAGE
  const previewImageUrls = uniqueUrls([
    coverImage,
    ...(Array.isArray(point.galleryImageUrls) ? point.galleryImageUrls : []),
    ...extractAssetUrls(point.galleryAssets)
  ])
  const videoUrls = uniqueUrls([
    ...(Array.isArray(point.videoUrls) ? point.videoUrls : []),
    ...extractAssetUrls(point.videoAssets)
  ])
  const audioUrl = normalizeAssetUrl(
    point.audioUrl
      || point.audioGuide?.asset?.file_url
      || point.audioGuideUrl
      || point.audioSrc
  )
  const audioDurationSeconds = Math.max(0, Math.round(normalizeNumber(
    point.audioDurationSeconds || point.audioGuide?.duration_seconds,
    0
  )))
  const hasAudio = !!audioUrl
  const hasVideo = videoUrls.length > 0
  const mediaTags = buildMediaTags({
    hasAudio,
    hasVideo,
    previewImageUrls
  })

  return {
    ...point,
    id,
    displayName: name,
    title: name,
    subtitle: buildPointSubtitle(point),
    description: buildPointDescription(point),
    coverImage: coverImage || DEFAULT_POINT_ICON,
    previewImageUrls,
    videoUrls,
    videoUrl: videoUrls[0] || '',
    audioUrl,
    audioDurationSeconds,
    audioDurationDisplay: audioDurationSeconds > 0 ? formatSeconds(audioDurationSeconds) : '暂无音频',
    audioTitle: normalizeString(point.audioGuideTitle || name) || name,
    hasAudio,
    hasVideo,
    mediaTags,
    mediaSummary: mediaTags.length ? mediaTags.join(' · ') : '暂无多媒体内容',
    typeLabel: getPointTypeLabel(point.type),
    selected: false,
    playing: false
  }
}

function buildPoiListState(poiList = [], currentPoiId = '', audioPlaying = false) {
  return (Array.isArray(poiList) ? poiList : []).map((poi) => ({
    ...poi,
    selected: !!currentPoiId && poi.id === currentPoiId,
    playing: !!currentPoiId && poi.id === currentPoiId && !!audioPlaying
  }))
}

function findEntryPoi(poiList = [], entryPoiId = '', entryPoiName = '') {
  const normalizedPoiId = normalizeLookupText(entryPoiId)
  const normalizedPoiName = normalizeLookupText(entryPoiName)

  if (normalizedPoiId) {
    const matchedById = poiList.find((poi) => (
      [
        poi.id,
        poi.key,
        poi.markerId,
        poi.contentId,
        poi.contentSlug
      ].some((value) => normalizeLookupText(value) === normalizedPoiId)
    ))

    if (matchedById) {
      return matchedById
    }
  }

  if (normalizedPoiName) {
    const matchedByName = poiList.find((poi) => (
      [
        poi.displayName,
        poi.name,
        poi.sourceName,
        poi.title
      ].some((value) => normalizeLookupText(value) === normalizedPoiName)
    ))

    if (matchedByName) {
      return matchedByName
    }

    return poiList.find((poi) => normalizeLookupText(poi.displayName).includes(normalizedPoiName)) || null
  }

  return null
}

function pickScenicPoiList(mapData = {}) {
  const visiblePoints = Array.isArray(mapData?.JYL_ROUTE_MARKER_POINTS)
    ? mapData.JYL_ROUTE_MARKER_POINTS
    : Array.isArray(mapData?.visiblePois)
      ? mapData.visiblePois
      : []

  const scenicPoints = visiblePoints.filter((point) => normalizeLookupText(point?.type) === 'scenic')
  const sourceList = scenicPoints.length ? scenicPoints : visiblePoints

  return sourceList
    .map((point, index) => buildPoiEntry(point, index))
    .filter(Boolean)
}

Page({
  data: {
    pageTitle: '景点讲解详情',
    locationText: '景点讲解',
    navFadeHeight: 50,
    navOpacity: 0,
    navBackground: 'rgba(255,255,255,0)',
    navTheme: 'dark',
    loading: true,
    errorText: '',
    emptyText: '',
    poiList: [],
    currentPoiId: '',
    currentPoi: null,
    audioTitle: '景点讲解',
    audioCover: DEFAULT_COVER_IMAGE,
    audioPlaying: false,
    audioDurationSeconds: 0,
    audioCurrentSeconds: 0,
    audioDurationDisplay: '00:00',
    audioCurrentDisplay: '00:00',
    audioProgressPercent: 0
  },

  onLoad(options = {}) {
    this.entryPoiId = safeDecodeURIComponent(options.poiId || '')
    this.entryPoiName = safeDecodeURIComponent(options.poiName || options.name || '')
    this.audioContext = null
    this.currentAudioUrl = ''
    this.imagePreviewing = false

    this.setData({
      locationText: this.entryPoiName || '景点讲解'
    })

    this.loadPoiList()
  },

  onShow() {
    this.imagePreviewing = false
  },

  onHide() {
    if (this.imagePreviewing) {
      return
    }

    this.pauseAudio()
  },

  onUnload() {
    this.destroyAudioContext()
  },

  onPageScroll({ scrollTop = 0 }) {
    const max = this.data.navFadeHeight || 50
    const ratio = Math.min(Math.max(scrollTop / max, 0), 1)
    const nextOpacity = Number(ratio.toFixed(2))
    const nextBackground = `rgba(255,255,255,${nextOpacity})`

    this.setData({
      navOpacity: nextOpacity,
      navBackground: nextBackground,
      navTheme: 'dark'
    })
  },

  async loadPoiList() {
    this.setData({
      loading: true,
      errorText: '',
      emptyText: ''
    })

    wx.showLoading({
      title: '加载景点中...',
      mask: true
    })

    try {
      const mapData = await mapRuntimeService.getPublishedMapRuntimeData()
      const poiList = pickScenicPoiList(mapData)

      if (!poiList.length) {
        this.setData({
          loading: false,
          poiList: [],
          currentPoiId: '',
          currentPoi: null,
          emptyText: '当前暂无可展示的景点讲解内容'
        })
        return
      }

      const initialPoi = findEntryPoi(poiList, this.entryPoiId, this.entryPoiName) || poiList[0]
      const preparedPoiList = buildPoiListState(poiList, initialPoi.id, false)

      this.setData({
        loading: false,
        poiList: preparedPoiList
      }, () => {
        this.applyCurrentPoi(initialPoi, {
          autoPlay: false
        })
      })
    } catch (error) {
      this.setData({
        loading: false,
        poiList: [],
        currentPoiId: '',
        currentPoi: null,
        errorText: error?.message || '景点内容加载失败，请稍后重试'
      })
    } finally {
      wx.hideLoading()
    }
  },

  onBackTap() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.redirectTo({
          url: '/pages/index/index'
        })
      }
    })
  },

  onHomeTap() {
    wx.reLaunch({
      url: '/pages/index/index',
      fail: () => {
        wx.redirectTo({
          url: '/pages/index/index'
        })
      }
    })
  },

  getPoiById(poiId = '') {
    const normalizedPoiId = normalizeString(poiId)
    if (!normalizedPoiId) {
      return null
    }

    return (this.data.poiList || []).find((poi) => poi.id === normalizedPoiId) || null
  },

  applyCurrentPoi(poi, options = {}) {
    if (!poi) {
      return
    }

    const {
      autoPlay = false
    } = options
    const isSamePoi = this.data.currentPoiId === poi.id
    const durationSeconds = Math.max(0, Number(poi.audioDurationSeconds) || 0)

    if (!isSamePoi) {
      this.stopAudioPlayback({
        resetProgress: true
      })
      this.currentAudioUrl = ''
    }

    const nextPoiList = buildPoiListState(this.data.poiList, poi.id, false)

    this.setData({
      poiList: nextPoiList,
      currentPoiId: poi.id,
      currentPoi: poi,
      locationText: poi.displayName || poi.title || '景点讲解',
      audioTitle: `${poi.audioTitle || poi.displayName || '景点讲解'} · 讲解`,
      audioCover: poi.coverImage || DEFAULT_COVER_IMAGE,
      audioDurationSeconds: durationSeconds,
      audioCurrentSeconds: 0,
      audioDurationDisplay: formatSeconds(durationSeconds),
      audioCurrentDisplay: '00:00',
      audioProgressPercent: 0
    }, () => {
      if (autoPlay) {
        this.playCurrentPoiAudio()
      }
    })
  },

  ensureAudioContext() {
    if (this.audioContext || typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') {
      return this.audioContext || null
    }

    const audioContext = wx.createInnerAudioContext()

    audioContext.onPlay(() => {
      this.setPlaybackState(true)
    })

    audioContext.onPause(() => {
      this.setPlaybackState(false)
    })

    audioContext.onStop(() => {
      this.setPlaybackState(false)
    })

    audioContext.onEnded(() => {
      const totalTime = Math.max(
        0,
        Math.round(Number(audioContext.duration) || this.data.audioDurationSeconds || 0)
      )

      this.setData({
        audioPlaying: false,
        audioCurrentSeconds: totalTime,
        audioCurrentDisplay: formatSeconds(totalTime),
        audioDurationSeconds: totalTime,
        audioDurationDisplay: formatSeconds(totalTime),
        audioProgressPercent: totalTime > 0 ? 100 : 0,
        poiList: buildPoiListState(this.data.poiList, this.data.currentPoiId, false)
      })
    })

    audioContext.onTimeUpdate(() => {
      const currentTime = Math.max(0, Math.round(Number(audioContext.currentTime) || 0))
      const totalTime = Math.max(
        0,
        Math.round(Number(audioContext.duration) || this.data.audioDurationSeconds || 0)
      )
      const progress = totalTime > 0
        ? Math.min(100, Math.round((currentTime / totalTime) * 100))
        : 0

      this.setData({
        audioCurrentSeconds: currentTime,
        audioCurrentDisplay: formatSeconds(currentTime),
        audioDurationSeconds: totalTime,
        audioDurationDisplay: formatSeconds(totalTime),
        audioProgressPercent: progress
      })
    })

    audioContext.onError(() => {
      this.setPlaybackState(false)
      wx.showToast({
        title: '音频播放失败',
        icon: 'none',
        duration: 1800
      })
    })

    this.audioContext = audioContext
    return this.audioContext
  },

  destroyAudioContext() {
    if (!this.audioContext) {
      return
    }

    if (typeof this.audioContext.stop === 'function') {
      this.audioContext.stop()
    }

    if (typeof this.audioContext.destroy === 'function') {
      this.audioContext.destroy()
    }

    this.audioContext = null
    this.currentAudioUrl = ''
  },

  setPlaybackState(audioPlaying) {
    this.setData({
      audioPlaying: !!audioPlaying,
      poiList: buildPoiListState(this.data.poiList, this.data.currentPoiId, !!audioPlaying)
    })
  },

  stopAudioPlayback(options = {}) {
    const {
      resetProgress = false
    } = options

    if (this.audioContext && typeof this.audioContext.stop === 'function') {
      this.audioContext.stop()
    }

    if (resetProgress) {
      const durationSeconds = Math.max(0, Number(this.data.currentPoi?.audioDurationSeconds) || 0)

      this.setData({
        audioPlaying: false,
        audioCurrentSeconds: 0,
        audioCurrentDisplay: '00:00',
        audioDurationSeconds: durationSeconds,
        audioDurationDisplay: formatSeconds(durationSeconds),
        audioProgressPercent: 0,
        poiList: buildPoiListState(this.data.poiList, this.data.currentPoiId, false)
      })
    }
  },

  pauseAudio() {
    if (this.audioContext && typeof this.audioContext.pause === 'function' && this.data.audioPlaying) {
      this.audioContext.pause()
    }
  },

  playCurrentPoiAudio() {
    const currentPoi = this.data.currentPoi
    const audioUrl = normalizeString(currentPoi?.audioUrl)

    if (!audioUrl) {
      wx.showToast({
        title: '当前景点暂无音频讲解',
        icon: 'none',
        duration: 1800
      })
      return
    }

    const audioContext = this.ensureAudioContext()
    if (!audioContext || typeof audioContext.play !== 'function') {
      wx.showToast({
        title: '当前设备不支持音频播放',
        icon: 'none',
        duration: 1800
      })
      return
    }

    if (this.currentAudioUrl !== audioUrl || audioContext.src !== audioUrl) {
      this.currentAudioUrl = audioUrl
      audioContext.src = audioUrl
      this.setData({
        audioCurrentSeconds: 0,
        audioCurrentDisplay: '00:00',
        audioProgressPercent: 0
      })
    }

    audioContext.play()
  },

  onPoiSelect(event) {
    const poiId = normalizeString(event?.currentTarget?.dataset?.id)
    const poi = this.getPoiById(poiId)

    if (!poi || poi.id === this.data.currentPoiId) {
      return
    }

    this.applyCurrentPoi(poi)
  },

  onPoiPlay(event) {
    const poiId = normalizeString(event?.currentTarget?.dataset?.id)
    const poi = this.getPoiById(poiId)

    if (!poi) {
      return
    }

    if (poi.id !== this.data.currentPoiId) {
      this.applyCurrentPoi(poi, {
        autoPlay: true
      })
      return
    }

    this.toggleAudioPlay()
  },

  toggleAudioPlay() {
    if (!this.data.currentPoi) {
      return
    }

    if (this.data.audioPlaying) {
      this.pauseAudio()
      return
    }

    this.playCurrentPoiAudio()
  },

  onSliderChanging(event) {
    if (!this.data.currentPoi?.hasAudio) {
      return
    }

    const totalTime = Math.max(0, Number(this.data.audioDurationSeconds) || 0)
    if (!totalTime) {
      return
    }

    const progressValue = Number(event?.detail?.value) || 0
    const currentTime = Math.round((progressValue / 100) * totalTime)

    this.setData({
      audioCurrentSeconds: currentTime,
      audioCurrentDisplay: formatSeconds(currentTime),
      audioProgressPercent: progressValue
    })
  },

  onSliderChange(event) {
    if (!this.data.currentPoi?.hasAudio) {
      return
    }

    const totalTime = Math.max(0, Number(this.data.audioDurationSeconds) || 0)
    if (!totalTime) {
      return
    }

    const progressValue = Number(event?.detail?.value) || 0
    const currentTime = Math.round((progressValue / 100) * totalTime)

    if (this.audioContext && typeof this.audioContext.seek === 'function') {
      this.audioContext.seek(currentTime)
    }

    this.setData({
      audioCurrentSeconds: currentTime,
      audioCurrentDisplay: formatSeconds(currentTime),
      audioProgressPercent: progressValue
    })
  },

  onPreviewImageTap(event) {
    const currentPoi = this.data.currentPoi
    const urls = Array.isArray(currentPoi?.previewImageUrls) ? currentPoi.previewImageUrls : []
    if (!urls.length) {
      return
    }

    const currentUrl = normalizeString(event?.currentTarget?.dataset?.url) || urls[0]
    this.imagePreviewing = true

    wx.previewImage({
      current: currentUrl,
      urls
    })
  },

  async onPoiVideoPlay() {
    const accessResult = await checkCurrentLocationInScenicArea()
    if (accessResult.allowed) {
      return
    }

    try {
      const videoContext = wx.createVideoContext('poiVideoPlayer', this)
      if (videoContext) {
        videoContext.pause()
        videoContext.seek(0)
      }
    } catch (error) {}

    const deniedMessage = buildScenicVideoAccessDeniedMessage(accessResult)
    wx.showModal({
      title: deniedMessage.title,
      content: deniedMessage.content,
      showCancel: false,
      confirmText: '知道了'
    })
  }
})
