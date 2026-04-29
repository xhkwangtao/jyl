const auth = require('../../utils/auth')
const { isFeaturePaid } = require('../../utils/audio-access')
const entitlementService = require('../../services/entitlement-service')
const {
  persistLandingContext,
  getLandingRedirectConfig,
  buildMapPageUrlFromLanding
} = require('../../utils/landing-redirect')
const {
  GUIDE_SUBSCRIBE_PAGE
} = require('../../utils/guide-routes')
const landingService = require('../../services/landing-service')
const {
  checkCurrentLocationInScenicArea,
  buildScenicVideoAccessDeniedMessage
} = require('../../utils/scenic-location')

const HOME_PAGE_URL = '/pages/index/index'
const MY_PAGE_URL = '/pages/my-page/my-page'
const SUBSCRIBE_PAGE_URL = `${GUIDE_SUBSCRIBE_PAGE}?feature=vip&from=landing_video`
const VIDEO_VIEW_COUNT_STORAGE_KEY = 'landing_video_view_count'
const VIP_FEATURE_KEY = 'vip'
const DEFAULT_ENTRY_IMAGE_URL = '/images/xiaojiu.png'
const DEFAULT_ENTRY_TITLE = '欢迎来到九眼楼'
const DEFAULT_ENTRY_BADGE_NAME = '九眼楼入口'
const DEFAULT_ENTRY_DESCRIPTION = '入口参数已识别，点击下方按钮即可进入九眼楼开始游览。'

function normalizeSourceCode(value = '') {
  return String(value || '').trim().toLowerCase()
}

function buildNavigationMetrics() {
  try {
    const systemInfo = wx.getSystemInfoSync()
    const menuButton = typeof wx.getMenuButtonBoundingClientRect === 'function'
      ? wx.getMenuButtonBoundingClientRect()
      : null
    const statusBarHeight = systemInfo.statusBarHeight || 20

    if (!menuButton || !menuButton.height) {
      return {
        statusBarHeight,
        navigationBarTotalHeight: statusBarHeight + 44
      }
    }

    const menuButtonHeight = menuButton.height
    const menuButtonTop = menuButton.top
    const navContentPaddingTop = Math.max(menuButtonTop - statusBarHeight, 0)

    return {
      statusBarHeight,
      navigationBarTotalHeight: statusBarHeight + navContentPaddingTop + menuButtonHeight
    }
  } catch (error) {
    return {
      statusBarHeight: 20,
      navigationBarTotalHeight: 64
    }
  }
}

