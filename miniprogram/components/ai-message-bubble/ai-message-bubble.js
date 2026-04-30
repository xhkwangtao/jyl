const markdownRichText = require('../../utils/markdown-rich-text')
const {
  checkCurrentLocationInScenicArea,
  buildScenicVideoAccessDeniedMessage
} = require('../../utils/scenic-location')
const {
  isVoiceMessage,
  formatVoiceDurationText
} = require('../../utils/ai-chat-voice-utils')

function buildRenderSegments(message) {
  if (isVoiceMessage(message)) {
    return []
  }

  const segments = Array.isArray(message?.segments)
    ? message.segments
    : message?.content
      ? [{ id: 'fallback-text', type: 'text', content: message.content }]
      : []

  return segments.map((segment) => {
    if (segment.type !== 'text') {
      return segment
    }

    return {
      ...segment,
      richTextNodes: markdownRichText.render(segment.content || '')
    }
  })
}

function buildVoiceState(message) {
  const transcript = String(message?.voice?.transcript || message?.content || '')
  const status = String(message?.voice?.status || '').trim().toLowerCase()
  const hasVoiceAudio = Array.isArray(message?.voiceChunks) && message.voiceChunks.length > 0
  let voiceStatusText = '等待语音'

  if (status === 'loading') {
    voiceStatusText = hasVoiceAudio ? '语音回复生成中' : '正在生成语音'
  } else if (status === 'completed') {
    voiceStatusText = hasVoiceAudio ? '点击播放语音' : '语音已生成'
  } else if (status === 'error') {
    voiceStatusText = '语音生成失败'
  } else if (hasVoiceAudio) {
    voiceStatusText = '点击播放语音'
  }

  return {
    isVoiceMessage: true,
    voiceDurationText: formatVoiceDurationText(message?.voice?.durationMs || 0),
    voiceTranscript: transcript,
    voiceStatusText,
    hasVoiceTranscript: !!transcript,
    hasVoiceAudio
  }
}

Component({
  properties: {
    message: {
      type: Object,
      value: {}
    }
  },

  data: {
    renderSegments: [],
    isVoiceMessage: false,
    voiceDurationText: '0秒',
    voiceTranscript: '',
    voiceStatusText: '',
    hasVoiceTranscript: false,
    hasVoiceAudio: false
  },

  observers: {
    message(message) {
      const voice = isVoiceMessage(message)

      if (voice) {
        this.setData({
          renderSegments: [],
          ...buildVoiceState(message)
        })
        return
      }

      this.setData({
        renderSegments: buildRenderSegments(message),
        isVoiceMessage: false,
        voiceDurationText: '0秒',
        voiceTranscript: '',
        voiceStatusText: '',
        hasVoiceTranscript: false,
        hasVoiceAudio: false
      })
    }
  },

  methods: {
    onCopyTap() {
      this.triggerEvent('copyText', {
        content: (this.properties.message && this.properties.message.content) || ''
      })
    },

    onPlayAudioTap() {
      this.triggerEvent('playAudio', {
        messageId: (this.properties.message && this.properties.message.id) || ''
      })
    },

    onRouteCardTap(event) {
      const segmentIndex = event?.currentTarget?.dataset?.segmentIndex
      const segment = this.properties.message?.segments?.[segmentIndex]
      const routeData = segment?.routeCard?.routeData || null

      if (!routeData) {
        return
      }

      this.triggerEvent('openRoute', {
        routeData
      })
    },

    onPreviewImageTap(event) {
      const segmentIndex = event?.currentTarget?.dataset?.segmentIndex
      const imageIndex = event?.currentTarget?.dataset?.imageIndex
      const segment = this.properties.message?.segments?.[segmentIndex]
      const images = Array.isArray(segment?.imageGroup?.images)
        ? segment.imageGroup.images
        : []
      const urls = images.map((item) => item.url).filter(Boolean)

      if (!urls.length) {
        return
      }

      const current = urls[imageIndex] || urls[0]
      wx.previewImage({
        current,
        urls
      })
    },

    async onVideoPlay(event) {
      const segmentIndex = Number(event?.currentTarget?.dataset?.segmentIndex)
      const accessResult = await checkCurrentLocationInScenicArea()
      if (accessResult.allowed) {
        return
      }

      try {
        const videoContext = wx.createVideoContext(`video-card-${segmentIndex}`, this)
        if (videoContext) {
          videoContext.pause()
          videoContext.seek(0)
        }
      } catch (error) {}

      const deniedMessage = buildScenicVideoAccessDeniedMessage(accessResult)
      wx.showModal({
        title: deniedMessage.title,
        content: deniedMessage.content,
        showCancel: false,
        confirmText: '知道了'
      })
    }
  }
})
