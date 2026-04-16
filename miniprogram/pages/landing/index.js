const { isFeaturePaid } = require('../../utils/audio-access')
const {
  persistLandingContext,
  getLandingRedirectConfig
} = require('../../utils/landing-redirect')

const HOME_PAGE_URL = '/pages/index/index'
const MY_PAGE_URL = '/pages/my-page/my-page'
const SUBSCRIBE_PAGE_URL = '/pages/payment/subscribe/subscribe?feature=vip&from=landing_video'
const VIDEO_VIEW_COUNT_STORAGE_KEY = 'landing_video_view_count'
const VIP_FEATURE_KEY = 'vip'
const DEFAULT_FLASHCARD_NAME = '闪卡VIP'
const DEFAULT_FLASHCARD_IMAGE_URL = '/images/badges/vip-card.svg'
const DEFAULT_PRODUCT_TYPE = 'flashcard'
const DEFAULT_PRODUCT_TYPE_NAME = '闪卡'

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
    videoSources: [
      {
        url: 'https://hyg-cdn.flexai.cc/xiaoyingshipin/bguachengjieshao.mp4',
        title: '九眼楼八卦城介绍',
        description: 'AI助手陪你探索古老长城的历史文化魅力'
      },
      {
        url: 'https://hyg-cdn.flexai.cc/xiaoyingshipin/hungyaguanrenwutiaozhan.mp4',
        title: '九眼楼任务挑战',
        description: '跟随AI助手完成有趣的探索任务'
      },
      {
        url: 'https://hyg-cdn.flexai.cc/xiaoyingshipin/xiaoyingjieshao.mp4',
        title: '九眼楼AI伴游',
        description: '智能导览 · 个性化旅游 · AI语音助手'
      }
    ],
    currentVideo: null,
    source: '',
    serialNumber: '',
    flashCardName: DEFAULT_FLASHCARD_NAME,
    flashCardImageUrl: DEFAULT_FLASHCARD_IMAGE_URL,
    activationDate: '',
    productType: DEFAULT_PRODUCT_TYPE,
    productTypeName: DEFAULT_PRODUCT_TYPE_NAME,
    collectionOrder: 1,
    isAutoActivating: false,
    hasAutoActivated: false,
    activationSuccess: true,
    activationMessage: '',
    badgeEntranceSpeed: 'double-rotation',
    badgeEntranceClass: '',
    confettiColors: ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#14B8A6']
  },

  onLoad(options = {}) {
    this.updateBadgeEntranceClass()
    const landingOptions = persistLandingContext(options)

    this.parseUrlParams(landingOptions)
    this.initSystemInfo()
    this.initUIEnhancements()
    this.checkParamsAndRedirect(landingOptions)
  },

  onShow() {
    this.playEntranceAnimation()
  },

  onHide() {
    wx.hideLoading()
  },

  onUnload() {
    wx.hideLoading()
  },

  checkParamsAndRedirect(landingOptions = {}) {
    const source = landingOptions.sourceCode || ''
    const serialNumber = landingOptions.serialNumber || ''

    if (serialNumber) {
      this.setData({
        shouldShowPage: true,
        shouldShowVideo: false,
        hasAutoActivated: true,
        activationSuccess: true,
        activationMessage: '激活成功'
      })
      return
    }

    if (source) {
      const config = getLandingRedirectConfig(source, false)

      if (config && config.enabled && config.redirectUrl) {
        if (config.action === 'video') {
          const isVip = this.isVipActive()
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

      this.showVideoOrRedirectToSubscribe()
      return
    }

    this.setData({
      shouldShowPage: true,
      shouldShowVideo: false
    })
  },

  isVipActive() {
    return isFeaturePaid(VIP_FEATURE_KEY)
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

  showVideoOrRedirectToSubscribe() {
    const isVip = this.isVipActive()
    const viewCount = this.getVideoViewCount()

    if (!isVip && viewCount >= 3) {
      this.redirectToSubscribe()
      return
    }

    const selectedVideo = this.selectRandomVideo()

    this.incrementVideoViewCount()
    this.setData({
      shouldShowPage: false,
      shouldShowVideo: true,
      videoPlaying: false,
      videoEnded: false,
      videoViewCount: viewCount + 1,
      currentVideo: selectedVideo
    })
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

    this.setData({
      source,
      serialNumber,
      flashCardName: DEFAULT_FLASHCARD_NAME,
      flashCardImageUrl: DEFAULT_FLASHCARD_IMAGE_URL,
      productType: DEFAULT_PRODUCT_TYPE,
      productTypeName: DEFAULT_PRODUCT_TYPE_NAME,
      collectionOrder: 1
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
    this.setActivationDate()
  },

  setActivationDate() {
    const today = new Date()
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`

    this.setData({
      activationDate: dateStr
    })
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

  goToMap() {
    wx.setStorageSync('vipActivationInfo', {
      source: this.data.source,
      serialNumber: this.data.serialNumber,
      flashCardName: this.data.flashCardName,
      activationDate: this.data.activationDate,
      activationSuccess: this.data.activationSuccess
    })

    this.goToHome()
  },

  onShareAppMessage() {
    return {
      title: `我刚刚激活了${this.data.flashCardName}！`,
      path: HOME_PAGE_URL,
      imageUrl: this.data.flashCardImageUrl
    }
  },

  onShareTimeline() {
    return {
      title: `我刚刚激活了${this.data.flashCardName}！`,
      imageUrl: this.data.flashCardImageUrl
    }
  },

  onFlashcardImageLoad() {},

  onFlashcardImageError() {
    this.setData({
      flashCardImageUrl: DEFAULT_FLASHCARD_IMAGE_URL
    })
  },

  selectRandomVideo() {
    const videos = this.data.videoSources || []

    if (!videos.length) {
      return {
        url: '',
        title: 'AI伴游介绍',
        description: ''
      }
    }

    const randomIndex = Math.floor(Math.random() * videos.length)
    return videos[randomIndex]
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
