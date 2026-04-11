Component({
  properties: {
    message: {
      type: Object,
      value: {}
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
    }
  }
})