Page({
  data: {
    statusBarHeight: 0,
    navigationBarTotalHeight: 0,
    shouldShowPage: false,
    shouldShowVideo: false,
    videoPlaying: false,
    videoEnded: false,
    videoViewCount: 0,
    currentVideo: null,
    source: '',
    serialNumber: '',
    entryTitle: DEFAULT_ENTRY_TITLE,
    entrySummary: DEFAULT_ENTRY_DESCRIPTION,
    entryBadgeName: DEFAULT_ENTRY_BADGE_NAME,
    entryImageUrl: DEFAULT_ENTRY_IMAGE_URL,
    entryMetaText: '',
    primaryActionText: '进入九眼楼',
    targetPageUrl: HOME_PAGE_URL,
    badgeEntranceSpeed: 'double-rotation',
    badgeEntranceClass: '',
    confettiColors: ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#14B8A6']
  },

  async onLoad(options = {}) {
    this.pendingSilentLoginPromise = null
    this.updateBadgeEntranceClass()
    const landingOptions = persistLandingContext(options)

    this.ensureSilentLogin()
    this.parseUrlParams(landingOptions)
    this.initSystemInfo()
    this.initUIEnhancements()
    await this.checkParamsAndRedirect(landingOptions)
  },

  onShow() {
    this.ensureSilentLogin()
    this.playEntranceAnimation()
  },

  onHide() {
    wx.hideLoading()
  },

  onUnload() {
    wx.hideLoading()
  },

  async checkParamsAndRedirect(landingOptions = {}) {
    const source = landingOptions.sourceCode || ''
    const serialNumber = landingOptions.serialNumber || ''
    const mapPageUrl = buildMapPageUrlFromLanding(landingOptions)
    const remoteConfig = source
      ? await landingService.getRedirectConfig(source, {
        scene: landingOptions.scene,
        serialNumber
      })
      : null

    if (await this.tryExecuteLandingConfig(remoteConfig, landingOptions)) {
      return
    }

    if (mapPageUrl) {
      this.executeRedirect(mapPageUrl)
      return
    }

    if (source) {
      const config = getLandingRedirectConfig(source, false)

      if (config && config.enabled && config.redirectUrl) {
        if (config.action === 'video') {
          if (!await this.ensureScenicVideoAccess()) {
            this.showLandingPage({
              hideLoading: !!serialNumber
            })
            return
          }

          const isVip = await this.isVipActive()
          const viewCount = this.getVideoViewCount()

          if (!isVip && viewCount >= 3) {
            this.redirectToSubscribe()
            return
          }

          this.incrementVideoViewCount()
          this.setData({
            shouldShowPage: false,
            shouldShowVideo: true,
            videoPlaying: false,
            videoEnded: false,
            videoViewCount: viewCount + 1,
            currentVideo: {
              url: config.redirectUrl,
              title: config.description || '视频介绍',
              description: config.description || ''
            }
          })
          return
        }

        this.executeRedirect(config.redirectUrl)
        return
      }

      this.showLandingPage()
      return
    }

    this.showLandingPage({
      hideLoading: !!serialNumber
    })
  },

  async tryExecuteLandingConfig(config, landingOptions = {}) {
    if (!this.shouldUseLandingConfig(config, landingOptions)) {
      return false
    }

    if (config.action === 'video') {
      if (!await this.ensureScenicVideoAccess()) {
        this.showLandingPage({
          hideLoading: true
        })
        return true
      }

      const isVip = await this.isVipActive()
      const viewCount = this.getVideoViewCount()

      if (!isVip && viewCount >= 3) {
        this.redirectToSubscribe()
        return true
      }

      this.incrementVideoViewCount()
      this.setData({
        shouldShowPage: false,
        shouldShowVideo: true,
        videoPlaying: false,
        videoEnded: false,
        videoViewCount: viewCount + 1,
        currentVideo: {
          url: config.redirectUrl,
          title: config.description || '视频介绍',
          description: config.description || ''
        }
      })
      return true
    }

    this.executeRedirect(config.redirectUrl)
    return true
  },

  shouldUseLandingConfig(config, landingOptions = {}) {
    if (!config || !config.enabled || !config.redirectUrl) {
      return false
    }

    const requestedSourceCode = normalizeSourceCode(landingOptions.sourceCode)
    const responseSourceCode = normalizeSourceCode(config.sourceCode)

    if (!requestedSourceCode) {
      return Boolean(responseSourceCode)
    }

    return requestedSourceCode === responseSourceCode
  },

  ensureSilentLogin() {
    if (this.pendingSilentLoginPromise) {
      return this.pendingSilentLoginPromise
    }

    this.pendingSilentLoginPromise = this.silentLogin().finally(() => {
      this.pendingSilentLoginPromise = null
    })

    return this.pendingSilentLoginPromise
  },

  async silentLogin() {
    try {
      const hasLogin = await auth.checkAndAutoLogin(2500)
      if (!hasLogin || !auth.getToken()) {
        return false
      }

      await auth.syncCurrentUserProfile().catch(() => null)
      return true
    } catch (error) {
      return false
    }
  },

  async ensureScenicVideoAccess() {
    const accessResult = await checkCurrentLocationInScenicArea()
    if (accessResult.allowed) {
      return true
    }

    const deniedMessage = buildScenicVideoAccessDeniedMessage(accessResult)
    wx.showModal({
      title: deniedMessage.title,
      content: deniedMessage.content,
      showCancel: false,
      confirmText: '知道了'
    })
    return false
  },

  async isVipActive() {
    await this.ensureSilentLogin()

    if (!auth.getToken()) {
      return isFeaturePaid(VIP_FEATURE_KEY)
    }

    try {
      const vipAccess = await entitlementService.checkEntitlement(VIP_FEATURE_KEY, {
        maxAgeMs: 60 * 1000
      })
      return !!vipAccess?.available
    } catch (error) {
      return isFeaturePaid(VIP_FEATURE_KEY)
    }
  },

  getVideoViewCount() {
    try {
      return wx.getStorageSync(VIDEO_VIEW_COUNT_STORAGE_KEY) || 0
    } catch (error) {
      return 0
    }
  },

  incrementVideoViewCount() {
    try {
      const nextCount = this.getVideoViewCount() + 1
      wx.setStorageSync(VIDEO_VIEW_COUNT_STORAGE_KEY, nextCount)
      return nextCount
    } catch (error) {
      return this.getVideoViewCount()
    }
  },

  redirectToSubscribe() {
    wx.navigateTo({
      url: SUBSCRIBE_PAGE_URL,
      fail: () => {
        wx.redirectTo({
          url: SUBSCRIBE_PAGE_URL,
          fail: () => {
            wx.showToast({
              title: '请前往开通VIP',
              icon: 'none',
              duration: 2000
            })
          }
        })
      }
    })
  },

  showLandingPage(options = {}) {
    this.setData({
      shouldShowPage: true,
      shouldShowVideo: false,
      videoPlaying: false,
      videoEnded: false,
      currentVideo: null
    })

    if (options.hideLoading) {
      wx.hideLoading()
    }
  },

  executeRedirect(redirectUrl) {
    if (!redirectUrl) {
      return
    }

    wx.redirectTo({
      url: redirectUrl,
      fail: () => {
        wx.reLaunch({
          url: redirectUrl,
          fail: () => {
            wx.navigateTo({
              url: redirectUrl,
              fail: () => {
                wx.showToast({
                  title: '页面跳转失败',
                  icon: 'none',
                  duration: 2000
                })
              }
            })
          }
        })
      }
    })
  },

  parseUrlParams(landingOptions = {}) {
    const source = landingOptions.sourceCode || ''
    const serialNumber = landingOptions.serialNumber || ''
    const mapPageUrl = buildMapPageUrlFromLanding(landingOptions)
    const summaryParts = []
    const metaParts = []

    if (source) {
      summaryParts.push(`来源：${source}`)
      metaParts.push(`来源 ${source}`)
    }

    if (serialNumber) {
      summaryParts.push(`凭证号：${serialNumber}`)
      metaParts.push(`凭证 ${serialNumber}`)
    }

    const today = new Date()
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`

    this.setData({
      source,
      serialNumber,
      entryTitle: summaryParts.length ? '扫码入口已识别' : DEFAULT_ENTRY_TITLE,
      entrySummary: summaryParts.length ? summaryParts.join('  ·  ') : DEFAULT_ENTRY_DESCRIPTION,
      entryBadgeName: source || DEFAULT_ENTRY_BADGE_NAME,
      entryImageUrl: DEFAULT_ENTRY_IMAGE_URL,
      entryMetaText: [dateStr, ...metaParts].join('  ·  '),
      primaryActionText: mapPageUrl ? '进入地图查看' : '进入九眼楼',
      targetPageUrl: mapPageUrl || HOME_PAGE_URL
    })
  },

  initSystemInfo() {
    const { statusBarHeight, navigationBarTotalHeight } = buildNavigationMetrics()

    this.setData({
      statusBarHeight,
      navigationBarTotalHeight
    })
  },

  initUIEnhancements() {
    this.loadFonts()
  },

  loadFonts() {
    wx.loadFontFace({
      family: 'Alibaba PuHuiTi',
      source: 'url("https://at.alicdn.com/wf/webfont/webfonts/AlibabaPuHuiTi/AlibabaPuHuiTi-Regular.ttf")'
    })

    wx.loadFontFace({
      family: 'Alibaba PuHuiTi Bold',
      source: 'url("https://at.alicdn.com/wf/webfont/webfonts/AlibabaPuHuiTi/AlibabaPuHuiTi-Bold.ttf")'
    })
  },

  playSuccessSound() {
    wx.vibrateShort({
      type: 'medium'
    })
  },

  playEntranceAnimation() {},

  goBack() {
    wx.hideLoading()

    if (getCurrentPages().length > 1) {
      wx.navigateBack({
        delta: 1,
        fail: () => {
          this.goToHome()
        }
      })
      return
    }

    this.goToHome()
  },

  goToHome() {
    wx.hideLoading()

    wx.reLaunch({
      url: HOME_PAGE_URL,
      fail: () => {
        wx.redirectTo({
          url: HOME_PAGE_URL
        })
      }
    })
  },

  goToUser() {
    wx.navigateTo({
      url: MY_PAGE_URL,
      fail: () => {
        wx.redirectTo({
          url: MY_PAGE_URL
        })
      }
    })
  },

  updateBadgeEntranceClass() {
    this.setData({
      badgeEntranceClass: this.getBadgeEntranceClass()
    })
  },

  getBadgeEntranceClass() {
    switch (this.data.badgeEntranceSpeed) {
      case 'fast':
        return 'entrance-fast'
      case 'slow':
        return 'entrance-slow'
      case 'very-slow':
        return 'entrance-very-slow'
      case 'ultra-slow':
        return 'entrance-ultra-slow'
      case 'double-rotation':
        return 'entrance-double-rotation'
      case 'none':
        return 'no-entrance'
      default:
        return ''
    }
  },

  testBadgeSpeed(speed) {
    this.setData({
      badgeEntranceSpeed: speed
    }, () => {
      this.updateBadgeEntranceClass()
    })
  },

  goToTarget() {
    this.executeRedirect(this.data.targetPageUrl || HOME_PAGE_URL)
  },

  onShareAppMessage() {
    return {
      title: '欢迎来到九眼楼',
      path: this.data.targetPageUrl || HOME_PAGE_URL,
      imageUrl: this.data.entryImageUrl
    }
  },

  onShareTimeline() {
    return {
      title: '欢迎来到九眼楼',
      imageUrl: this.data.entryImageUrl
    }
  },

  onEntryImageLoad() {},

  onEntryImageError() {
    this.setData({
      entryImageUrl: DEFAULT_ENTRY_IMAGE_URL
    })
  },

  onVideoPlay() {
    wx.hideLoading()
    this.setData({
      videoPlaying: true
    })
  },

  onVideoPause() {
    this.setData({
      videoPlaying: false
    })
  },

  onVideoEnded() {
    wx.hideLoading()
    this.setData({
      videoPlaying: false,
      videoEnded: true
    })

    wx.vibrateShort({
      type: 'medium'
    })
  },

  onVideoLoadStart() {
    wx.showLoading({
      title: '视频加载中...',
      mask: true
    })
  },

  onVideoError() {
    wx.hideLoading()

    wx.showModal({
      title: '视频播放失败',
      content: 'AI伴游介绍视频加载失败，请检查网络连接或稍后重试',
      showCancel: true,
      cancelText: '稍后重试',
      confirmText: '直接体验',
      success: (result) => {
        if (result.confirm) {
          this.goToHome()
          return
        }

        this.setData({
          videoEnded: true
        })
      }
    })
  },

  replayVideo() {
    this.setData({
      videoPlaying: false,
      videoEnded: false
    })

    const videoContext = wx.createVideoContext('introVideo', this)
    videoContext.seek(0)
    videoContext.play()
  }
})
