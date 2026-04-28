let messageSeed = 0
const aiChatService = require('../../../../services/ai-chat-service')
const StreamingPcmPlayer = require('../../../../utils/streaming-pcm-player')
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
  createAIMessage(
    '你好呀！我是小九，你的贴心 AI 伙伴。\n\n你可以直接问我景点路线、游玩时间、门票服务和历史故事，我会按当前景区数据尽量给你清楚回答。'
  )
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
  const safeContent = String(content || '')
  return {
    id: buildMessageId('ai'),
    type: 'ai',
    avatar: '/images/xiaojiu.png',
    content: safeContent,
    segments: safeContent
      ? [{
          id: buildMessageId('segment'),
          type: 'text',
          content: safeContent
        }]
      : []
  }
}

function cloneSegments(message) {
  if (!message || !Array.isArray(message.segments)) {
    if (message && message.content) {
      return [{
        id: buildMessageId('segment'),
        type: 'text',
        content: message.content
      }]
    }
    return []
  }

  return message.segments.map((segment) => ({
    ...segment
  }))
}

function appendSegmentToAIMessage(message, segment) {
  const segments = cloneSegments(message)

  if (segment.type === 'text') {
    const lastSegment = segments[segments.length - 1]
    if (lastSegment && lastSegment.type === 'text') {
      lastSegment.content = `${lastSegment.content || ''}${segment.content || ''}`
    } else {
      segments.push({
        id: buildMessageId('segment'),
        type: 'text',
        content: segment.content || ''
      })
    }
  } else {
    segments.push({
      id: buildMessageId('segment'),
      ...segment
    })
  }

  return {
    ...message,
    segments,
    content: segments
      .filter((item) => item.type === 'text')
      .map((item) => item.content || '')
      .join('')
  }
}

function findCompleteJsonObjects(content) {
  const matches = []
  const text = String(content || '')
  let index = 0

  while (index < text.length) {
    if (text[index] !== '{') {
      index += 1
      continue
    }

    const start = index
    let depth = 0
    let inString = false
    let escaped = false

    for (let cursor = index; cursor < text.length; cursor += 1) {
      const char = text[cursor]

      if (escaped) {
        escaped = false
        continue
      }

      if (char === '\\' && inString) {
        escaped = true
        continue
      }

      if (char === '"') {
        inString = !inString
        continue
      }

      if (inString) {
        continue
      }

      if (char === '{') {
        depth += 1
      } else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          matches.push({
            start,
            end: cursor + 1,
            text: text.slice(start, cursor + 1)
          })
          index = cursor + 1
          break
        }
      }
    }

    if (depth !== 0) {
      index += 1
    }
  }

  return matches
}

function normalizeImageGroup(rawImageGroup = {}) {
  const images = Array.isArray(rawImageGroup.images)
    ? rawImageGroup.images
      .map((item) => ({
        url: item?.url || item?.imageUrl || '',
        caption: item?.caption || item?.description || item?.title || ''
      }))
      .filter((item) => item.url)
    : []

  return {
    title: rawImageGroup.title || '',
    description: rawImageGroup.description || '',
    images
  }
}

function normalizeSingleImageGroup(rawImage = {}) {
  const imageUrl = rawImage.imageUrl || rawImage.url || rawImage.src || ''

  return {
    title: rawImage.title || '',
    description: rawImage.description || '',
    images: imageUrl
      ? [{
          url: imageUrl,
          caption: rawImage.caption || rawImage.description || rawImage.title || ''
        }]
      : []
  }
}

function normalizeVideoCard(rawVideoCard = {}) {
  const videoUrl = rawVideoCard.videoUrl || rawVideoCard.url || rawVideoCard.src || ''
  const coverUrl = rawVideoCard.coverUrl || rawVideoCard.poster || rawVideoCard.imageUrl || ''
  const preferredDurationText = String(rawVideoCard.durationText || '').trim()
  const durationValue = String(rawVideoCard.duration || '').trim()
  const durationText = preferredDurationText || (
    durationValue
      ? /[^\d.\s]/.test(durationValue) ? durationValue : `${durationValue}秒`
      : ''
  )

  return {
    title: rawVideoCard.title || rawVideoCard.name || '景区视频',
    description: rawVideoCard.description || rawVideoCard.caption || '',
    videoUrl,
    coverUrl,
    durationText
  }
}

