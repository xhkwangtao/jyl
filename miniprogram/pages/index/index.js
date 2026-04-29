const auth = require('../../utils/auth')
const {
  buildSecretCollectionState
} = require('../../utils/secret-collection')
const {
  hasLandingPayload,
  buildLandingPageUrl
} = require('../../utils/landing-redirect')
const announcementService = require('../../services/announcement-service')
const {
  handleAnnouncementLink
} = require('../../utils/announcement-link')
const {
  buildAnnouncementFingerprint
} = require('../../utils/announcement-utils')
const {
  GUIDE_MAP_PAGE,
  GUIDE_AI_CHAT_PAGE,
  GUIDE_AUDIO_LIST_PAGE
} = require('../../utils/guide-routes')
const studyReportService = require('../../services/study-report-service')
const {
  PAID_FEATURE_KEYS
} = require('../../services/entitlement-service')
const {
  checkCurrentLocationInScenicArea,
  buildScenicVideoAccessDeniedMessage
} = require('../../utils/scenic-location')
const {
  withPageAnalytics
} = require('../../utils/with-page-analytics')

const AI_CHAT_PAYMENT_FEATURE_KEY = PAID_FEATURE_KEYS.AI_CHAT
const STUDY_REPORT_ACCESS_FEATURE_KEY = PAID_FEATURE_KEYS.STUDY_REPORT_GENERATE
const AI_CHAT_SUBSCRIBE_DESCRIPTION = '开通VIP后即可使用AI聊天与智能问答服务'
const AI_CHAT_SUCCESS_REDIRECT_URL = GUIDE_AI_CHAT_PAGE
const CHECK_IN_CARD_TITLE = '守城认证中心'
const CHECK_IN_CARD_DESCRIPTION = '提交你的边关答卷，生成专属AI研学报告\n看看六百年后，你将成为怎样的守城人。'
const CHECK_IN_CARD_ACTION = '点击上传答题卡'
const STAFF_STUDY_REPORT_PAGE = '/pages/staff-study-report/staff-study-report'
const STATUS_BAR_GUEST_NAME = '游客'
const STATUS_BAR_GUEST_AVATAR_SRC = '/images/icons/user.svg'
const STATUS_BAR_USER_AVATAR_SRC = '/images/xiaojiu.png'
const HOME_PHOTO_CARD_VIDEO_URL = 'https://jyl-cdn.flexai.cc/assets/video/e166e877ce3348e786489c122add3aef.mp4'
const HOME_ANNOUNCEMENT_DISMISSED_FINGERPRINT_STORAGE_KEY = 'homeAnnouncementDismissedFingerprint'

