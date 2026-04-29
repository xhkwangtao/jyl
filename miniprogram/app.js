const {
  initializeAnalyticsApp,
  updateAnalyticsScene
} = require('./utils/page-analytics-runtime')

App({
  globalData: {
    pendingNavigation: null,
    aiChatRouteInfo: null
  },

  onLaunch(options = {}) {
    initializeAnalyticsApp(this, options)
  },

  onShow(options = {}) {
    updateAnalyticsScene(this, options)
  }
})
