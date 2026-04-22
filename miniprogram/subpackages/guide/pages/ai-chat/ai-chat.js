let messageSeed = 0
const {
  isFeaturePaid
} = require('../../../../utils/audio-access.js')
const {
  GUIDE_MAP_PAGE,
  GUIDE_MAP_ROUTE,
  GUIDE_AI_CHAT_PAGE,
  GUIDE_SUBSCRIBE_PAGE
} = require('../../../../utils/guide-routes')

const AI_CHAT_ACCESS_FEATURE_KEY = 'vip'
const AI_CHAT_TEXT_FEATURE_KEY = 'ai.chat.send-message'
const AI_CHAT_VOICE_SEND_FEATURE_KEY = 'ai.chat.voice-send'
const AI_CHAT_VOICE_PLAY_FEATURE_KEY = 'ai.chat.voice-play'

const AI_CHAT_PAYWALL_CONFIG = {
  [AI_CHAT_TEXT_FEATURE_KEY]: {
    featureName: 'AI智能对话',
    productName: 'AI聊天权限',
    description: '体验AI智能导览对话需要VIP权限'
  },
  [AI_CHAT_VOICE_SEND_FEATURE_KEY]: {
    featureName: 'AI语音对话',
    productName: 'AI语音聊天权限',
    description: '体验AI语音对话功能需要VIP权限'
  },
  [AI_CHAT_VOICE_PLAY_FEATURE_KEY]: {
    featureName: 'AI语音播放',
    productName: 'AI语音播放权限',
    description: '播放AI语音回复需要VIP权限'
  }
}

const MOCK_MESSAGES = [
  {
    id: 'ai-welcome',
    type: 'ai',
    avatar: '/images/xiaoying-avatar.png',
    content: '你好呀！我是小九，你的贴心 AI 伙伴。\n\n你可以直接问我景点路线、游玩时间、门票服务和历史故事，我会按照 miniapp 的聊天界面风格一步步为你介绍。'
  },
  {
    id: 'user-demo',
    type: 'user',
    avatar: '/images/icons/user.svg',
    content: '第一次来，推荐我先看哪里？'
  },
  {
    id: 'ai-demo',
    type: 'ai',
    avatar: '/images/xiaoying-avatar.png',
    content: '如果你是第一次来，我建议先从关城核心区域进入视线最完整的点位，再根据体力决定是否继续登城。\n\n这样最容易先建立整体空间感，后面的路线也会更顺。'
  }
]

function buildMessageId(prefix) {
  messageSeed += 1
  return `${prefix}-${Date.now()}-${messageSeed}`
}

function createUserMessage(content) {
  return {
    id: buildMessageId('user'),
    type: 'user',
    avatar: '/images/icons/user.svg',
    content
  }
}

function createAIMessage(content) {
  return {
    id: buildMessageId('ai'),
    type: 'ai',
    avatar: '/images/xiaoying-avatar.png',
    content
  }
}

function buildMockReply(question) {
  if (question.includes('景点') || question.includes('哪里')) {
    return '核心推荐可以先看关城主体、城墙步道和视野最好的几个高点。\n\n如果你想更快进入状态，建议先把整体路线看清，再决定是偏历史视角还是偏拍照视角。'
  }

  if (question.includes('路线') || question.includes('怎么走')) {
    return '第一次来更适合先走一条主线，把最重要的点位串起来。\n\n先完整看一遍核心区域，再根据体力选择继续登城或者回到关城周边慢慢逛，会比较顺。'
  }

  if (question.includes('开放') || question.includes('门票') || question.includes('停车') || question.includes('餐饮')) {
    return '服务类问题我可以继续按模块帮你拆开，比如开放时间、门票、停车和补给点。\n\n如果你愿意，我下一步可以把这几个信息按“到达前 / 游览中 / 离开前”整理成更清晰的一份。'
  }

  if (question.includes('戚继光') || question.includes('历史')) {
    return '黄崖关最吸引人的地方之一，就是军事防御体系和历史叙事是叠在一起的。\n\n如果你更偏文化视角，我可以继续把人物、关隘功能和沿线看点拆成一条更适合边走边听的讲法。'
  }

  return '这个问题我可以继续展开讲。\n\n为了保持 UI 复刻干净，目前这里先用静态回答顶住样式层，下一步会把真实输入区和交互也补齐。'
}

