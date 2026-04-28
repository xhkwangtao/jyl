const {
  buildSecretCollectionState
} = require('../../utils/secret-collection')
const {
  buildAiOfficerState
} = require('../../utils/ai-officer')
const studyReportService = require('../../services/study-report-service')

const PAGE_STYLE = 'background: #f6f1e8;'
const UNLOCK_ANIMATION_DURATION_MS = 1800
const SECRET_REVEALED_STORAGE_KEY = 'jyl_secret_revealed_ids'
const REPORT_FILLED_CELL_SECRET_MAPPING = [
  { filledCellCode: '11', secretId: 'poi-02', themeName: '工匠', symbolName: '九边十一镇' },
  { filledCellCode: '12', secretId: 'poi-11', themeName: '军防', symbolName: '大炮' },
  { filledCellCode: '13', secretId: 'poi-08', themeName: '军防', symbolName: '战鼓' },
  { filledCellCode: '14', secretId: 'secret-point-08', themeName: '生态', symbolName: '柏叶' },
  { filledCellCode: '15', secretId: 'secret-point-10', themeName: '工匠', symbolName: '火焰广场' },
  { filledCellCode: '16', secretId: 'poi-06', themeName: '工匠', symbolName: '石料小景' },
  { filledCellCode: '17', secretId: 'secret-point-17', themeName: '文化', symbolName: '碑帖' },
  { filledCellCode: '21', secretId: 'poi-12', themeName: '工匠', symbolName: '毛驴' },
  { filledCellCode: '22', secretId: 'secret-point-14', themeName: '文化', symbolName: '诗词' },
  { filledCellCode: '23', secretId: 'poi-16', themeName: '生态', symbolName: '平衡' },
  { filledCellCode: '24', secretId: 'secret-point-18', themeName: '生态', symbolName: '角度' },
  { filledCellCode: '25', secretId: 'poi-17', themeName: '军防', symbolName: '营房' },
  { filledCellCode: '26', secretId: 'secret-point-23', themeName: '军防', symbolName: '堡垒' },
  { filledCellCode: '27', secretId: 'poi-20', themeName: '军防', symbolName: '烽火台' },
  { filledCellCode: '31', secretId: 'poi-22', themeName: '军防', symbolName: '敌楼' },
  { filledCellCode: '32', secretId: 'poi-23', themeName: '文化', symbolName: '碑刻' },
  { filledCellCode: '33', secretId: 'secret-point-27', themeName: '生态', symbolName: '熊掌' },
  { filledCellCode: '34', secretId: 'secret-point-28', themeName: '生态', symbolName: '矿产' },
  { filledCellCode: '35', secretId: 'secret-point-29', themeName: '生态', symbolName: '保护区' }
]
const REPORT_FILLED_CELL_META_BY_SECRET_ID = REPORT_FILLED_CELL_SECRET_MAPPING.reduce((accumulator, item) => {
  accumulator[item.secretId] = item
  return accumulator
}, {})
const REPORT_FILLED_CELL_SECRET_ID_BY_CODE = REPORT_FILLED_CELL_SECRET_MAPPING.reduce((accumulator, item) => {
  accumulator[item.filledCellCode] = item.secretId
  return accumulator
}, {})

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
        safeAreaBottom,
        windowHeight: systemInfo.windowHeight || systemInfo.screenHeight || 0
      }
    }

    const navContentPaddingTop = Math.max(menuButton.top - statusBarHeight, 0)
    const navContentHeight = menuButton.height + navContentPaddingTop * 2

    return {
      navBarHeight: statusBarHeight + navContentHeight,
      safeAreaBottom,
      windowHeight: systemInfo.windowHeight || systemInfo.screenHeight || 0
    }
  } catch (error) {
    return {
      navBarHeight: 84,
      safeAreaBottom: 0,
      windowHeight: 0
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

function buildSecretCollectionIdSet(secretList = []) {
  return new Set(
    (secretList || [])
      .filter((item) => item?.collected)
      .map((item) => String(item.id || ''))
      .filter(Boolean)
  )
}

function getRevealedSecretIdSet() {
  try {
    const revealedIds = wx.getStorageSync(SECRET_REVEALED_STORAGE_KEY)
    if (!Array.isArray(revealedIds)) {
      return new Set()
    }

    return new Set(
      revealedIds
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  } catch (error) {
    return new Set()
  }
}

function saveRevealedSecretIdSet(revealedIdSet = new Set()) {
  const revealedIdList = Array.from(revealedIdSet).filter(Boolean)

  try {
    wx.setStorageSync(SECRET_REVEALED_STORAGE_KEY, revealedIdList)
  } catch (error) {}
}

function normalizeFilledCellCode(value) {
  return String(value === undefined || value === null ? '' : value).trim()
}

function buildReportFilledSecretIdSet(filledCellList = []) {
  const secretIdSet = new Set()

  ;(filledCellList || []).forEach((filledCellCode) => {
    const normalizedFilledCellCode = normalizeFilledCellCode(filledCellCode)
    const secretId = REPORT_FILLED_CELL_SECRET_ID_BY_CODE[normalizedFilledCellCode]

    if (secretId) {
      secretIdSet.add(secretId)
    }
  })

  return secretIdSet
}

function buildReportDrivenSecretList(secretList = [], filledCellList = []) {
  const reportFilledSecretIdSet = buildReportFilledSecretIdSet(filledCellList)
  const hasReportFilledCells = reportFilledSecretIdSet.size > 0
  const secretItemMap = new Map(
    (secretList || []).map((item) => [String(item?.id || ''), item])
  )
  const orderedSecretList = []

  REPORT_FILLED_CELL_SECRET_MAPPING.forEach((reportMeta) => {
    const sourceItem = secretItemMap.get(reportMeta.secretId)

    if (!sourceItem) {
      return
    }

    secretItemMap.delete(reportMeta.secretId)

    const collected = hasReportFilledCells
      ? reportFilledSecretIdSet.has(reportMeta.secretId)
      : !!sourceItem.collected
    const patternLabel = `${reportMeta.themeName}暗号`
    const collectionHint = hasReportFilledCells
      ? (
        collected
          ? `${reportMeta.themeName} · ${reportMeta.symbolName} 已收入你的研学档案`
          : `答题卡识别 ${reportMeta.themeName} · ${reportMeta.symbolName} 后将在这里点亮`
      )
      : sourceItem.collectionHint

    orderedSecretList.push({
      ...sourceItem,
      collected,
      statusText: collected ? '已收集' : '未收集',
      iconDisplayPath: collected ? sourceItem.iconDarkPath : sourceItem.iconGrayPath,
      themeTag: reportMeta.themeName,
      categoryName: patternLabel,
      patternLabel,
      secretName: reportMeta.symbolName,
      secretIndexText: reportMeta.filledCellCode,
      timeText: hasReportFilledCells
        ? (collected ? '已同步答题卡图谱' : '答题卡识别后点亮')
        : sourceItem.timeText,
      collectionHint,
      reportFilledCellCode: reportMeta.filledCellCode
    })
  })

  return orderedSecretList.concat(Array.from(secretItemMap.values()))
}

function buildThemeSummaryList(secretList = []) {
  const themeOrder = ['工匠', '军防', '文化', '生态']

  return themeOrder.map((themeName) => {
    const itemList = (secretList || []).filter((item) => String(item.themeTag || '').trim() === themeName)
    const collectedCount = itemList.filter((item) => item?.collected).length

    return {
      themeName,
      totalCount: itemList.length,
      collectedCount,
      pendingCount: Math.max(itemList.length - collectedCount, 0)
    }
  }).filter((item) => item.totalCount > 0)
}

function buildHeroCopy(totalCount, collectedCount) {
  if (collectedCount <= 0) {
    return {
      heroTitle: `开始收集 ${totalCount} 枚研学暗号`,
      heroDesc: '答题卡识别后，这里会按研学报告中的暗号图谱点亮对应图案。'
    }
  }

  if (collectedCount >= totalCount) {
    return {
      heroTitle: '全部暗号图案已收齐',
      heroDesc: '当前答题卡中的暗号图谱已经完整点亮，可以继续查看本次研学成果。'
    }
  }

  return {
    heroTitle: `已收集 ${collectedCount} / ${totalCount} 枚暗号`,
    heroDesc: '答题卡识别后，这里会同步展示已经点亮的暗号图谱。'
  }
}

function decorateSecretWallList(secretList = [], options = {}) {
  const pendingRevealIdSet = options.pendingRevealIdSet instanceof Set
    ? options.pendingRevealIdSet
    : new Set()
  const unlockingIdSet = options.unlockingIdSet instanceof Set
    ? options.unlockingIdSet
    : new Set()

  return (secretList || []).map((item) => {
    const secretId = String(item?.id || '')
    const collected = !!item?.collected
    const pendingReveal = collected && pendingRevealIdSet.has(secretId)
    const justUnlocked = collected && unlockingIdSet.has(secretId)
    const revealCollected = collected && (!pendingReveal || justUnlocked)

    return {
      ...item,
      pendingReveal,
      justUnlocked,
      revealCollected,
      wallCaptionText: revealCollected
        ? item.patternLabel
        : pendingReveal
          ? '点击解锁'
          : '暗号未解锁'
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
    aiAvatarSrc: '',
    aiOfficerTitle: '',
    aiOfficerShortTitle: '',
    aiOfficerRewardText: '',
    aiOfficerDesc: '',
    aiOfficerNextHint: '',
    aiOfficerScore: 0,
    aiOfficerScoreText: '0 军功',
    aiOfficerProgressPercent: 0,
    aiOfficerProgressPercentText: '0%',
    aiOfficerNextTitle: '',
    aiOfficerRankList: [],
    aiOfficerStageText: '',
    aiOfficerScoreRuleText: '',
    totalCount: 0,
    collectedCount: 0,
    displayCollectedCount: 0,
    pendingCount: 0,
    displayPendingCount: 0,
    progressPercent: 0,
    progressPercentText: '0%',
    displayProgressPercent: 0,
    displayProgressPercentText: '0%',
    reportUnlocked: false,
    reportStatusText: '待解锁',
    reportTitle: '',
    reportDesc: '',
    reportActionText: '去收集暗号',
    themeSummaryList: [],
    secretList: [],
    collectedSecretList: [],
    pendingSecretList: []
  },

  onLoad() {
    this.pendingUnlockAnimationSecretIdSet = new Set()
    this.revealedSecretIdSet = getRevealedSecretIdSet()
    this.unlockAnimationTimer = null
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

  onUnload() {
    if (this.unlockAnimationTimer) {
      clearTimeout(this.unlockAnimationTimer)
      this.unlockAnimationTimer = null
    }
  },

  refreshSecretState() {
    const collectionState = buildSecretCollectionState()
    const reportFilledCellList = studyReportService.getLatestFilledCells()
    const reportDrivenSecretList = buildReportDrivenSecretList(collectionState.secretList, reportFilledCellList)
    const displayCollectedCount = studyReportService.getLatestMatchedCount({
      totalCount: collectionState.totalCount,
      fallbackCount: collectionState.collectedCount
    })
    const displayPendingCount = Math.max(collectionState.totalCount - displayCollectedCount, 0)
    const displayProgressPercent = collectionState.totalCount
      ? Math.round((displayCollectedCount / collectionState.totalCount) * 100)
      : 0
    const currentCollectedSecretIdSet = buildSecretCollectionIdSet(reportDrivenSecretList)
    const nextRevealedSecretIdSet = new Set()
    const nextPendingUnlockAnimationSecretIdSet = new Set()

    currentCollectedSecretIdSet.forEach((secretId) => {
      if (this.revealedSecretIdSet.has(secretId)) {
        nextRevealedSecretIdSet.add(secretId)
        return
      }

      nextPendingUnlockAnimationSecretIdSet.add(secretId)
    })

    this.revealedSecretIdSet = nextRevealedSecretIdSet
    this.pendingUnlockAnimationSecretIdSet = nextPendingUnlockAnimationSecretIdSet
    saveRevealedSecretIdSet(this.revealedSecretIdSet)

    const nextSecretList = decorateSecretWallList(reportDrivenSecretList, {
      pendingRevealIdSet: this.pendingUnlockAnimationSecretIdSet
    })
    const heroCopy = buildHeroCopy(collectionState.totalCount, displayCollectedCount)
    const reportUnlocked = collectionState.reportUnlocked || displayCollectedCount >= collectionState.totalCount

    if (this.unlockAnimationTimer) {
      clearTimeout(this.unlockAnimationTimer)
      this.unlockAnimationTimer = null
    }

    this.setData({
      userNickname: getUserNickname(),
      ...collectionState,
      ...heroCopy,
      displayCollectedCount,
      displayPendingCount,
      displayProgressPercent,
      displayProgressPercentText: `${displayProgressPercent}%`,
      reportUnlocked,
      themeSummaryList: buildThemeSummaryList(reportDrivenSecretList),
      secretList: nextSecretList,
      collectedSecretList: reportDrivenSecretList.filter((item) => item.collected),
      pendingSecretList: reportDrivenSecretList.filter((item) => !item.collected),
      ...buildAiOfficerState(reportDrivenSecretList)
    })
  },

  triggerPendingSecretUnlockAnimationById(secretId) {
    const normalizedSecretId = String(secretId || '').trim()
    if (!normalizedSecretId || !this.pendingUnlockAnimationSecretIdSet.has(normalizedSecretId)) {
      return false
    }

    this.pendingUnlockAnimationSecretIdSet.delete(normalizedSecretId)
    this.revealedSecretIdSet.add(normalizedSecretId)
    saveRevealedSecretIdSet(this.revealedSecretIdSet)
    const unlockingIdSet = new Set([normalizedSecretId])

    this.setData({
      secretList: decorateSecretWallList(this.data.secretList, {
        pendingRevealIdSet: this.pendingUnlockAnimationSecretIdSet,
        unlockingIdSet
      })
    })

    if (this.unlockAnimationTimer) {
      clearTimeout(this.unlockAnimationTimer)
    }

    this.unlockAnimationTimer = setTimeout(() => {
      this.unlockAnimationTimer = null
      this.setData({
        secretList: decorateSecretWallList(this.data.secretList, {
          pendingRevealIdSet: this.pendingUnlockAnimationSecretIdSet
        })
      })
    }, UNLOCK_ANIMATION_DURATION_MS)

    return true
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
    navigateToPage('/subpackages/guide/pages/map/map')
  },

  onReportTap() {
    if (!this.data.reportUnlocked) {
      wx.showToast({
        title: '集齐全部暗号后解锁研学报告',
        icon: 'none',
        duration: 1800
      })
      return
    }

    navigateToPage('/pages/study-report/study-report')
  },

  onSecretTap(event) {
    const secretId = event.currentTarget?.dataset?.secretId
    const pendingReveal = event.currentTarget?.dataset?.pendingReveal

    if (pendingReveal && this.triggerPendingSecretUnlockAnimationById(secretId)) {
      return
    }
  }
})
