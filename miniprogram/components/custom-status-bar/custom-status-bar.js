const DEFAULT_AVATAR_SRC = '/images/icons/user.svg'
const AI_AVATAR_SRC = '/images/xiaojiu.png'

Component({
  properties: {
    userName: {
      type: String,
      value: ''
    },
    avatarSrc: {
      type: String,
      value: ''
    }
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    displayUserName: '游客',
    displayAvatarSrc: DEFAULT_AVATAR_SRC,
    avatarMode: 'aspectFit',
    avatarShellClassName: 'user-avatar-shell',
    avatarClassName: 'user-avatar'
  },

  observers: {
    'userName, avatarSrc': function (userName, avatarSrc) {
      this.syncDisplayProfile(userName, avatarSrc)
    }
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

      this.syncDisplayProfile(this.properties.userName, this.properties.avatarSrc)
    }
  },

  methods: {
    syncDisplayProfile(userName, avatarSrc) {
      const normalizedUserName = String(userName || '').trim() || '游客'
      const normalizedAvatarSrc = String(avatarSrc || '').trim() || DEFAULT_AVATAR_SRC
      const isAiAvatar = normalizedAvatarSrc === AI_AVATAR_SRC

      this.setData({
        displayUserName: normalizedUserName,
        displayAvatarSrc: normalizedAvatarSrc,
        avatarMode: isAiAvatar ? 'aspectFill' : 'aspectFit',
        avatarShellClassName: isAiAvatar ? 'user-avatar-shell user-avatar-shell-ai' : 'user-avatar-shell',
        avatarClassName: isAiAvatar ? 'user-avatar user-avatar-ai' : 'user-avatar'
      })
    },

    onUserAvatarTap() {
      this.triggerEvent('avatartap')
    }
  }
})
