let messageSeed = 0

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

Page({
  data: {
    pageReady: false,
    navHeight: 84,
    messageList: MOCK_MESSAGES,
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

  onLoad() {
    this.initLayoutMetrics()

    setTimeout(() => {
      this.setData({
        pageReady: true
      }, () => {
        setTimeout(() => {
          this.measureChatViewport()
          this.scrollToBottom()
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

  onGoToMap() {
    wx.navigateTo({
      url: '/pages/map/map',
      fail: () => {
        wx.redirectTo({
          url: '/pages/map/map'
        })
      }
    })
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

    this.sendMessage(question)
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

    this.sendMessage(message)
  },

  onVoiceSend(event) {
    const detail = event.detail || {}
    const message = (detail.message || '帮我介绍一下黄崖关长城有什么特色？').trim()

    this.sendMessage(message)
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

  sendMessage(message) {
    if (this.data.isGenerating) {
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
  }
})
