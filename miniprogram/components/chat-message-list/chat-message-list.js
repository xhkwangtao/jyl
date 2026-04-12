Component({
  properties: {
    messages: {
      type: Array,
      value: []
    },
    isLoading: {
      type: Boolean,
      value: false
    },
    loadingText: {
      type: String,
      value: 'AI正在思考中...'
    }
  },

  methods: {
    onCopyText(event) {
      this.triggerEvent('copyText', event.detail || {})
    },

    onPlayAudio(event) {
      this.triggerEvent('playAudio', event.detail || {})
    }
  }
})
