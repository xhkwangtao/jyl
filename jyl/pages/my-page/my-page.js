const USER_BADGES = [
  {
    id: 'badge-1',
    name: '初探者',
    image: '/images/badges/arc-emerald.svg',
    description: '首次 AI 导览',
    unlocked: true
  },
  {
    id: 'badge-2',
    name: '路线家',
    image: '/images/badges/arc-blue.svg',
    description: '地图入口已点亮',
    unlocked: true
  },
  {
    id: 'badge-3',
    name: '拍照搭子',
    image: '/images/badges/arc-cyan.svg',
    description: 'AI 旅拍灵感',
    unlocked: true
  },
  {
    id: 'badge-4',
    name: '古迹观察员',
    image: '/images/badges/arc-green.svg',
    description: '遗址信息卡',
    unlocked: true
  },
  {
    id: 'badge-5',
    name: '长城听风者',
    image: '/images/badges/arc-light-pink.svg',
    description: '待解锁',
    unlocked: false
  },
  {
    id: 'badge-6',
    name: '故事收集员',
    image: '/images/badges/arc-orange.svg',
    description: '待解锁',
    unlocked: false
  },
  {
    id: 'badge-7',
    name: '城砖手记',
    image: '/images/badges/arc-purple.svg',
    description: '待解锁',
    unlocked: false
  },
  {
    id: 'badge-8',
    name: '风景侦察兵',
    image: '/images/badges/arc-red.svg',
    description: '待解锁',
    unlocked: false
  },
  {
    id: 'badge-9',
    name: '登楼达人',
    image: '/images/badges/arc-yellow.svg',
    description: '待解锁',
    unlocked: false
  },
  {
    id: 'badge-10',
    name: '纪念典藏',
    image: '/images/badges/olive-branch.svg',
    description: '待解锁',
    unlocked: false
  }
]

const TOP_RANKING_LIST = [
  {
    id: 'rank-1',
    rank: 1,
    nickname: '长城守望者',
    title: '九眼楼首席探索官',
    score: 1248,
    avatar: '/images/xiaoying-avatar.png',
    isSelf: false
  },
  {
    id: 'rank-2',
    rank: 2,
    nickname: '山野旅人',
    title: 'AI 深度体验官',
    score: 1166,
    avatar: '/images/xiaojiu.png',
    isSelf: false
  },
  {
    id: 'rank-3',
    rank: 3,
    nickname: '古迹记录员',
    title: '文化打卡达人',
    score: 1108,
    avatar: '/images/xiaoying.png',
    isSelf: false
  },
  {
    id: 'rank-4',
    rank: 4,
    nickname: '晨雾行者',
    title: '清晨登城爱好者',
    score: 1040,
    avatar: '/images/xiaoying-avatar.png',
    isSelf: false
  },
  {
    id: 'rank-5',
    rank: 5,
    nickname: '北风猎影',
    title: '风景拍摄控',
    score: 998,
    avatar: '/images/xiaojiu.png',
    isSelf: false
  },
  {
    id: 'rank-6',
    rank: 6,
    nickname: '云端散步者',
    title: '路线规划达人',
    score: 956,
    avatar: '/images/xiaoying.png',
    isSelf: false
  },
  {
    id: 'rank-7',
    rank: 7,
    nickname: '光影旅伴',
    title: '旅拍氛围组',
    score: 918,
    avatar: '/images/xiaoying-avatar.png',
    isSelf: false
  },
  {
    id: 'rank-8',
    rank: 8,
    nickname: '城垣拾音',
    title: '文化讲解收藏家',
    score: 884,
    avatar: '/images/xiaojiu.png',
    isSelf: false
  },
  {
    id: 'rank-9',
    rank: 9,
    nickname: '山路回声',
    title: '路线细节控',
    score: 852,
    avatar: '/images/xiaoying.png',
    isSelf: false
  },
  {
    id: 'rank-10',
    rank: 10,
    nickname: '砖石研究员',
    title: '历史观察者',
    score: 821,
    avatar: '/images/xiaoying-avatar.png',
    isSelf: false
  }
]

function getLayoutMetrics() {
  try {
    const systemInfo = wx.getSystemInfoSync()
    const menuButton = typeof wx.getMenuButtonBoundingClientRect === 'function'
      ? wx.getMenuButtonBoundingClientRect()
      : null
    const statusBarHeight = systemInfo.statusBarHeight || 20
    const safeAreaBottom = systemInfo.safeArea
      ? Math.max(systemInfo.screenHeight - systemInfo.safeArea.bottom, 0)
      : 0

    if (!menuButton || !menuButton.height) {
      return {
        navBarHeight: statusBarHeight + 44,
        windowHeight: systemInfo.windowHeight || 667,
        safeAreaBottom
      }
    }

    const navContentPaddingTop = Math.max(menuButton.top - statusBarHeight, 0)
    const navContentHeight = menuButton.height + navContentPaddingTop * 2

    return {
      navBarHeight: statusBarHeight + navContentHeight,
      windowHeight: systemInfo.windowHeight || 667,
      safeAreaBottom
    }
  } catch (error) {
    return {
      navBarHeight: 84,
      windowHeight: 667,
      safeAreaBottom: 0
    }
  }
}

