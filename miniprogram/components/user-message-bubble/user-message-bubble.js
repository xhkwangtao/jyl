const {
  isVoiceMessage,
  formatVoiceDurationText
} = require('../../utils/ai-chat-voice-utils')

Component({
  properties: {
    message: {
      type: Object,
      value: {}
    }
  },

  data: {
    isVoiceMessage: false,
    voiceDurationText: '0秒',
    voiceTranscript: ''
  },

  observers: {
    message(message) {
      const voice = isVoiceMessage(message)
      this.setData({
        isVoiceMessage: voice,
        voiceDurationText: voice
          ? formatVoiceDurationText(message?.voice?.durationMs || 0)
          : '0秒',
        voiceTranscript: voice
          ? String(message?.voice?.transcript || message?.content || '')
          : ''
      })
    }
  },

  methods: {
    onBubbleTap() {
      this.triggerEvent('bubbleTap', {
        message: this.properties.message
      })
    }
  }
})
