function normalizeString(value = '') {
  return String(value === undefined || value === null ? '' : value).trim()
}

function safePlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function buildAnonymousId() {
  const randomText = Math.random().toString(36).slice(2, 10)
  return `anon_${Date.now().toString(36)}_${randomText}`
}

function shouldIncludeReferrerQueryKey(key = '') {
  return !/(token|secret|password|phone|mobile|sign|nonce|package|redirect|message|content|image|avatar)/i.test(key)
}

function normalizeSerializableValue(value = '') {
  if (value === undefined || value === null) {
    return ''
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return normalizeString(value)
  }

  return ''
}

function serializeQuery(options = {}) {
  const source = safePlainObject(options)

  return Object.keys(source)
    .filter((key) => {
      const normalizedKey = normalizeString(key)

      return normalizedKey && shouldIncludeReferrerQueryKey(normalizedKey)
    })
    .sort()
    .slice(0, 5)
    .map((key) => {
      const value = normalizeSerializableValue(source[key]).slice(0, 80)

      return value
        ? `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        : ''
    })
    .filter(Boolean)
    .join('&')
}

function buildReferrerFromPageStack(pageStack = []) {
  if (!Array.isArray(pageStack) || pageStack.length < 2) {
    return ''
  }

  const previousPage = pageStack[pageStack.length - 2] || {}
  const route = normalizeString(previousPage.route)

  if (!route) {
    return ''
  }

  const query = serializeQuery(previousPage.__pageAnalyticsOptions || previousPage.options || {})
  return `/${route}${query ? `?${query}` : ''}`
}

function normalizeExtra(extra = {}) {
  const source = safePlainObject(extra)
  const result = {}

  Object.keys(source).forEach((key) => {
    const normalizedKey = normalizeString(key)
    const normalizedValue = normalizeSerializableValue(source[key])

    if (!normalizedKey || !normalizedValue) {
      return
    }

    result[normalizedKey] = normalizedValue
  })

  return result
}

function buildPageAnalyticsPayload(options = {}) {
  const pageMeta = safePlainObject(options.pageMeta)
  const systemInfo = safePlainObject(options.systemInfo)
  const extra = normalizeExtra(options.extra)

  return {
    page_path: normalizeString(pageMeta.pagePath),
    page_title: normalizeString(pageMeta.pageTitle) || null,
    scene: normalizeString(options.scene) || null,
    source: normalizeString(options.source) || null,
    referrer: normalizeString(options.referrer) || null,
    anonymous_id: normalizeString(options.anonymousId) || null,
    platform: normalizeString(systemInfo.platform) || null,
    wechat_version: normalizeString(systemInfo.version) || null,
    device_model: normalizeString(systemInfo.model) || null,
    network_type: normalizeString(options.networkType) || null,
    extra: Object.keys(extra).length ? extra : null
  }
}

module.exports = {
  buildAnonymousId,
  buildPageAnalyticsPayload,
  buildReferrerFromPageStack,
  normalizeString,
  safePlainObject,
  serializeQuery
}