Page({
  data: {
    pageReady: false,
    pageStyle: 'height: 100vh; overflow: hidden; background: #f5f5f5;',
    navBarHeightStyle: '',
    currentTab: 'badge',
    isCardCollapsed: false,
    isDragging: false,
    tabTransform: 'translateY(0px)',
    tabTransition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
    maxDragDistance: 140,
    showQrcodeModal: false,
    qrcodeImageUrl: '/images/mock-qrcode.svg',
    userNickname: '游客',
    userBadges: USER_BADGES,
    topRankingList: TOP_RANKING_LIST,
    currentPoints: 268,
    currentRank: 18,
    percentileText: '你已超过 78% 的用户'
  },

  onLoad() {
    const { navBarHeight, windowHeight, safeAreaBottom } = getLayoutMetrics()
    const dragDistance = Math.round(Math.min(Math.max(windowHeight * 0.18, 120), 180))

    this.setData({
      pageReady: true,
      maxDragDistance: dragDistance,
      navBarHeightStyle: `--nav-bar-height: ${navBarHeight}px; --page-safe-bottom: ${safeAreaBottom}px;`
    })
  },

  onShow() {
    this.syncUserProfile()
  },

  syncUserProfile() {
    const userInfo = wx.getStorageSync('userInfo') || {}
    const userNickname = userInfo.nickName || userInfo.nickname || '游客'

    this.setData({
      userNickname
    })
  },

  onBackTap() {
    return false
  },

  onHomeTap() {
    wx.reLaunch({
      url: '/pages/index/index',
      fail: () => {
        wx.redirectTo({
          url: '/pages/index/index'
        })
      }
    })
  },

  onTabChange(event) {
    const nextTab = event.detail ? event.detail.tab : 'badge'

    this.setData({
      currentTab: nextTab || 'badge'
    })
  },

  onBadgeTap(event) {
    const badge = event.detail ? event.detail.badge : null
    this.showUiToast(badge && badge.name ? badge.name : '徽章展示')
  },

  onTouchStart(event) {
    const touch = event.touches && event.touches[0]

    if (!touch) {
      return
    }

    this.touchStartY = touch.clientY
    this.dragStartOffset = this.data.isCardCollapsed ? -this.data.maxDragDistance : 0
    this.dragCurrentOffset = this.dragStartOffset

    this.setData({
      isDragging: true,
      tabTransition: 'none'
    })
  },

  onTouchMove(event) {
    if (!this.data.isDragging) {
      return
    }

    const touch = event.touches && event.touches[0]

    if (!touch) {
      return
    }

    const deltaY = touch.clientY - this.touchStartY
    const minOffset = -this.data.maxDragDistance
    const maxOffset = 0
    let nextOffset = this.dragStartOffset + deltaY

    if (nextOffset > maxOffset) {
      nextOffset = nextOffset * 0.28
    } else if (nextOffset < minOffset) {
      nextOffset = minOffset + (nextOffset - minOffset) * 0.28
    }

    this.dragCurrentOffset = nextOffset

    this.setData({
      tabTransform: `translateY(${Math.round(nextOffset)}px)`
    })
  },

  onTouchEnd() {
    if (!this.data.isDragging) {
      return
    }

    const currentOffset = typeof this.dragCurrentOffset === 'number'
      ? this.dragCurrentOffset
      : (this.data.isCardCollapsed ? -this.data.maxDragDistance : 0)
    const shouldCollapse = currentOffset < -this.data.maxDragDistance / 2
    const targetOffset = shouldCollapse ? -this.data.maxDragDistance : 0

    this.setData({
      isDragging: false,
      isCardCollapsed: shouldCollapse,
      tabTransition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
      tabTransform: `translateY(${Math.round(targetOffset)}px)`
    })
  },

  openOrderCenter() {
    this.showUiToast('订单中心暂未接入')
  },

  handleContact() {
    this.setData({
      showQrcodeModal: true
    })
  },

  hideQrcodeModal() {
    this.setData({
      showQrcodeModal: false
    })
  },

  previewQrcode() {
    this.showUiToast('当前仅展示二维码样式')
  },

  saveQrcodeToAlbum() {
    this.showUiToast('保存能力暂未接入')
  },

  goToQuiz() {
    this.showUiToast('挑战功能暂未接入')
  },

  showUiToast(title) {
    wx.showToast({
      title,
      icon: 'none',
      duration: 1800
    })
  }
})