function normalizeEmbeddedMediaComponent(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  if (payload.imageScroll) {
    return {
      type: 'image-group',
      imageGroup: normalizeImageGroup(payload.imageScroll)
    }
  }

  if (payload.imageGroup) {
    return {
      type: 'image-group',
      imageGroup: normalizeImageGroup(payload.imageGroup)
    }
  }

  if (payload.image_display) {
    return {
      type: 'image-group',
      imageGroup: normalizeSingleImageGroup(payload.image_display)
    }
  }

  if (payload.videoCard) {
    return {
      type: 'video-card',
      videoCard: normalizeVideoCard(payload.videoCard)
    }
  }

  if (payload.video_display) {
    return {
      type: 'video-card',
      videoCard: normalizeVideoCard(payload.video_display)
    }
  }

  if ((payload.component === 'imageScroll' || payload.component === 'image_scroll') && payload.data) {
    return {
      type: 'image-group',
      imageGroup: normalizeImageGroup(payload.data)
    }
  }

  if (payload.component === 'imageGroup' && payload.data) {
    return {
      type: 'image-group',
      imageGroup: normalizeImageGroup(payload.data)
    }
  }

  if (payload.component === 'image_display' && payload.data) {
    return {
      type: 'image-group',
      imageGroup: normalizeSingleImageGroup(payload.data)
    }
  }

  if (payload.component === 'video_display' && payload.data) {
    return {
      type: 'video-card',
      videoCard: normalizeVideoCard(payload.data)
    }
  }

  if (payload.type === 'component' && (payload.component === 'image_display' || payload.component === 'imageScroll') && payload.content) {
    return {
      type: 'image-group',
      imageGroup: payload.component === 'imageScroll'
        ? normalizeImageGroup(payload.content)
        : normalizeSingleImageGroup(payload.content)
    }
  }

  if (payload.type === 'component' && payload.component === 'video_display' && payload.content) {
    return {
      type: 'video-card',
      videoCard: normalizeVideoCard(payload.content)
    }
  }

  if (payload.type === 'image_display' && payload.data) {
    return {
      type: 'image-group',
      imageGroup: normalizeSingleImageGroup(payload.data)
    }
  }

  if ((payload.type === 'imageScroll' || payload.type === 'image_scroll') && payload.data) {
    return {
      type: 'image-group',
      imageGroup: normalizeImageGroup(payload.data)
    }
  }

  if ((payload.type === 'image-group' || payload.type === 'imageGroup') && (payload.imageGroup || payload.data || payload.content)) {
    return {
      type: 'image-group',
      imageGroup: normalizeImageGroup(payload.imageGroup || payload.data || payload.content)
    }
  }

  if ((payload.type === 'video-card' || payload.type === 'video_display') && (payload.videoCard || payload.data || payload.content || payload.videoUrl || payload.url)) {
    return {
      type: 'video-card',
      videoCard: normalizeVideoCard(payload.videoCard || payload.data || payload.content || payload)
    }
  }

  return null
}

function buildSegmentsFromEmbeddedMediaComponents(content) {
  const matches = findCompleteJsonObjects(content)
  if (!matches.length) {
    return null
  }

  const segments = []
  let cursor = 0
  let hasMediaComponent = false

  matches.forEach((match) => {
    let mediaSegment = null

    try {
      mediaSegment = normalizeEmbeddedMediaComponent(JSON.parse(match.text))
    } catch (error) {
      mediaSegment = null
    }

    if (!mediaSegment) {
      return
    }

    if (mediaSegment.type === 'image-group' && (!mediaSegment.imageGroup || !Array.isArray(mediaSegment.imageGroup.images) || !mediaSegment.imageGroup.images.length)) {
      return
    }

    if (mediaSegment.type === 'video-card' && (!mediaSegment.videoCard || !mediaSegment.videoCard.videoUrl)) {
      return
    }

    const beforeText = String(content || '').slice(cursor, match.start).trim()
    if (beforeText) {
      segments.push({
        id: buildMessageId('segment'),
        type: 'text',
        content: beforeText
      })
    }

    segments.push({
      id: buildMessageId('segment'),
      ...mediaSegment
    })
    cursor = match.end
    hasMediaComponent = true
  })

  if (!hasMediaComponent) {
    return null
  }

  const afterText = String(content || '').slice(cursor).trim()
  if (afterText) {
    segments.push({
      id: buildMessageId('segment'),
      type: 'text',
      content: afterText
    })
  }

  return segments
}

