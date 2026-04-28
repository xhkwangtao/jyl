Component({
  properties: {
    topOffset: {
      type: Number,
      value: 0
    }
  },

  data: {
    avatarSrc: '/images/xiaojiu.png'
  },

  lifetimes: {
    attached() {
      this.setAvatarByDPR()
    }
  },

  methods: {
    setAvatarByDPR() {
      this.setData({
        avatarSrc: '/images/xiaojiu.png'
      })
    },

    onGoToMapTap() {
      this.triggerEvent('gotomap')
    }
  }
})
