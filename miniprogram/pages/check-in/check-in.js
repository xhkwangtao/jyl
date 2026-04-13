const {
  updatePointCheckin
} = require('../../utils/checkin')
const {
  SECRET_FILTER_OPTIONS,
  buildSecretCollectionState,
  filterSecretList,
  resolveSecretPointFromScanResult
} = require('../../utils/secret-collection')

function buildSectionCaption(currentFilter, collectedCount, pendingCount) {
  if (currentFilter === 'checked') {
    return `当前展示 ${collectedCount} 枚已收集的暗号图案`
  }

  if (currentFilter === 'unchecked') {
    return `当前展示 ${pendingCount} 枚待收集的暗号图案`
  }

  return '当前先按可打卡景点整理为暗号收集点，后续可替换为真实二维码名单。'
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
    pageTitle: '暗号收集',
    navFadeHeight: 50,
    navBackground: 'rgba(255,255,255,0)',
    navTheme: 'dark',
    filterOptions: SECRET_FILTER_OPTIONS,
    currentFilter: 'all',
    heroTitle: '',
    heroDesc: '',
    totalCount: 0,
    collectedCount: 0,
    pendingCount: 0,
    progressPercent: 0,
    progressPercentText: '0%',
    sectionCaption: '',
    visibleCount: 0,
    secretList: [],
    visibleSecretList: [],
    scanTip: '支持识别二维码中携带的点位 id、key 或景点名称。'
  },

  onLoad() {
    this.refreshPageState()
  },

  onShow() {
    this.refreshPageState()
  },

  onPageScroll({ scrollTop = 0 }) {
    const max = this.data.navFadeHeight || 50
    const ratio = Math.min(Math.max(scrollTop / max, 0), 1)
    const nextOpacity = Number(ratio.toFixed(2))

    this.setData({
      navBackground: `rgba(255,255,255,${nextOpacity})`,
      navTheme: 'dark'
    })
  },

  refreshPageState() {
    const collectionState = buildSecretCollectionState()
    const currentFilter = this.data.currentFilter || 'all'
    const visibleSecretList = filterSecretList(collectionState.secretList, currentFilter)

    this.setData({
      ...collectionState,
      visibleSecretList,
      visibleCount: visibleSecretList.length,
      sectionCaption: buildSectionCaption(currentFilter, collectionState.collectedCount, collectionState.pendingCount)
    })
  },

  onFilterTap(event) {
    const nextFilter = event.currentTarget?.dataset?.value || 'all'

    if (nextFilter === this.data.currentFilter) {
      return
    }

    this.setData({
      currentFilter: nextFilter
    }, () => {
      this.refreshPageState()
    })
  },

  onScanCollect() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: ({ result }) => {
        const matchedSecret = resolveSecretPointFromScanResult(result)

        if (!matchedSecret) {
          wx.showToast({
            title: '未识别到有效暗号二维码',
            icon: 'none',
            duration: 1800
          })
          return
        }

        if (matchedSecret.collected) {
          wx.showToast({
            title: `${matchedSecret.secretCode} 已收集`,
            icon: 'none',
            duration: 1600
          })
          return
        }

        updatePointCheckin(matchedSecret.id, true)
        this.refreshPageState()

        wx.showToast({
          title: `已收集 ${matchedSecret.secretCode}`,
          icon: 'none',
          duration: 1600
        })
      },
      fail: (error) => {
        if (/cancel/i.test(error?.errMsg || '')) {
          return
        }

        wx.showToast({
          title: '扫码失败，请重试',
          icon: 'none',
          duration: 1600
        })
      }
    })
  },

  onToggleCheckin(event) {
    const pointId = event.currentTarget?.dataset?.id

    if (!pointId) {
      return
    }

    const target = (this.data.secretList || []).find((item) => String(item.id) === String(pointId))

    if (!target) {
      return
    }

    const nextChecked = !target.collected
    updatePointCheckin(pointId, nextChecked)
    this.refreshPageState()

    wx.showToast({
      title: nextChecked ? '已标记为已收集' : '已取消收集',
      icon: 'none',
      duration: 1600
    })
  },

  onMapTap(event) {
    const pointId = event.currentTarget?.dataset?.id

    if (!pointId) {
      return
    }

    navigateToPage(`/pages/map/map?pointId=${pointId}`)
  },

  onMyPageTap() {
    navigateToPage('/pages/my-page/my-page')
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
  }
})
