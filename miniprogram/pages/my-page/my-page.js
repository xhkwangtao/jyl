const {
  buildSecretCollectionState
} = require('../../utils/secret-collection')
const {
  buildAiOfficerState
} = require('../../utils/ai-officer')

const PAGE_STYLE = 'background: #f6f1e8;'
const UNLOCK_ANIMATION_DURATION_MS = 1800
const SECRET_REVEALED_STORAGE_KEY = 'jyl_secret_revealed_ids'

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
    pendingCount: 0,
    progressPercent: 0,
    progressPercentText: '0%',
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
    const currentCollectedSecretIdSet = buildSecretCollectionIdSet(collectionState.secretList)
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

    const nextSecretList = decorateSecretWallList(collectionState.secretList, {
      pendingRevealIdSet: this.pendingUnlockAnimationSecretIdSet
    })

    if (this.unlockAnimationTimer) {
      clearTimeout(this.unlockAnimationTimer)
      this.unlockAnimationTimer = null
    }

    this.setData({
      userNickname: getUserNickname(),
      ...collectionState,
      secretList: nextSecretList,
      ...buildAiOfficerState(collectionState.secretList)
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
