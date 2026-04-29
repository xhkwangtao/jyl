const request = require('../utils/request')
const {
  getPageAnalyticsMeta
} = require('../config/page-analytics-pages')
const {
  buildAnonymousId,
  buildPageAnalyticsPayload,
  buildReferrerFromPageStack,
  normalizeString
} = require('../utils/page-analytics-utils')
const {
  consumeNextSource,
  getCurrentScene,
  shouldSkipDuplicatePageView
} = require('../utils/page-analytics-runtime')

const PAGE_ANALYTICS_PATH = '/client/analytics/page-view'
const ANONYMOUS_ID_STORAGE_KEY = 'page_analytics_anonymous_id'

class PageAnalyticsService {
  constructor() {
    this.cachedNetworkType = ''
    this.networkTypeResolved = false
  }

  getAnonymousId() {
    try {
      const storedAnonymousId = normalizeString(wx.getStorageSync(ANONYMOUS_ID_STORAGE_KEY))

      if (storedAnonymousId) {
        return storedAnonymousId
      }
    } catch (error) {}

    const nextAnonymousId = buildAnonymousId()

    try {
      wx.setStorageSync(ANONYMOUS_ID_STORAGE_KEY, nextAnonymousId)
    } catch (error) {}

    return nextAnonymousId
  }

  getSystemInfo() {
    try {
      return wx.getSystemInfoSync() || {}
    } catch (error) {
      return {}
    }
  }

  async getNetworkType() {
    if (this.networkTypeResolved) {
      return this.cachedNetworkType
    }

    return new Promise((resolve) => {
      wx.getNetworkType({
        success: (res) => {
          this.cachedNetworkType = normalizeString(res && res.networkType)
          this.networkTypeResolved = true
          resolve(this.cachedNetworkType)
        },
        fail: () => {
          this.cachedNetworkType = ''
          this.networkTypeResolved = true
          resolve('')
        }
      })
    })
  }

  async trackPageView(options = {}) {
    const pagePath = normalizeString(options.pagePath)

    if (!pagePath) {
      return {
        skipped: true
      }
    }

    const pageMeta = getPageAnalyticsMeta(pagePath)
    const pageStack = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    const referrer = buildReferrerFromPageStack(pageStack)
    const source = consumeNextSource()
    const extra = pageMeta.buildExtra(
      options.options || {},
      {
        pageInstance: options.pageInstance || null,
        pageStack
      }
    )
    const payload = buildPageAnalyticsPayload({
      pageMeta,
      anonymousId: this.getAnonymousId(),
      scene: getCurrentScene(),
      source,
      referrer,
      systemInfo: this.getSystemInfo(),
      networkType: await this.getNetworkType(),
      extra
    })

    const dedupeKey = `${payload.page_path}|${payload.source}|${payload.referrer || ''}`
    if (shouldSkipDuplicatePageView(dedupeKey)) {
      return {
        skipped: true
      }
    }

    try {
      await request.request({
        url: PAGE_ANALYTICS_PATH,
        method: 'POST',
        data: payload
      })
    } catch (error) {}

    return {
      ok: true
    }
  }
}

module.exports = new PageAnalyticsService()
