const {
  buildSecretCollectionState
} = require('../../utils/secret-collection')

const PAGE_STYLE = 'background: #f6f1e8;'
const RULE_LIST = [
  {
    indexText: '01',
    title: '到景点现场扫码',
    desc: '学生到达布置了二维码的景点后，扫描对应二维码即可记录一枚暗号图案。'
  },
  {
    indexText: '02',
    title: '收集全部暗号',
    desc: '每个二维码对应一枚暗号图案，只有把全部图案收齐，研学任务才算完成。'
  },
  {
    indexText: '03',
    title: '解锁研学报告',
    desc: '暗号图案全部解锁后，当前设备上的研学报告会进入可查看状态。'
  }
]

function getLayoutMetrics() {
  try {
    const systemInfo = wx.getSystemInfoSync()
    const menuButton = typeof wx.getMenuButtonBoundingClientRect === 'function'
      ? wx.getMenuButtonBoundingClientRect()
      : null
    const statusBarHeight = systemInfo.statusBarHeight || 20
    const safeAreaBottom = systemInfo.safeArea
      ? Math.max(systemInfo.screenHeight - systemInfo.safeArea.bottom, 0)
      : 0

    if (!menuButton || !menuButton.height) {
      return {
        navBarHeight: statusBarHeight + 44,
        safeAreaBottom
      }
    }

    const navContentPaddingTop = Math.max(menuButton.top - statusBarHeight, 0)
    const navContentHeight = menuButton.height + navContentPaddingTop * 2

    return {
      navBarHeight: statusBarHeight + navContentHeight,
      safeAreaBottom
    }
  } catch (error) {
    return {
      navBarHeight: 84,
      safeAreaBottom: 0
    }
  }
}

function getUserNickname() {
  const userInfo = wx.getStorageSync('userInfo') || {}
  return userInfo.nickName || userInfo.nickname || '游客'
}

function navigateToPage(url) {
  wx.navigateTo({
    url,
    fail: () => {
      wx.redirectTo({
        url
      })
    }
  })
}

Page({
  data: {
    pageReady: false,
    pageStyle: PAGE_STYLE,
    navBarHeightStyle: '',
    userNickname: '游客',
    heroTitle: '',
    heroDesc: '',
    totalCount: 0,
    collectedCount: 0,
    pendingCount: 0,
    progressPercent: 0,
    progressPercentText: '0%',
    reportUnlocked: false,
    reportStatusText: '待解锁',
    reportTitle: '',
    reportDesc: '',
    reportActionText: '去收集暗号',
    collectedSecretList: [],
    pendingSecretList: [],
    ruleList: RULE_LIST
  },

  onLoad() {
    const { navBarHeight, safeAreaBottom } = getLayoutMetrics()

    this.setData({
      pageReady: true,
      navBarHeightStyle: `--nav-bar-height: ${navBarHeight}px; --page-safe-bottom: ${safeAreaBottom}px;`
    })

    this.refreshSecretState()
  },

  onShow() {
    this.refreshSecretState()
  },

  refreshSecretState() {
    this.setData({
      userNickname: getUserNickname(),
      ...buildSecretCollectionState()
    })
  },

  onBackTap() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({
        delta: 1
      })
      return
    }

    this.onHomeTap()
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

  onOpenCollectionPage() {
    navigateToPage('/pages/check-in/check-in')
  },

  onOpenMapPage() {
    navigateToPage('/pages/map/map')
  },

  onReportTap() {
    if (!this.data.reportUnlocked) {
      this.onOpenCollectionPage()
      return
    }

    wx.showToast({
      title: '研学报告页面待接入',
      icon: 'none',
      duration: 1800
    })
  },

  onSecretTap(event) {
    const pointId = event.currentTarget?.dataset?.id

    if (!pointId) {
      return
    }

    navigateToPage(`/pages/map/map?pointId=${pointId}`)
  }
})
