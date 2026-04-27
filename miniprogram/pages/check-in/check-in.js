const {
  updatePointCheckin
} = require('../../utils/checkin')
const {
  ENABLE_MANUAL_SECRET_COLLECTION_FOR_TESTING
} = require('../../config/feature-flags')
const {
  SECRET_FILTER_OPTIONS,
  buildSecretCollectionState,
  filterSecretList,
  resolveSecretPointFromScanResult
} = require('../../utils/secret-collection')
const {
  GUIDE_MAP_PAGE
} = require('../../utils/guide-routes')

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

function buildSectionCaption(currentFilter, collectedCount, pendingCount) {
  if (currentFilter === 'checked') {
    return `当前展示 ${collectedCount} 枚已收集的暗号图案`
  }

  if (currentFilter === 'unchecked') {
    return `当前展示 ${pendingCount} 枚待收集的暗号图案`
  }

  return '当前已经按景区真实暗号点整理，共 19 枚暗号图案。'
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

function normalizeOptionValue(value) {
  if (value === undefined || value === null) {
    return ''
  }

  const rawText = String(value).trim()
  if (!rawText) {
    return ''
  }

  try {
    return decodeURIComponent(rawText)
  } catch (error) {
    return rawText
  }
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
    ruleList: RULE_LIST,
    targetSecretId: '',
    scanTip: '支持识别二维码中携带的点位名称、历史点位 id、暗号名等信息。',
    manualCollectEnabled: ENABLE_MANUAL_SECRET_COLLECTION_FOR_TESTING,
    manualCollectTip: ENABLE_MANUAL_SECRET_COLLECTION_FOR_TESTING
      ? '当前为测试模式，列表中的“测试标记”按钮仅用于功能联调；正式使用时仅支持扫码收集。'
      : '正式模式下仅支持扫码收集，学生不能手动标记暗号。'
  },

  onLoad(options = {}) {
    this.entryMapPointId = normalizeOptionValue(options.mapPointId)
    this.entrySecretId = normalizeOptionValue(options.secretId)
    this.entryTargetHintShown = false
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
    const targetSecret = this.resolveEntryTargetSecret(collectionState.secretList)
    const targetSecretId = targetSecret?.id || ''

    this.setData({
      ...collectionState,
      visibleSecretList,
      targetSecretId,
      visibleCount: visibleSecretList.length,
      sectionCaption: buildSectionCaption(currentFilter, collectionState.collectedCount, collectionState.pendingCount)
    }, () => {
      this.notifyEntryTarget(targetSecret)
    })
  },

  resolveEntryTargetSecret(secretList = []) {
    if (this.entrySecretId) {
      const matchedBySecretId = secretList.find((item) => String(item.id) === String(this.entrySecretId))

      if (matchedBySecretId) {
        return matchedBySecretId
      }
    }

    if (this.entryMapPointId) {
      return secretList.find((item) => String(item.mapPointId || '') === String(this.entryMapPointId)) || null
    }

    return null
  },

  notifyEntryTarget(targetSecret) {
    if (this.entryTargetHintShown || !targetSecret) {
      return
    }

    this.entryTargetHintShown = true

    wx.showToast({
      title: `已定位到 ${targetSecret.name}`,
      icon: 'none',
      duration: 1600
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
    if (!this.data.manualCollectEnabled) {
      wx.showToast({
        title: '正式模式下仅支持扫码收集',
        icon: 'none',
        duration: 1600
      })
      return
    }

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
      title: nextChecked ? '已测试标记为已收集' : '已取消测试标记',
      icon: 'none',
      duration: 1600
    })
  },

  onMapTap(event) {
    const mapPointId = event.currentTarget?.dataset?.mapId

    if (!mapPointId) {
      wx.showToast({
        title: '该暗号点暂未接入地图定位',
        icon: 'none',
        duration: 1600
      })
      return
    }

    navigateToPage(`${GUIDE_MAP_PAGE}?pointId=${mapPointId}`)
  },

  onMyPageTap() {
    navigateToPage('/pages/my-page/my-page')
  },

  onBackTap() {
    const pages = getCurrentPages()
    const previousRoute = pages.length > 1 ? pages[pages.length - 2].route : ''
    const delta = previousRoute === 'pages/my-page/my-page' ? 2 : 1

    wx.navigateBack({
      delta,
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
