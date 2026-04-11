Component({
  properties: {
    message: {
      type: Object,
      value: {}
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
