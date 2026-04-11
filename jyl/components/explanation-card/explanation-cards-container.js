Component({
  properties: {
    visible: {
      type: Boolean,
      value: true
    }
  },

  data: {
    explanationTitle: '景点讲解',
    explanationDescription: '深度讲述景点\n背后的历史故事',
    explanationImage: '/images/icons/explanation-character.svg'
  },

  methods: {
    onExplanationCardTap() {
      this.triggerEvent('cardclick', {
        source: 'explanation-card'
      })
    },

    onAiChatCardTap() {
      this.triggerEvent('cardclick', {
        source: 'aichat-card'
      })
    },

    onAiPhotoCardTap() {
      this.triggerEvent('cardclick', {
        source: 'aiphoto-card'
      })
    }
  }
})
