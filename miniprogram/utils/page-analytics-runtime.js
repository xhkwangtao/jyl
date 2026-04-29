const {
  normalizeString
} = require('./page-analytics-utils')

const ANALYTICS_STATE_KEY = 'pageAnalyticsState'
const PAGE_VIEW_DEDUPE_WINDOW_MS = 400

function ensureAppGlobalData(app) {
  if (!app || typeof app !== 'object') {
    return null
  }

  if (!app.globalData || typeof app.globalData !== 'object') {
    app.globalData = {}
  }

  if (!app.globalData[ANALYTICS_STATE_KEY]) {
    app.globalData[ANALYTICS_STATE_KEY] = {
      currentScene: '',
      nextSource: 'launch',
      navigationHooksInstalled: false,
      lastPageViewKey: '',
      lastPageViewAt: 0
    }
  }

  return app.globalData[ANALYTICS_STATE_KEY]
}

function getAppInstance() {
  try {
    return typeof getApp === 'function' ? getApp() : null
  } catch (error) {
    return null
  }
}

function consumeNextSource() {
  const app = getAppInstance()
  const state = ensureAppGlobalData(app)

  if (!state) {
    return 'launch'
  }

  const source = normalizeString(state.nextSource) || 'launch'
  state.nextSource = 'unknown'
  return source
}

function getCurrentScene() {
  const app = getAppInstance()
  const state = ensureAppGlobalData(app)

  if (!state) {
    return ''
  }

  return normalizeString(state.currentScene)
}

function shouldSkipDuplicatePageView(pageViewKey = '') {
  const app = getAppInstance()
  const state = ensureAppGlobalData(app)

  if (!state) {
    return false
  }

  const normalizedPageViewKey = normalizeString(pageViewKey)
  const now = Date.now()

  if (
    normalizedPageViewKey
    && state.lastPageViewKey === normalizedPageViewKey
    && now - Number(state.lastPageViewAt || 0) < PAGE_VIEW_DEDUPE_WINDOW_MS
  ) {
    return true
  }

  state.lastPageViewKey = normalizedPageViewKey
  state.lastPageViewAt = now
  return false
}

function wrapNavigationMethod(app, methodName) {
  if (typeof wx[methodName] !== 'function') {
    return
  }

  const originalMethod = wx[methodName]
  if (originalMethod.__pageAnalyticsWrapped) {
    return
  }

  function wrappedNavigation(options = {}) {
    const safeOptions = options && typeof options === 'object' && !Array.isArray(options)
      ? { ...options }
      : {}
    const state = ensureAppGlobalData(app)
    const previousSource = state ? state.nextSource : ''
    const originalFail = safeOptions.fail

    if (state) {
      state.nextSource = methodName
    }

    safeOptions.fail = (...args) => {
      if (state) {
        state.nextSource = previousSource
      }

      if (typeof originalFail === 'function') {
        return originalFail.apply(this, args)
      }

      return undefined
    }

    return originalMethod.call(wx, safeOptions)
  }

  wrappedNavigation.__pageAnalyticsWrapped = true
  wx[methodName] = wrappedNavigation
}

function installNavigationHooks(app) {
  const state = ensureAppGlobalData(app)

  if (!state || state.navigationHooksInstalled) {
    return
  }

  ;['navigateTo', 'redirectTo', 'reLaunch', 'switchTab', 'navigateBack'].forEach((methodName) => {
    wrapNavigationMethod(app, methodName)
  })

  state.navigationHooksInstalled = true
}

function initializeAnalyticsApp(app, launchOptions = {}) {
  const state = ensureAppGlobalData(app)

  if (!state) {
    return
  }

  state.currentScene = normalizeString(launchOptions.scene)
  state.nextSource = 'launch'
  installNavigationHooks(app)
}

function updateAnalyticsScene(app, showOptions = {}) {
  const state = ensureAppGlobalData(app)

  if (!state) {
    return
  }

  state.currentScene = normalizeString(showOptions.scene)
}

module.exports = {
  consumeNextSource,
  getCurrentScene,
  initializeAnalyticsApp,
  shouldSkipDuplicatePageView,
  updateAnalyticsScene
}