function safeDecodeURIComponent(value) {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return decodeURIComponent(value)
  } catch (error) {
    return value
  }
}

function buildRouteEntryInfo(routeInfo) {
  if (!routeInfo || typeof routeInfo !== 'object') {
    return null
  }

  const pointNames = Array.isArray(routeInfo.pointNames)
    ? routeInfo.pointNames.filter(Boolean)
    : []
  const pointNamesPreview = pointNames.slice(0, 6)

  return {
    ...routeInfo,
    description: routeInfo.description || '这是一条结合景区现有点位整理出的推荐游览路线。',
    distanceText: routeInfo.distanceText || routeInfo.distance || '',
    durationText: routeInfo.durationText || routeInfo.duration || '',
    pointCount: routeInfo.pointCount || pointNames.length,
    pointNames,
    pointNamesPreview,
    remainingPointCount: Math.max(pointNames.length - pointNamesPreview.length, 0)
  }
}

function buildRouteIntroMessage(routeInfo) {
  if (!routeInfo) {
    return ''
  }

  const pointSummary = routeInfo.pointNamesPreview.join('、')
  const pointSuffix = routeInfo.remainingPointCount > 0 ? ` 等 ${routeInfo.pointCount} 个点位` : ''
  const lines = [
    `已为你带入路线「${routeInfo.name || '推荐路线'}」。`,
    routeInfo.description || '',
    routeInfo.distanceText || routeInfo.durationText
      ? `全程约 ${routeInfo.distanceText || '待确认'}，预计 ${routeInfo.durationText || '待确认'}。`
      : '',
    pointSummary ? `沿途会经过 ${pointSummary}${pointSuffix}。` : ''
  ].filter(Boolean)

  return lines.join('\n\n')
}

