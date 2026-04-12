Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    backgroundColor: {
      type: String,
      value: 'rgba(0, 0, 0, 0.3)'
    },
    showHomeButton: {
      type: Boolean,
      value: true
    },
    showUserAvatar: {
      type: Boolean,
      value: true
    },
    backIcon: {
      type: String,
      value: '/images/icons/back.svg'
    },
    homeIcon: {
      type: String,
      value: '/images/icons/home-line-blod.svg'
    },
    userIcon: {
      type: String,
      value: '/images/icons/user.svg'
    },
    useCapsuleStyle: {
      type: Boolean,
      value: true
    },
    theme: {
      type: String,
      value: 'dark'
    },
    useDefaultBack: {
      type: Boolean,
      value: true
    }
  },

  data: {
    statusBarHeight: 20,
    navContentPaddingTop: 0,
    rightButtonDistanceVw: 4,
    capsulePosition: {
      top: 0,
      height: 32,
      right: 12
    },
    actualNavContentHeight: 32
  },

  lifetimes: {
    attached() {
      const systemInfo = wx.getSystemInfoSync();
      const menuButton = typeof wx.getMenuButtonBoundingClientRect === 'function'
        ? wx.getMenuButtonBoundingClientRect()
        : null;

      const statusBarHeight = systemInfo.statusBarHeight || 20;

      if (!menuButton) {
        this.setData({
          statusBarHeight,
          navContentPaddingTop: 10,
          actualNavContentHeight: 32
        });
        return;
      }

      const navContentPaddingTop = Math.max(menuButton.top - statusBarHeight, 0);
      const actualNavContentHeight = menuButton.height + navContentPaddingTop * 2;
      const capsuleRight = Math.max(systemInfo.windowWidth - menuButton.right, 0);
      const rightButtonDistanceVw = ((capsuleRight + menuButton.width + 12) / systemInfo.windowWidth) * 100;

      this.setData({
        statusBarHeight,
        navContentPaddingTop,
        rightButtonDistanceVw: rightButtonDistanceVw.toFixed(2),
        capsulePosition: {
          top: navContentPaddingTop,
          height: menuButton.height,
          right: capsuleRight
        },
        actualNavContentHeight
      });
    }
  },

  methods: {
    onBackTap() {
      this.triggerEvent('back');

      if (!this.properties.useDefaultBack) {
        return;
      }

      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.redirectTo({
            url: '/pages/index/index',
            fail: () => {
              wx.reLaunch({
                url: '/pages/index/index'
              });
            }
          });
        }
      });
    },

    onHomeTap() {
      this.triggerEvent('home');
    },

    onUserTap() {
      this.triggerEvent('user');
    }
  }
});
