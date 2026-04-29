const pageAnalyticsService = require('../services/page-analytics-service')

function clonePageOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return {}
  }

  return {
    ...options
  }
}

function withPageAnalytics(pagePath = '', pageDefinition = {}) {
  const originalOnLoad = pageDefinition.onLoad
  const originalOnShow = pageDefinition.onShow
  const originalOnUnload = pageDefinition.onUnload

  return {
    ...pageDefinition,

    onLoad(options = {}) {
      this.__pageAnalyticsOptions = clonePageOptions(options)

      if (typeof originalOnLoad === 'function') {
        return originalOnLoad.call(this, options)
      }

      return undefined
    },

    onShow() {
      this.__pageAnalyticsOptions = clonePageOptions(this.options || this.__pageAnalyticsOptions || {})

      const originalResult = typeof originalOnShow === 'function'
        ? originalOnShow.call(this)
        : undefined

      Promise.resolve()
        .then(() => pageAnalyticsService.trackPageView({
          pagePath,
          pageInstance: this,
          options: this.__pageAnalyticsOptions
        }))
        .catch(() => null)

      return originalResult
    },

    onUnload() {
      delete this.__pageAnalyticsOptions

      if (typeof originalOnUnload === 'function') {
        return originalOnUnload.call(this)
      }

      return undefined
    }
  }
}

module.exports = {
  withPageAnalytics
}
