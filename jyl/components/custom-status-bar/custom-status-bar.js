Component({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    guestText: '游客'
  },

  lifetimes: {
    attached() {
      try {
        const systemInfo = wx.getSystemInfoSync()
        const statusBarHeight = systemInfo.statusBarHeight || 20
        const menuButtonInfo = typeof wx.getMenuButtonBoundingClientRect === 'function'
          ? wx.getMenuButtonBoundingClientRect()
          : null

        let navBarHeight = 44

        if (menuButtonInfo && menuButtonInfo.height) {
          navBarHeight = menuButtonInfo.height + (menuButtonInfo.top - statusBarHeight) * 2
        }

        this.setData({
          statusBarHeight,
          navBarHeight
        })
      } catch (error) {
        this.setData({
          statusBarHeight: 20,
          navBarHeight: 44
        })
      }
    }
  },

  methods: {
    onUserAvatarTap() {
      this.triggerEvent('avatartap')
    }
  }
})