Page({
  data: {
    pageReady: false,
    navHeight: 84,
    messageList: MOCK_MESSAGES,
    entryRouteInfo: null,
    quickQuestionsExpanded: false,
    isGenerating: false,
    isAILoading: false,
    loadingStateText: 'AI正在思考中...',
    scrollTop: 0,
    chatViewportHeight: 0,
    isAtBottom: true,
    isProgrammaticScroll: false,
    showScrollToBottom: false,
    hasNewMessage: false
  },

  onUnload() {
    this.clearReplyTimer()
  },

  onLoad(options = {}) {
    this.entryOptions = { ...options }
    const entryRouteInfo = this.resolveEntryRouteInfo(options)
    const presetMessage = safeDecodeURIComponent(options.message || '')

    this.initLayoutMetrics()
    this.setData({
      entryRouteInfo,
      messageList: entryRouteInfo
        ? [MOCK_MESSAGES[0], createAIMessage(buildRouteIntroMessage(entryRouteInfo))]
        : MOCK_MESSAGES
    })

    setTimeout(() => {
      this.setData({
        pageReady: true
      }, () => {
        setTimeout(() => {
          this.measureChatViewport()
          this.scrollToBottom()

          if (!entryRouteInfo && presetMessage && this.hasAIChatAccess()) {
            this.sendMessage(presetMessage)
          }
        }, 80)
      })
    }, 180)
  },

  onPullDownRefresh() {
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 200)
  },

  initLayoutMetrics() {
    try {
      const systemInfo = wx.getSystemInfoSync()
      const menuButton = typeof wx.getMenuButtonBoundingClientRect === 'function'
        ? wx.getMenuButtonBoundingClientRect()
        : null
      const statusBarHeight = systemInfo.statusBarHeight || 20

      let navHeight = statusBarHeight + 44

      if (menuButton && menuButton.height) {
        navHeight = statusBarHeight + menuButton.height + (menuButton.top - statusBarHeight) * 2
      }

      this.setData({
        navHeight
      })
    } catch (error) {
      this.setData({
        navHeight: 84
      })
    }
  },

  resolveEntryRouteInfo(options = {}) {
    if (options.hasRouteInfo !== 'true') {
      return null
    }

    const app = getApp()
    const rawRouteInfo = app?.globalData?.aiChatRouteInfo || null

    if (app?.globalData) {
      app.globalData.aiChatRouteInfo = null
    }

    return buildRouteEntryInfo(rawRouteInfo)
  },

  openMapWithRoute(routeData) {
    const safeRouteData = routeData && typeof routeData === 'object' ? routeData : null
    const pages = getCurrentPages()
    const previousPage = pages[pages.length - 2]

    if (safeRouteData && previousPage?.route === GUIDE_MAP_ROUTE) {
      const app = getApp()
      const pendingNavigation = {
        routeData: safeRouteData
      }

      if (app) {
        app.globalData = app.globalData || {}
        app.globalData.pendingNavigation = pendingNavigation
      }

      wx.setStorageSync('pending_navigation', pendingNavigation)
      wx.navigateBack({
        delta: 1
      })
      return
    }

    const routeQuery = safeRouteData
      ? `?routeData=${encodeURIComponent(JSON.stringify(safeRouteData))}`
      : ''

    wx.navigateTo({
      url: `${GUIDE_MAP_PAGE}${routeQuery}`,
      fail: () => {
        wx.redirectTo({
          url: `${GUIDE_MAP_PAGE}${routeQuery}`
        })
      }
    })
  },

  onGoToMap() {
    this.openMapWithRoute(this.data.entryRouteInfo?.routeData || null)
  },

  onPreviewEntryRoute() {
    const routeData = this.data.entryRouteInfo?.routeData

    if (!routeData) {
      wx.showToast({
        title: '当前没有可预览的路线',
        icon: 'none',
        duration: 1600
      })
      return
    }

    this.openMapWithRoute(routeData)
  },

  onCopyText(event) {
    const content = event.detail ? event.detail.content : ''

    if (!content) {
      return
    }

    wx.setClipboardData({
      data: content
    })
  },

  onPlayAudio() {
    if (!this.ensureAIChatAccess(AI_CHAT_VOICE_PLAY_FEATURE_KEY)) {
      return
    }

    wx.showToast({
      title: '语音播报暂未接入',
      icon: 'none',
      duration: 1600
    })
  },

  onQuickQuestionSelect(event) {
    const detail = event.detail || {}
    const question = detail.question ? detail.question.text : ''

    if (!question) {
      return
    }

    this.sendMessage(question, {
      featureKey: AI_CHAT_TEXT_FEATURE_KEY
    })
  },

  onQuickQuestionExpandChange(event) {
    this.setData({
      quickQuestionsExpanded: !!(event.detail && event.detail.expanded)
    })
  },

  onSendMessage(event) {
    const detail = event.detail || {}
    const message = (detail.message || '').trim()

    if (!message) {
      return
    }

    this.sendMessage(message, {
      featureKey: AI_CHAT_TEXT_FEATURE_KEY
    })
  },

  onVoiceSend(event) {
    const detail = event.detail || {}
    const message = (detail.message || '帮我介绍一下黄崖关长城有什么特色？').trim()

    if (!message) {
      return
    }

    if (!this.ensureAIChatAccess(AI_CHAT_VOICE_SEND_FEATURE_KEY)) {
      return
    }

    this.sendMessage(message, {
      skipAccessCheck: true
    })
  },

  onChatScroll(event) {
    if (this.data.isProgrammaticScroll) {
      return
    }

    const detail = event.detail || {}
    const scrollTop = detail.scrollTop || 0
    const scrollHeight = detail.scrollHeight || 0
    const viewportHeight = this.data.chatViewportHeight || 0
    const distanceFromBottom = Math.max(scrollHeight - scrollTop - viewportHeight, 0)
    const isAtBottom = distanceFromBottom < 96

    this.setData({
      isAtBottom,
      hasNewMessage: isAtBottom ? false : this.data.hasNewMessage,
      showScrollToBottom: !isAtBottom && this.data.messageList.length > 3
    })
  },

  onScrollToLower() {
    this.setData({
      isAtBottom: true,
      hasNewMessage: false,
      showScrollToBottom: false
    })
  },

  onScrollToBottomTap() {
    this.scrollToBottom()

    if (typeof wx.vibrateShort === 'function') {
      wx.vibrateShort({
        type: 'light'
      })
    }
  },

  sendMessage(message, options = {}) {
    if (this.data.isGenerating) {
      return
    }

    const {
      featureKey = AI_CHAT_TEXT_FEATURE_KEY,
      skipAccessCheck = false
    } = options

    if (!skipAccessCheck && !this.ensureAIChatAccess(featureKey)) {
      return
    }

    this.setData({
      messageList: this.data.messageList.concat(createUserMessage(message)),
      isGenerating: true,
      isAILoading: true
    })

    this.scrollToBottom()
    this.clearReplyTimer()

    this._replyTimer = setTimeout(() => {
      this.setData({
        messageList: this.data.messageList.concat(createAIMessage(buildMockReply(message))),
        isGenerating: false,
        isAILoading: false
      })

      if (this.data.isAtBottom) {
        this.scrollToBottom()
      } else {
        this.setData({
          hasNewMessage: true,
          showScrollToBottom: true
        })
      }

      this._replyTimer = null
    }, 900)
  },

  cancelGeneration() {
    this.clearReplyTimer()
    this.setData({
      isGenerating: false,
      isAILoading: false
    })

    wx.showToast({
      title: '已停止生成',
      icon: 'none',
      duration: 1400
    })
  },

  scrollToBottom() {
    this.setData({
      isProgrammaticScroll: true
    })

    const query = this.createSelectorQuery()
    query.select('.chat-messages-area').scrollOffset()
    query.select('.chat-messages-area').boundingClientRect()
    query.exec((result) => {
      const scrollInfo = result && result[0]
      const rect = result && result[1]

      if (scrollInfo && rect) {
        this.setData({
          scrollTop: Math.max(0, (scrollInfo.scrollHeight || 0) - rect.height + 48),
          isAtBottom: true,
          hasNewMessage: false,
          showScrollToBottom: false
        })
      } else {
        this.setData({
          scrollTop: this.data.scrollTop + 12000,
          isAtBottom: true,
          hasNewMessage: false,
          showScrollToBottom: false
        })
      }

      setTimeout(() => {
        this.setData({
          isProgrammaticScroll: false
        })
      }, 320)
    })
  },

  clearReplyTimer() {
    if (this._replyTimer) {
      clearTimeout(this._replyTimer)
      this._replyTimer = null
    }
  },

  measureChatViewport() {
    const query = this.createSelectorQuery()
    query.select('.chat-messages-area').boundingClientRect()
    query.exec((result) => {
      const rect = result && result[0]

      if (!rect || !rect.height) {
        return
      }

      this.setData({
        chatViewportHeight: rect.height
      })
    })
  },

  hasAIChatAccess() {
    return isFeaturePaid(AI_CHAT_ACCESS_FEATURE_KEY)
  },

  ensureAIChatAccess(featureKey = AI_CHAT_TEXT_FEATURE_KEY) {
    if (this.hasAIChatAccess()) {
      return true
    }

    this.navigateToVipPayment(featureKey)
    return false
  },

  getCurrentPageUrl() {
    const options = this.entryOptions || {}
    const query = Object.keys(options).reduce((result, key) => {
      const value = options[key]

      if (value === undefined || value === null || value === '') {
        return result
      }

      result.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(safeDecodeURIComponent(value)))}`)
      return result
    }, []).join('&')

    return query ? `${GUIDE_AI_CHAT_PAGE}?${query}` : GUIDE_AI_CHAT_PAGE
  },

  navigateToVipPayment(featureKey = AI_CHAT_TEXT_FEATURE_KEY) {
    const subscribeConfig = AI_CHAT_PAYWALL_CONFIG[featureKey] || AI_CHAT_PAYWALL_CONFIG[AI_CHAT_TEXT_FEATURE_KEY]
    const app = getApp()
    const successRedirectUrl = this.getCurrentPageUrl()

    if (this.data.entryRouteInfo && app) {
      app.globalData = app.globalData || {}
      app.globalData.aiChatRouteInfo = this.data.entryRouteInfo
    }

    const subscribeUrl = `${GUIDE_SUBSCRIBE_PAGE}?feature=${encodeURIComponent(featureKey)}&featureName=${encodeURIComponent(subscribeConfig.featureName)}&productName=${encodeURIComponent(subscribeConfig.productName)}&description=${encodeURIComponent(subscribeConfig.description)}&successRedirect=${encodeURIComponent(successRedirectUrl)}`

    wx.navigateTo({
      url: subscribeUrl,
      fail: () => {
        wx.redirectTo({
          url: subscribeUrl
        })
      }
    })
  }
})
