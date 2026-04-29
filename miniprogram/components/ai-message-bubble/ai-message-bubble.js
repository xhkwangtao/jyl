const markdownRichText = require('../../utils/markdown-rich-text')
const {
  checkCurrentLocationInScenicArea,
  buildScenicVideoAccessDeniedMessage
} = require('../../utils/scenic-location')

function buildRenderSegments(message) {
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

Component({
  properties: {
    message: {
      type: Object,
      value: {}
    }
  },

  data: {
    renderSegments: []
  },

  observers: {
    message(message) {
      this.setData({
        renderSegments: buildRenderSegments(message)
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
