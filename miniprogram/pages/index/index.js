const auth = require('../../utils/auth')
const {
  JYL_MARKER_POINTS
} = require('../../config/jyl-map-data')
const {
  getCheckinRecords
} = require('../../utils/checkin')

Page({
  data: {
    safeAreaBottom: 34,
    isLoggingIn: false,
    welcomeTitle: '欢迎来到九眼楼～',
    dialogText: '小九带您告别走马观花，长城不仅是照片里的背景，历史不再是书本里的文字，触摸长城砖石、解锁历史，让快乐旅途藏满文化与知识的重量。',
    aiNameDisplay: ['小', '九'],
    aiRoleDisplay: ['A', 'I', '使', '者'],
    checkInTitle: '研学暗号收集',
    checkInDescription: '暗号点已整理完成\n到景点扫码后可逐个解锁图案',
    checkInAction: '去收集',
    checkInTotalCount: JYL_MARKER_POINTS.length,
    checkInCompletedCount: 0
  },

  onLoad() {
    this.initLayoutMetrics()
    this.syncCheckInEntry()
  },

  onShow() {
    this.syncCheckInEntry()
    this.pendingAIChatNavigation = false
    this.setData({
      isLoggingIn: true
    })

    this.silentLogin().finally(() => {
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
    this.pendingAIChatNavigation = false
  },

  onPullDownRefresh() {
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 250)
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
      url: '/pages/scenic-audio-list/scenic-audio-list',
      fail: () => {
        wx.redirectTo({
          url: '/pages/scenic-audio-list/scenic-audio-list'
        })
      }
    })
  },

  onPhotoSpotsTap() {
    this.showUiOnlyToast('功能搭建中')
  },

  onMapPreviewTap() {
    this.openMapPage()
  },

  onCheckInTap() {
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
      url: '/pages/map/map',
      fail: () => {
        wx.redirectTo({
          url: '/pages/map/map'
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

  onAIChatTap() {
    if (this.data.isLoggingIn) {
      this.pendingAIChatNavigation = true

      wx.showToast({
        title: '正在登录中，请稍候...',
        icon: 'loading',
        duration: 2000
      })

      return
    }

    this.navigateToAIChat()
  },

  navigateToAIChat() {
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
      url: '/pages/ai-chat/ai-chat',
      fail: () => {
        wx.redirectTo({
          url: '/pages/ai-chat/ai-chat'
        })
      }
    })
  },

  async silentLogin() {
    try {
      return await auth.checkAndAutoLogin(2500)
    } catch (error) {
      return false
    }
  },

  syncCheckInEntry() {
    const records = getCheckinRecords()
    const totalCount = JYL_MARKER_POINTS.length
    const completedCount = Object.keys(records).length

    let checkInDescription = `${totalCount}枚暗号等待收集\n到指定景点扫码后解锁研学报告`
    let checkInAction = '去收集'

    if (completedCount > 0 && completedCount < totalCount) {
      checkInDescription = `已收集 ${completedCount}/${totalCount} 枚暗号\n继续前往景点扫码解锁剩余图案`
      checkInAction = '继续收集'
    } else if (completedCount >= totalCount) {
      checkInDescription = `${totalCount}枚暗号已全部收齐\n研学报告已进入可解锁状态`
      checkInAction = '查看档案'
    }

    this.setData({
      checkInDescription,
      checkInAction,
      checkInTotalCount: totalCount,
      checkInCompletedCount: completedCount
    })
  },

  showUiOnlyToast(title) {
    wx.showToast({
      title,
      icon: 'none',
      duration: 1800
    })
  }
})
