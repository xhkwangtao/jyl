const {
  initializeAnalyticsApp,
  updateAnalyticsScene
} = require('./utils/page-analytics-runtime')
const greatwallConfigService = require('./services/greatwall-config-service')

App({
  globalData: {
    pendingNavigation: null,
    aiChatRouteInfo: null,
    greatwall: false,
    greatwallCachedAt: 0
  },

  onLaunch(options = {}) {
    initializeAnalyticsApp(this, options)
    greatwallConfigService.prefetchConfig({
      forceRefresh: true
    }).catch(() => {})
  },

  onShow(options = {}) {
    updateAnalyticsScene(this, options)
    greatwallConfigService.prefetchConfig({
      forceRefresh: true
    }).catch(() => {})
  }
})