function resolveEmbeddedMediaComponents(message) {
  const segments = cloneSegments(message)
  const nextSegments = []
  let changed = false

  segments.forEach((segment) => {
    if (segment.type !== 'text') {
      nextSegments.push(segment)
      return
    }

    const parsedSegments = buildSegmentsFromEmbeddedMediaComponents(segment.content || '')
    if (!parsedSegments) {
      nextSegments.push(segment)
      return
    }

    nextSegments.push(...parsedSegments)
    changed = true
  })

  if (!changed) {
    return message
  }

  return {
    ...message,
    segments: nextSegments,
    content: nextSegments
      .filter((item) => item.type === 'text')
      .map((item) => item.content || '')
      .join('\n\n')
  }
}

function hasRenderableSegments(message) {
  return cloneSegments(message).some((segment) => {
    if (segment.type === 'text') {
      return !!segment.content
    }

    if (segment.type === 'route-card') {
      return !!segment.routeCard
    }

    if (segment.type === 'image-group') {
      return !!(segment.imageGroup && Array.isArray(segment.imageGroup.images) && segment.imageGroup.images.length)
    }

    if (segment.type === 'video-card') {
      return !!(segment.videoCard && segment.videoCard.videoUrl)
    }

    return false
  })
}

function buildRouteContextPrompt(routeInfo) {
  if (!routeInfo) {
    return ''
  }

  const pointNames = Array.isArray(routeInfo.pointNames)
    ? routeInfo.pointNames.filter(Boolean)
    : []
  const lines = [
    `路线名称：${routeInfo.name || '推荐路线'}`,
    routeInfo.description ? `路线说明：${routeInfo.description}` : '',
    routeInfo.distanceText ? `路线距离：${routeInfo.distanceText}` : '',
    routeInfo.durationText ? `预计时长：${routeInfo.durationText}` : '',
    pointNames.length ? `沿途点位：${pointNames.join('、')}` : ''
  ].filter(Boolean)

  return lines.join('\n')
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
    this.clearActiveStream(true)
    this.destroyVoiceReplyPlayer()
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

  onPlayAudio(event) {
    if (!this.ensureAIChatAccess(AI_CHAT_VOICE_PLAY_FEATURE_KEY)) {
      return
    }

    const messageId = event?.detail?.messageId || ''
    const message = this.data.messageList.find((item) => item.id === messageId)
    const voiceChunks = Array.isArray(message?.voiceChunks) ? message.voiceChunks : []

    if (!voiceChunks.length) {
      wx.showToast({
        title: '当前回复还没有语音',
        icon: 'none',
        duration: 1600
      })
      return
    }

    this.playVoiceReplyChunks(voiceChunks)
  },

  onOpenRoute(event) {
    const routeData = event?.detail?.routeData || null

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
    const audioData = detail.audioData || ''

    if (!this.ensureAIChatAccess(AI_CHAT_VOICE_SEND_FEATURE_KEY)) {
      return
    }

    if (audioData) {
      this.sendMessage('语音输入', {
        skipAccessCheck: true,
        mode: 'voice',
        audioData,
        audioFormat: detail.audioFormat || 'wav'
      })
      return
    }

    wx.showToast({
      title: '语音识别暂未接入',
      icon: 'none',
      duration: 1600
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
      skipAccessCheck = false,
      mode = 'text',
      audioData = '',
      audioFormat = 'wav'
    } = options

    if (!skipAccessCheck && !this.ensureAIChatAccess(featureKey)) {
      return
    }

    const userMessage = createUserMessage(message)
    const pendingAIMessage = createAIMessage('')
    const requestMessage = mode === 'voice' ? undefined : this.buildRequestMessage(message)

    this.setData({
      messageList: this.data.messageList.concat(userMessage, pendingAIMessage),
      isGenerating: true,
      isAILoading: true,
      loadingStateText: 'AI正在思考中...'
    })

    this.scrollToBottom()
    this.clearActiveStream(true)

    const streamHandlers = {
      onEvent: (event) => {
        this.handleStreamEvent(pendingAIMessage.id, event)
      },
      onComplete: () => {
        this.finishStream(pendingAIMessage.id)
      },
      onError: (error) => {
        this.handleStreamError(pendingAIMessage.id, error)
      }
    }

    const requestTask = mode === 'voice'
      ? aiChatService.streamVoiceChat({
          message: requestMessage,
          audioData,
          audioFormat,
          outputMode: 'both',
          onEvent: streamHandlers.onEvent,
          onComplete: streamHandlers.onComplete,
          onError: streamHandlers.onError
        })
      : aiChatService.streamChat({
          message: requestMessage,
          scene: this.entryOptions?.context || 'guide',
          onEvent: streamHandlers.onEvent,
          onComplete: streamHandlers.onComplete,
          onError: streamHandlers.onError
        })

    this._activeStream = {
      aiMessageId: pendingAIMessage.id,
      userMessageId: userMessage.id,
      requestTask,
      finished: false
    }
  },

  cancelGeneration() {
    this.clearActiveStream(true)
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

  buildRequestMessage(message) {
    const routeContext = buildRouteContextPrompt(this.data.entryRouteInfo)
    if (!routeContext) {
      return message
    }

    return `${message}\n\n[当前路线参考]\n${routeContext}`
  },

  updateAIMessage(aiMessageId, updater) {
    const messageList = this.data.messageList.map((message) => {
      if (message.id !== aiMessageId) {
        return message
      }

      return updater(message)
    })

    this.setData({
      messageList
    })
  },

  appendAIMessageSegment(aiMessageId, segment) {
    this.updateAIMessage(aiMessageId, (message) => appendSegmentToAIMessage(message, segment))
  },

  handleStreamEvent(aiMessageId, event) {
    if (!event || this._activeStream?.aiMessageId !== aiMessageId) {
      return
    }

    if (event.type === 'start') {
      return
    }

    if (event.type === 'state') {
      this.setData({
        loadingStateText: event.message || 'AI正在思考中...'
      })
      return
    }

    if (event.type === 'transcription') {
      const transcript = String(event.text || '').trim()
      if (!transcript || !this._activeStream?.userMessageId) {
        return
      }

      const messageList = this.data.messageList.map((message) => {
        if (message.id !== this._activeStream.userMessageId) {
          return message
        }
        return {
          ...message,
          content: transcript
        }
      })
      this.setData({
        messageList
      })
      return
    }

    if (event.type === 'text') {
      this.appendAIMessageSegment(aiMessageId, {
        type: 'text',
        content: event.content || ''
      })
      this.setData({
        isAILoading: false
      })
      this.handlePostMessageRender()
      return
    }

    if (event.type === 'route-card') {
      this.appendAIMessageSegment(aiMessageId, {
        type: 'route-card',
        routeCard: event.routeCard
      })
      this.setData({
        isAILoading: false
      })
      this.handlePostMessageRender()
      return
    }

    if (event.type === 'image-group') {
      this.appendAIMessageSegment(aiMessageId, {
        type: 'image-group',
        imageGroup: event.imageGroup
      })
      this.setData({
        isAILoading: false
      })
      this.handlePostMessageRender()
      return
    }

    if (event.type === 'video-card') {
      this.appendAIMessageSegment(aiMessageId, {
        type: 'video-card',
        videoCard: event.videoCard
      })
      this.setData({
        isAILoading: false
      })
      this.handlePostMessageRender()
      return
    }

    if (event.type === 'audio_chunk') {
      const audioData = String(event.audioData || '').trim()
      if (!audioData) {
        return
      }
      this.updateAIMessage(aiMessageId, (message) => ({
        ...message,
        voiceChunks: (Array.isArray(message.voiceChunks) ? message.voiceChunks : []).concat({
          audioData,
          sampleRate: event.sampleRate || 16000,
          chunkIndex: event.chunkIndex || 0
        })
      }))
      this.appendVoiceReplyChunk({
        audioData,
        sampleRate: event.sampleRate || 16000,
        chunkIndex: event.chunkIndex || 0
      })
      return
    }

    if (event.type === 'error') {
      this.handleStreamError(aiMessageId, new Error(event.message || 'AI 对话失败'))
      return
    }

    if (event.type === 'done') {
      this.markStreamFinished(aiMessageId)
    }
  },

  markStreamFinished(aiMessageId) {
    if (!this._activeStream || this._activeStream.aiMessageId !== aiMessageId) {
      return
    }

    this._activeStream.finished = true
  },

  handleStreamError(aiMessageId, error) {
    if (this._activeStream?.aiMessageId !== aiMessageId) {
      return
    }

    const currentAIMessage = this.data.messageList.find((item) => item.id === aiMessageId)
    if (!hasRenderableSegments(currentAIMessage)) {
      this.appendAIMessageSegment(aiMessageId, {
        type: 'text',
        content: error?.message || 'AI 服务暂时不可用，请稍后再试。'
      })
    }

    this.clearActiveStream(true)
    this.setData({
      isGenerating: false,
      isAILoading: false,
      loadingStateText: 'AI正在思考中...'
    })
    this.handlePostMessageRender()

    wx.showToast({
      title: error?.message || 'AI 对话失败',
      icon: 'none',
      duration: 1800
    })
  },

  finishStream(aiMessageId) {
    if (this._activeStream?.aiMessageId !== aiMessageId) {
      return
    }

    this.updateAIMessage(aiMessageId, (message) => resolveEmbeddedMediaComponents(message))

    const currentAIMessage = this.data.messageList.find((item) => item.id === aiMessageId)
    if (!hasRenderableSegments(currentAIMessage)) {
      this.appendAIMessageSegment(aiMessageId, {
        type: 'text',
        content: '暂时没有返回可展示的内容。'
      })
    }

    this.clearActiveStream(true)
    this.setData({
      isGenerating: false,
      isAILoading: false,
      loadingStateText: 'AI正在思考中...'
    })
    this.handlePostMessageRender()
  },

  clearActiveStream(silent = false) {
    if (this._activeStream?.requestTask && typeof this._activeStream.requestTask.abort === 'function') {
      this._activeStream.requestTask.abort()
    }

    this._activeStream = null
    if (silent) {
      return
    }
  },

  ensureVoiceReplyPlayer() {
    if (this._voiceReplyPlayer) {
      return this._voiceReplyPlayer
    }
    this._voiceReplyPlayer = new StreamingPcmPlayer()
    return this._voiceReplyPlayer
  },

  appendVoiceReplyChunk(chunk) {
    try {
      this.ensureVoiceReplyPlayer().appendChunk(chunk)
    } catch (error) {
      wx.showToast({
        title: '语音播放失败',
        icon: 'none',
        duration: 1600
      })
    }
  },

  playVoiceReplyChunks(chunks) {
    try {
      this.ensureVoiceReplyPlayer().replay(chunks)
    } catch (error) {
      wx.showToast({
        title: '语音播放失败',
        icon: 'none',
        duration: 1600
      })
    }
  },

  destroyVoiceReplyPlayer() {
    if (!this._voiceReplyPlayer) {
      return
    }
    try {
      this._voiceReplyPlayer.stop()
    } catch (error) {
      // Ignore cleanup failures during page unload.
    }
    this._voiceReplyPlayer = null
  },

  handlePostMessageRender() {
    if (this.data.isAtBottom) {
      this.scrollToBottom()
      return
    }

    this.setData({
      hasNewMessage: true,
      showScrollToBottom: true
    })
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
