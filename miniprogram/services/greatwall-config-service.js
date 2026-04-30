const request = require('../utils/request')

const GREATWALL_CONFIG_PATH = '/client/greatwall'
const DEFAULT_GREATWALL_CACHE_MAX_AGE_MS = 60 * 1000
const DEFAULT_GREATWALL_VALUE = false

function normalizeBoolean(value) {
  return value === true
}

function normalizeTimestamp(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0
}

function normalizeConfigPayload(payload = {}, options = {}) {
  const payloadObject = payload && typeof payload === 'object' ? payload : {}
  const cachedAt = normalizeTimestamp(
    options.cachedAt !== undefined ? options.cachedAt : payloadObject.cachedAt
  ) || (options.useCurrentTimeIfMissing ? Date.now() : 0)

  return {
    greatwall: normalizeBoolean(payloadObject.greatwall),
    cachedAt
  }
}

function getAppInstance() {
  if (typeof getApp !== 'function') {
    return null
  }

  try {
    return getApp()
  } catch (error) {
    return null
  }
}

class GreatwallConfigService {
  getDefaultConfig() {
    return {
      greatwall: DEFAULT_GREATWALL_VALUE,
      cachedAt: 0
    }
  }

  syncAppGlobalData(config = {}) {
    const app = getAppInstance()
    if (!app) {
      return normalizeConfigPayload(config)
    }

    const normalizedConfig = normalizeConfigPayload(config)
    app.globalData = app.globalData || {}
    app.globalData.greatwall = normalizedConfig.greatwall
    app.globalData.greatwallCachedAt = normalizedConfig.cachedAt
    return normalizedConfig
  }

  getAppGlobalConfig() {
    const app = getAppInstance()
    const globalData = app?.globalData

    if (!globalData || typeof globalData.greatwall !== 'boolean') {
      return null
    }

    return normalizeConfigPayload({
      greatwall: globalData.greatwall,
      cachedAt: globalData.greatwallCachedAt
    })
  }

  getStoredConfig() {
    return this.getDefaultConfig()
  }

  saveConfig(config = {}) {
    const normalizedConfig = normalizeConfigPayload(config, {
      useCurrentTimeIfMissing: true
    })
    this.syncAppGlobalData(normalizedConfig)
    return normalizedConfig
  }

  getCachedConfig() {
    const appGlobalConfig = this.getAppGlobalConfig()
    if (appGlobalConfig) {
      return appGlobalConfig
    }

    const storedConfig = this.getStoredConfig()
    this.syncAppGlobalData(storedConfig)
    return storedConfig
  }

  isConfigFresh(config = {}, maxAgeMs = DEFAULT_GREATWALL_CACHE_MAX_AGE_MS) {
    const cachedAt = normalizeTimestamp(config.cachedAt)
    if (!cachedAt) {
      return false
    }

    return Date.now() - cachedAt <= Math.max(Number(maxAgeMs) || 0, 0)
  }

  isGreatwallEnabledSync() {
    return !!this.getCachedConfig().greatwall
  }

  shouldBypassPaywallSync() {
    return !this.isGreatwallEnabledSync()
  }

  async getConfig(options = {}) {
    const cachedConfig = this.getCachedConfig()
    const maxAgeMs = Number(options.maxAgeMs)
    const resolvedMaxAgeMs = Number.isFinite(maxAgeMs)
      ? maxAgeMs
      : DEFAULT_GREATWALL_CACHE_MAX_AGE_MS

    if (!options.forceRefresh && this.isConfigFresh(cachedConfig, resolvedMaxAgeMs)) {
      return cachedConfig
    }

    try {
      const response = await request.get(GREATWALL_CONFIG_PATH)
      return this.saveConfig({
        ...response,
        cachedAt: Date.now()
      })
    } catch (error) {
      console.warn('[greatwall] config request failed:', error?.message || error)
      return cachedConfig
    }
  }

  async prefetchConfig(options = {}) {
    return this.getConfig(options)
  }
}

module.exports = new GreatwallConfigService()
module.exports.DEFAULT_GREATWALL_CACHE_MAX_AGE_MS = DEFAULT_GREATWALL_CACHE_MAX_AGE_MS
module.exports.DEFAULT_GREATWALL_VALUE = DEFAULT_GREATWALL_VALUE
