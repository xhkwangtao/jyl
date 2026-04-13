const {
  buildSecretCollectionState
} = require('../../utils/secret-collection')
const {
  buildAiOfficerState
} = require('../../utils/ai-officer')

const PAGE_STYLE = 'background: #f6f1e8;'

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

function formatDateTime(timestamp) {
  const safeTimestamp = Number(timestamp)

  if (!Number.isFinite(safeTimestamp) || safeTimestamp <= 0) {
    return '刚刚完成'
  }

  const date = new Date(safeTimestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}`
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
    completedAtText: '',
    aiOfficerTitle: '',
    aiOfficerScoreText: '',
    totalCount: 0,
    themeSummaryList: [],
    secretList: [],
    reportSummaryList: []
  },

  onLoad() {
    const { navBarHeight, safeAreaBottom } = getLayoutMetrics()

    this.setData({
      navBarHeightStyle: `--nav-bar-height: ${navBarHeight}px; --page-safe-bottom: ${safeAreaBottom}px;`
    })

    this.refreshReportState()
  },

  onShow() {
    this.refreshReportState()
  },

  refreshReportState() {
    const collectionState = buildSecretCollectionState()

    if (!collectionState.reportUnlocked) {
      wx.showToast({
        title: '收齐全部暗号后解锁研学报告',
        icon: 'none',
        duration: 1800
      })

      setTimeout(() => {
        wx.redirectTo({
          url: '/pages/my-page/my-page'
        })
      }, 200)
      return
    }

    const completedAt = Math.max(...collectionState.secretList.map((item) => item.collectedAt || 0))
    const aiOfficerState = buildAiOfficerState(collectionState.secretList)
    const reportSummaryList = [
      `已完成 ${collectionState.totalCount} / ${collectionState.totalCount} 枚暗号收集`,
      `已将小九晋升为 ${aiOfficerState.aiOfficerTitle}`,
      '已依次解锁工匠、军防、生态、文化四条研学线索',
      '当前页面可作为现场研学任务完成后的收集总览'
    ]

    this.setData({
      pageReady: true,
      userNickname: getUserNickname(),
      completedAtText: formatDateTime(completedAt),
      aiOfficerTitle: aiOfficerState.aiOfficerTitle,
      aiOfficerScoreText: aiOfficerState.aiOfficerScoreText,
      totalCount: collectionState.totalCount,
      themeSummaryList: collectionState.themeSummaryList,
      secretList: collectionState.secretList,
      reportSummaryList
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

  onOpenMyPage() {
    navigateToPage('/pages/my-page/my-page')
  },

  onOpenCollectionPage() {
    navigateToPage('/pages/check-in/check-in')
  }
})