Page(withPageAnalytics('/pages/index/index', {
  data: {
    safeAreaBottom: 34,
    isLoggingIn: false,
    welcomeTitle: '欢迎来到九眼楼～',
    dialogText: '小九带您告别走马观花，长城不仅是照片里的背景，历史不再是书本里的文字，触摸长城砖石、解锁历史，让快乐旅途藏满文化与知识的重量。',
    aiNameDisplay: ['小', '九'],
    aiRoleDisplay: ['A', 'I', '使', '者'],
    statusUserName: STATUS_BAR_GUEST_NAME,
    statusUserAvatarSrc: STATUS_BAR_GUEST_AVATAR_SRC,
    checkInTitle: CHECK_IN_CARD_TITLE,
    checkInDescription: CHECK_IN_CARD_DESCRIPTION,
    checkInAction: CHECK_IN_CARD_ACTION,
    featureVideoVisible: false,
    featureVideoTitle: '边关重启',
    featureVideoSrc: '',
    checkInTotalCount: 19,
    checkInCompletedCount: 0,
    checkInDisplayCompletedCount: 0,
    announcementModalVisible: false,
    activeAnnouncement: {},
    activeAnnouncementBlocks: []
  },

  onLoad(options = {}) {
    this.pendingLandingRedirect = false
    this.syncingCurrentUserProfile = false
    this.syncingLatestStudyReport = false
    this.announcementRequestSequence = 0

    if (this.handleLandingRedirect(options)) {
      return
    }

    this.initializePage()
  },

  onReady() {
    this.permissionGuard = this.selectComponent('#permissionGuard')
  },

  onShow() {
    if (this.pendingLandingRedirect) {
      return
    }

    this.syncHomeAnnouncementModal()
    this.syncStatusBarUser()
    this.syncCheckInEntry()
    this.pendingAIChatNavigation = false
    this.setData({
      isLoggingIn: true
    })

    this.silentLogin()
      .then((hasLogin) => {
        this.syncStatusBarUser()

        if (!hasLogin) {
          return
        }

        return this.syncCurrentUserProfile()
          .then(() => this.syncLatestStudyReport())
          .then(() => {
            this.syncStatusBarUser()
            this.syncCheckInEntry()
          })
      })
      .finally(() => {
        this.setData({
          isLoggingIn: false
        }, () => {
          if (!this.pendingAIChatNavigation) {
            return
          }

          this.pendingAIChatNavigation = false
          this.navigateToAIChat()
        })
      })
  },

  onUnload() {
    this.closeFeatureVideo({
      updateState: false
    })
    this.pendingAIChatNavigation = false
    this.pendingLandingRedirect = false
    this.announcementRequestSequence = (this.announcementRequestSequence || 0) + 1
  },

  onHide() {
    this.pauseFeatureVideo()
  },

  onPullDownRefresh() {
    Promise.allSettled([
      this.syncCurrentUserProfile(),
      this.syncLatestStudyReport()
    ]).finally(() => {
      this.syncStatusBarUser()
      this.syncCheckInEntry()
      wx.stopPullDownRefresh()
    })
  },

  initializePage() {
    this.initLayoutMetrics()
    this.syncStatusBarUser()
    this.syncCheckInEntry()
  },

  handleLandingRedirect(options = {}) {
    if (!hasLandingPayload(options)) {
      return false
    }

    const landingPageUrl = buildLandingPageUrl(options)

    if (!landingPageUrl) {
      return false
    }

    this.pendingLandingRedirect = true

    wx.redirectTo({
      url: landingPageUrl,
      fail: () => {
        this.pendingLandingRedirect = false
        this.initializePage()

        wx.showToast({
          title: '扫码入口跳转失败',
          icon: 'none',
          duration: 1800
        })
      }
    })

    return true
  },

  getDismissedAnnouncementFingerprint() {
    try {
      return String(wx.getStorageSync(HOME_ANNOUNCEMENT_DISMISSED_FINGERPRINT_STORAGE_KEY) || '').trim()
    } catch (error) {
      return ''
    }
  },

  persistDismissedAnnouncementFingerprint(fingerprint = '') {
    const normalizedFingerprint = String(fingerprint || '').trim()
    if (!normalizedFingerprint) {
      return
    }

    try {
      wx.setStorageSync(
        HOME_ANNOUNCEMENT_DISMISSED_FINGERPRINT_STORAGE_KEY,
        normalizedFingerprint
      )
    } catch (error) {}
  },

  clearAnnouncementModalState() {
    this.setData({
      announcementModalVisible: false,
      activeAnnouncement: {},
      activeAnnouncementBlocks: []
    })
  },

  async syncHomeAnnouncementModal() {
    const requestSequence = (this.announcementRequestSequence || 0) + 1
    this.announcementRequestSequence = requestSequence

    const announcement = await announcementService.getHomeModalAnnouncement(
      this.getDismissedAnnouncementFingerprint()
    )

    if (requestSequence !== this.announcementRequestSequence) {
      return
    }

    if (!announcement) {
      this.clearAnnouncementModalState()
      return
    }

    this.setData({
      announcementModalVisible: true,
      activeAnnouncement: announcement,
      activeAnnouncementBlocks: Array.isArray(announcement.normalizedBlocks)
        ? announcement.normalizedBlocks
        : []
    })
  },

  hideAnnouncementModal() {
    this.setData({
      announcementModalVisible: false,
      activeAnnouncement: {},
      activeAnnouncementBlocks: []
    })
  },

  getActiveAnnouncementFingerprint() {
    return buildAnnouncementFingerprint(this.data.activeAnnouncement || {})
  },

  onAnnouncementModalClose() {
    const fingerprint = this.getActiveAnnouncementFingerprint()
    this.persistDismissedAnnouncementFingerprint(fingerprint)
    this.hideAnnouncementModal()
  },

  async onAnnouncementLinkTap(event) {
    const fingerprint = this.getActiveAnnouncementFingerprint()
    const link = event?.detail?.link || {}

    this.persistDismissedAnnouncementFingerprint(fingerprint)
    this.hideAnnouncementModal()
    await handleAnnouncementLink(link)
  },

  initLayoutMetrics() {
    try {
      const systemInfo = wx.getSystemInfoSync()
      const safeArea = systemInfo.safeArea || null
      const safeAreaBottom = safeArea ? Math.max(systemInfo.screenHeight - safeArea.bottom, 0) : 34

      this.setData({
        safeAreaBottom
      })
    } catch (error) {
      this.setData({
        safeAreaBottom: 34
      })
    }
  },

  onAvatarTap() {
    wx.showModal({
      title: '小九',
      content: '您好！我是小九，您的专属智能导游。请问有什么可以帮助您的吗？',
      showCancel: true,
      cancelText: '稍后',
      confirmText: '开始聊天',
      confirmColor: '#36FF86',
      success: (res) => {
        if (res.confirm) {
          this.onAIChatTap()
        }
      }
    })
  },

  onStartRoute() {
    this.openMapPage()
  },

  onFeatureCardClick(event) {
    const source = event.detail ? event.detail.source : ''

    switch (source) {
      case 'explanation-card':
        this.onExplanationTap()
        break
      case 'aichat-card':
        this.onAIChatTap()
        break
      case 'aiphoto-card':
        this.onPhotoSpotsTap()
        break
      default:
        this.showUiOnlyToast('功能搭建中')
        break
    }
  },

  onExplanationTap() {
    wx.navigateTo({
      url: GUIDE_AUDIO_LIST_PAGE,
      fail: () => {
        wx.redirectTo({
          url: GUIDE_AUDIO_LIST_PAGE
        })
      }
    })
  },

  async onPhotoSpotsTap() {
    const accessResult = await checkCurrentLocationInScenicArea()
    if (!accessResult.allowed) {
      const deniedMessage = buildScenicVideoAccessDeniedMessage(accessResult)
      wx.showModal({
        title: deniedMessage.title,
        content: deniedMessage.content,
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }

    this.openFeatureVideo()
  },

  onMapPreviewTap() {
    this.openMapPage()
  },

  async onCheckInTap() {
    const permissionGuard = this.getPermissionGuard()
    if (!permissionGuard) {
      return
    }

    await permissionGuard.refreshCurrentUserProfile({
      showLoginToast: true
    })

    if (permissionGuard.isStaffUser()) {
      wx.navigateTo({
        url: STAFF_STUDY_REPORT_PAGE,
        fail: () => {
          wx.redirectTo({
            url: STAFF_STUDY_REPORT_PAGE
          })
        }
      })
      return
    }

    const studyReportAccessResult = await permissionGuard.ensureFeatureAccess({
      featureKey: STUDY_REPORT_ACCESS_FEATURE_KEY,
      featureName: 'AI研学报告',
      productName: 'AI研学报告权益',
      description: '生成专属AI研学报告需要开通权益',
      successRedirect: '/pages/check-in/check-in',
      showLoginToast: true
    })

    if (!studyReportAccessResult.allowed) {
      return
    }

    const targetUrl = this.data.checkInCompletedCount >= this.data.checkInTotalCount
      ? '/pages/my-page/my-page'
      : '/pages/check-in/check-in'

    wx.navigateTo({
      url: targetUrl,
      fail: () => {
        wx.redirectTo({
          url: targetUrl
        })
      }
    })
  },

  onMyPageEntryTap() {
    this.openMyPage()
  },

  openMapPage() {
    wx.navigateTo({
      url: GUIDE_MAP_PAGE,
      fail: () => {
        wx.redirectTo({
          url: GUIDE_MAP_PAGE
        })
      }
    })
  },

  openMyPage() {
    wx.navigateTo({
      url: '/pages/my-page/my-page',
      fail: () => {
        wx.redirectTo({
          url: '/pages/my-page/my-page'
        })
      }
    })
  },

  async onAIChatTap() {
    if (this.data.isLoggingIn) {
      this.pendingAIChatNavigation = true

      wx.showToast({
        title: '正在登录中，请稍候...',
        icon: 'loading',
        duration: 2000
      })

      return
    }

    await this.navigateToAIChat()
  },

  async navigateToAIChat() {
    const hasAccess = await this.ensureAIChatAccess()
    if (!hasAccess) {
      return
    }

    const token = wx.getStorageSync('token')

    if (!token) {
      auth.wxLogin().then(() => {
        this.doNavigateToAIChat()
      }).catch(() => {
        wx.showToast({
          title: '登录失败，请重试',
          icon: 'none'
        })
      })
      return
    }

    this.doNavigateToAIChat()
  },

  doNavigateToAIChat() {
    wx.navigateTo({
      url: GUIDE_AI_CHAT_PAGE,
      fail: () => {
        wx.redirectTo({
          url: GUIDE_AI_CHAT_PAGE
        })
      }
    })
  },

  getPermissionGuard() {
    if (this.permissionGuard) {
      return this.permissionGuard
    }

    this.permissionGuard = this.selectComponent('#permissionGuard')
    return this.permissionGuard || null
  },

  async ensureAIChatAccess() {
    const permissionGuard = this.getPermissionGuard()
    if (!permissionGuard) {
      return false
    }

    const accessResult = await permissionGuard.ensureFeatureAccess({
      featureKey: AI_CHAT_PAYMENT_FEATURE_KEY,
      featureName: 'AI智能对话',
      productName: 'AI聊天权限',
      description: AI_CHAT_SUBSCRIBE_DESCRIPTION,
      successRedirect: AI_CHAT_SUCCESS_REDIRECT_URL,
      showLoginToast: true
    })

    return !!accessResult.allowed
  },

  async silentLogin() {
    try {
      return await auth.checkAndAutoLogin(2500)
    } catch (error) {
      return false
    }
  },

  async syncLatestStudyReport() {
    if (this.syncingLatestStudyReport) {
      return
    }

    const token = auth.getToken()

    if (!token) {
      return
    }

    this.syncingLatestStudyReport = true

    try {
      await studyReportService.getLatestReport({
        token
      })
    } catch (error) {
      if (Number(error?.statusCode) === 404) {
        studyReportService.persistEmptyLatestReport()
      }
    } finally {
      this.syncingLatestStudyReport = false
    }
  },

  async syncCurrentUserProfile() {
    if (this.syncingCurrentUserProfile) {
      return
    }

    if (!auth.isLoggedIn()) {
      return
    }

    this.syncingCurrentUserProfile = true

    try {
      await auth.syncCurrentUserProfile()
    } catch (error) {
      console.warn('current user profile request failed:', error?.message || error)
    } finally {
      this.syncingCurrentUserProfile = false
    }
  },

  syncStatusBarUser() {
    const userInfo = auth.getUserInfo() || {}
    const nickname = String(userInfo.nickname || userInfo.nickName || '').trim()
    const hasLogin = auth.isLoggedIn()

    this.setData({
      statusUserName: hasLogin ? (nickname || STATUS_BAR_GUEST_NAME) : STATUS_BAR_GUEST_NAME,
      statusUserAvatarSrc: hasLogin ? STATUS_BAR_USER_AVATAR_SRC : STATUS_BAR_GUEST_AVATAR_SRC
    })
  },

  noop() {},

  getFeatureVideoContext() {
    if (!this.featureVideoContext) {
      this.featureVideoContext = wx.createVideoContext('homeFeatureVideo')
    }

    return this.featureVideoContext
  },

  openFeatureVideo() {
    this.setData({
      featureVideoVisible: true,
      featureVideoTitle: '边关重启',
      featureVideoSrc: HOME_PHOTO_CARD_VIDEO_URL
    }, () => {
      setTimeout(() => {
        try {
          this.getFeatureVideoContext().play()
        } catch (error) {}
      }, 80)
    })
  },

  pauseFeatureVideo() {
    try {
      this.getFeatureVideoContext().pause()
    } catch (error) {}
  },

  closeFeatureVideo(options = {}) {
    this.pauseFeatureVideo()

    if (options.updateState === false) {
      return
    }

    this.setData({
      featureVideoVisible: false
    })
  },

  onFeatureVideoMaskTap() {
    this.closeFeatureVideo()
  },

  onFeatureVideoCloseTap() {
    this.closeFeatureVideo()
  },

  syncCheckInEntry() {
    const collectionState = buildSecretCollectionState()
    const totalCount = collectionState.totalCount
    const completedCount = collectionState.collectedCount
    const displayCompletedCount = studyReportService.getLatestMatchedCount({
      totalCount,
      fallbackCount: completedCount
    })

    this.setData({
      checkInTitle: CHECK_IN_CARD_TITLE,
      checkInDescription: CHECK_IN_CARD_DESCRIPTION,
      checkInAction: CHECK_IN_CARD_ACTION,
      checkInTotalCount: totalCount,
      checkInCompletedCount: completedCount,
      checkInDisplayCompletedCount: displayCompletedCount
    })
  },

  showUiOnlyToast(title) {
    wx.showToast({
      title,
      icon: 'none',
      duration: 1800
    })
  }
}))
