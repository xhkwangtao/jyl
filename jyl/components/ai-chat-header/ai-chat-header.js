Component({
  properties: {
    topOffset: {
      type: Number,
      value: 0
    }
  },

  data: {
    avatarSrc: '/images/ai-assistant-xiaoying.png'
  },

  lifetimes: {
    attached() {
      this.setAvatarByDPR()
    }
  },

  methods: {
    setAvatarByDPR() {
      try {
        const systemInfo = wx.getSystemInfoSync()
        const pixelRatio = systemInfo.pixelRatio || 1
        const avatarSrc = pixelRatio >= 2
          ? '/images/ai-assistant-xiaoying@2x.png'
          : '/images/ai-assistant-xiaoying.png'

        this.setData({
          avatarSrc
        })
      } catch (error) {
        this.setData({
          avatarSrc: '/images/ai-assistant-xiaoying.png'
        })
      }
    },

    onGoToMapTap() {
      this.triggerEvent('gotomap')
    }
  }
})
