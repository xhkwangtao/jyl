Component({
  properties: {
    title: {
      type: String,
      value: '景点讲解'
    },
    description: {
      type: String,
      value: '深度讲述景点\n背后的历史故事'
    },
    decorationImage: {
      type: String,
      value: '/images/icons/explanation-character.svg'
    }
  },

  methods: {
    onCardTap() {
      this.triggerEvent('cardtap')
    }
  }
})
