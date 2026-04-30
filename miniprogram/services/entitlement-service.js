const auth = require('../utils/auth')
const request = require('../utils/request')
const greatwallConfigService = require('./greatwall-config-service')

const FEATURE_ACCESS_CACHE_STORAGE_KEY = 'featureAccessCache'
const ENTITLEMENT_CACHE_STORAGE_KEY = 'entitlementAccessCache'
const DEFAULT_ACCESS_CACHE_MAX_AGE_MS = 5 * 60 * 1000

const PAID_FEATURE_KEYS = {
  VIP: 'vip',
  AI_CHAT: 'ai.chat',
  AI_CHAT_VOICE: 'ai.chat.voice',
  MAP_AUDIO_PLAY: 'map.audio.play',
  MAP_ROUTE_PLANNING: 'map.route.planning',
  MAP_NAVIGATION_START: 'map.navigation.start',
  MAP_PHOTO_TUTORIAL: 'map.photo.tutorial',
  STUDY_REPORT_GENERATE: 'study_report.generate'
}

const LEGACY_FEATURE_KEY_ALIAS_MAP = {
  'ai.chat.send-message': PAID_FEATURE_KEYS.AI_CHAT,
  'ai.chat.voice-send': PAID_FEATURE_KEYS.AI_CHAT_VOICE,
  'ai.chat.voice-play': PAID_FEATURE_KEYS.AI_CHAT_VOICE,
  'map.poi.primary-action': PAID_FEATURE_KEYS.MAP_NAVIGATION_START,
  'map.tutorial.photo': PAID_FEATURE_KEYS.MAP_PHOTO_TUTORIAL,
  'map.checkin.action': PAID_FEATURE_KEYS.STUDY_REPORT_GENERATE,
  'map.checkin.poi': PAID_FEATURE_KEYS.STUDY_REPORT_GENERATE,
  'map.explore.poi': PAID_FEATURE_KEYS.MAP_NAVIGATION_START,
  'map.navigate.poi': PAID_FEATURE_KEYS.MAP_NAVIGATION_START
}

const FEATURE_REQUIRED_ENTITLEMENT_MAP = {
  [PAID_FEATURE_KEYS.AI_CHAT]: PAID_FEATURE_KEYS.VIP,
  [PAID_FEATURE_KEYS.AI_CHAT_VOICE]: PAID_FEATURE_KEYS.VIP,
  [PAID_FEATURE_KEYS.MAP_AUDIO_PLAY]: PAID_FEATURE_KEYS.VIP,
  [PAID_FEATURE_KEYS.MAP_ROUTE_PLANNING]: PAID_FEATURE_KEYS.VIP,
  [PAID_FEATURE_KEYS.MAP_NAVIGATION_START]: PAID_FEATURE_KEYS.VIP,
  [PAID_FEATURE_KEYS.MAP_PHOTO_TUTORIAL]: PAID_FEATURE_KEYS.VIP,
  [PAID_FEATURE_KEYS.STUDY_REPORT_GENERATE]: PAID_FEATURE_KEYS.VIP
}

function getStorageValue(key) {
  try {
    return wx.getStorageSync(key)
  } catch (error) {
    return null
  }
}

function setStorageValue(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (error) {}
}

function readStorageObject(key) {
  const value = getStorageValue(key)
  return value && typeof value === 'object' ? value : {}
}

function normalizeKey(value = '') {
  return String(value || '').trim()
}

function normalizeFeatureKey(value = '') {
  const normalizedValue = normalizeKey(value)
  return LEGACY_FEATURE_KEY_ALIAS_MAP[normalizedValue] || normalizedValue
}

function normalizeBoolean(value) {
  return value === true
}

function normalizeDateTimestamp(value = '') {
  const rawValue = String(value || '').trim()
  if (!rawValue) {
    return 0
  }

  const timestamp = Date.parse(rawValue)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function isRecordFresh(record = {}, maxAgeMs = DEFAULT_ACCESS_CACHE_MAX_AGE_MS) {
  if (!record || typeof record !== 'object') {
    return false
  }

  const expiresAt = Number(record.expiresAt || 0) || 0
  if (expiresAt > 0 && normalizeBoolean(record.available)) {
    return expiresAt > Date.now()
  }

  const cachedAt = Number(record.cachedAt || 0) || 0
  if (!cachedAt) {
    return false
  }

  return Date.now() - cachedAt <= Math.max(Number(maxAgeMs) || 0, 0)
}

function isRecordActive(record = {}, maxAgeMs = DEFAULT_ACCESS_CACHE_MAX_AGE_MS) {
  return normalizeBoolean(record?.available) && isRecordFresh(record, maxAgeMs)
}

function normalizeAccessPayload(payload = {}, options = {}) {
  const normalizedKey = options.isFeature ? normalizeFeatureKey(options.key) : normalizeKey(options.key)
  const payloadObject = payload && typeof payload === 'object' ? payload : {}
  const expiresAt = normalizeDateTimestamp(payloadObject.expires_at)

  return {
    ...payloadObject,
    available: normalizeBoolean(payloadObject.available),
    status: normalizeKey(payloadObject.status),
    feature_key: normalizeFeatureKey(payloadObject.feature_key || normalizedKey),
    entitlement_key: normalizeKey(payloadObject.entitlement_key || normalizedKey),
    recommended_product_code: normalizeKey(payloadObject.recommended_product_code),
    required_entitlement: normalizeKey(
      payloadObject.required_entitlement
      || FEATURE_REQUIRED_ENTITLEMENT_MAP[normalizedKey]
    ),
    feature_name: normalizeKey(payloadObject.feature_name),
    source_product_code: normalizeKey(payloadObject.source_product_code),
    expires_at: normalizeKey(payloadObject.expires_at),
    expiresAt,
    cachedAt: Date.now()
  }
}

function buildGreatwallBypassEntitlementPayload(entitlementKey = '') {
  const normalizedEntitlementKey = normalizeKey(entitlementKey)

  return normalizeAccessPayload({
    available: true,
    status: 'active',
    entitlement_key: normalizedEntitlementKey,
    access_source: 'greatwall_disabled'
  }, {
    key: normalizedEntitlementKey
  })
}

function buildGreatwallBypassFeaturePayload(featureKey = '') {
  const normalizedFeatureKey = normalizeFeatureKey(featureKey)
  const requiredEntitlement = normalizeKey(
    FEATURE_REQUIRED_ENTITLEMENT_MAP[normalizedFeatureKey] || normalizedFeatureKey
  )

  return normalizeAccessPayload({
    available: true,
    status: 'active',
    feature_key: normalizedFeatureKey,
    entitlement_key: requiredEntitlement,
    required_entitlement: requiredEntitlement,
    feature_name: normalizedFeatureKey,
    access_source: 'greatwall_disabled'
  }, {
    key: normalizedFeatureKey,
    isFeature: true
  })
}

class EntitlementService {
  normalizeFeatureKey(featureKey = '') {
    return normalizeFeatureKey(featureKey)
  }

  isGreatwallEnabledSync() {
    return greatwallConfigService.isGreatwallEnabledSync()
  }

  shouldBypassPaywallSync() {
    return greatwallConfigService.shouldBypassPaywallSync()
  }

  buildGreatwallBypassEntitlementAccess(entitlementKey = '') {
    return buildGreatwallBypassEntitlementPayload(entitlementKey)
  }

  buildGreatwallBypassFeatureAccess(featureKey = '') {
    return buildGreatwallBypassFeaturePayload(featureKey)
  }

  getFeatureRequiredEntitlement(featureKey = '') {
    return FEATURE_REQUIRED_ENTITLEMENT_MAP[normalizeFeatureKey(featureKey)] || ''
  }

  resolveFeatureEntitlementKey(featureKey = '') {
    const normalizedFeatureKey = normalizeFeatureKey(featureKey)
    return this.getFeatureRequiredEntitlement(normalizedFeatureKey) || normalizedFeatureKey
  }

  getFeatureAccessCacheMap() {
    return readStorageObject(FEATURE_ACCESS_CACHE_STORAGE_KEY)
  }

  saveFeatureAccessCacheMap(cacheMap = {}) {
    setStorageValue(FEATURE_ACCESS_CACHE_STORAGE_KEY, cacheMap)
  }

  getEntitlementAccessCacheMap() {
    return readStorageObject(ENTITLEMENT_CACHE_STORAGE_KEY)
  }

  saveEntitlementAccessCacheMap(cacheMap = {}) {
    setStorageValue(ENTITLEMENT_CACHE_STORAGE_KEY, cacheMap)
  }

  getCachedFeatureAccess(featureKey = '') {
    const normalizedFeatureKey = normalizeFeatureKey(featureKey)
    if (!normalizedFeatureKey) {
      return null
    }

    return this.getFeatureAccessCacheMap()[normalizedFeatureKey] || null
  }

  getCachedEntitlementAccess(entitlementKey = '') {
    const normalizedEntitlementKey = normalizeKey(entitlementKey)
    if (!normalizedEntitlementKey) {
      return null
    }

    return this.getEntitlementAccessCacheMap()[normalizedEntitlementKey] || null
  }

  persistEntitlementAccess(entitlementKey = '', payload = {}) {
    const normalizedEntitlementKey = normalizeKey(entitlementKey)
    if (!normalizedEntitlementKey) {
      return null
    }

    const cacheRecord = normalizeAccessPayload(payload, {
      key: normalizedEntitlementKey
    })
    const entitlementCacheMap = this.getEntitlementAccessCacheMap()
    entitlementCacheMap[normalizedEntitlementKey] = cacheRecord
    this.saveEntitlementAccessCacheMap(entitlementCacheMap)

    return cacheRecord
  }

  persistFeatureAccess(featureKey = '', payload = {}) {
    const normalizedFeatureKey = normalizeFeatureKey(featureKey)
    if (!normalizedFeatureKey) {
      return null
    }

    const cacheRecord = normalizeAccessPayload(payload, {
      key: normalizedFeatureKey,
      isFeature: true
    })
    const featureCacheMap = this.getFeatureAccessCacheMap()
    featureCacheMap[normalizedFeatureKey] = cacheRecord
    this.saveFeatureAccessCacheMap(featureCacheMap)

    const requiredEntitlement = normalizeKey(cacheRecord.required_entitlement)
    if (requiredEntitlement) {
      this.persistEntitlementAccess(requiredEntitlement, {
        available: cacheRecord.available,
        status: cacheRecord.status,
        expires_at: cacheRecord.expires_at,
        recommended_product_code: cacheRecord.recommended_product_code,
        source_product_code: cacheRecord.source_product_code
      })
    }

    return cacheRecord
  }

  persistLocalFeatureAccess(featureKey = '', available = true, extraPayload = {}) {
    return this.persistFeatureAccess(featureKey, {
      ...extraPayload,
      available: !!available,
      status: available ? 'active' : 'inactive'
    })
  }

  persistLocalEntitlementAccess(entitlementKey = '', available = true, extraPayload = {}) {
    return this.persistEntitlementAccess(entitlementKey, {
      ...extraPayload,
      available: !!available,
      status: available ? 'active' : 'inactive'
    })
  }

  isEntitlementAvailableSync(entitlementKey = '', options = {}) {
    if (this.shouldBypassPaywallSync()) {
      return true
    }

    const record = this.getCachedEntitlementAccess(entitlementKey)
    return isRecordActive(record, options.maxAgeMs)
  }

  isFeatureAvailableSync(featureKey = '', options = {}) {
    if (this.shouldBypassPaywallSync()) {
      return true
    }

    const normalizedFeatureKey = normalizeFeatureKey(featureKey)
    const record = this.getCachedFeatureAccess(normalizedFeatureKey)
    if (isRecordActive(record, options.maxAgeMs)) {
      return true
    }

    if (this.isEntitlementAvailableSync(normalizedFeatureKey, options)) {
      return true
    }

    const requiredEntitlement = this.getFeatureRequiredEntitlement(normalizedFeatureKey)
    if (requiredEntitlement) {
      return this.isEntitlementAvailableSync(requiredEntitlement, options)
    }

    return false
  }

  async checkEntitlement(entitlementKey = '', options = {}) {
    const normalizedEntitlementKey = normalizeKey(entitlementKey)
    if (!normalizedEntitlementKey) {
      return {
        available: false,
        reason: 'missing_entitlement_key',
        entitlement_key: ''
      }
    }

    if (this.shouldBypassPaywallSync()) {
      return this.buildGreatwallBypassEntitlementAccess(normalizedEntitlementKey)
    }

    const cachedRecord = this.getCachedEntitlementAccess(normalizedEntitlementKey)
    if (!options.forceRefresh && isRecordFresh(cachedRecord, options.maxAgeMs)) {
      return cachedRecord
    }

    if (!auth.getToken()) {
      return {
        available: false,
        reason: 'not_logged_in',
        entitlement_key: normalizedEntitlementKey,
        recommended_product_code: ''
      }
    }

    const payload = await request.get(
      `/client/entitlements/${encodeURIComponent(normalizedEntitlementKey)}`
    )

    return this.persistEntitlementAccess(normalizedEntitlementKey, payload)
  }

  async checkFeatureAccess(featureKey = '', options = {}) {
    const normalizedFeatureKey = normalizeFeatureKey(featureKey)
    if (!normalizedFeatureKey) {
      return {
        available: false,
        reason: 'missing_feature_key',
        feature_key: ''
      }
    }

    if (this.shouldBypassPaywallSync()) {
      return this.buildGreatwallBypassFeatureAccess(normalizedFeatureKey)
    }

    const cachedRecord = this.getCachedFeatureAccess(normalizedFeatureKey)
    if (!options.forceRefresh && isRecordFresh(cachedRecord, options.maxAgeMs)) {
      return cachedRecord
    }

    if (!auth.getToken()) {
      return {
        available: false,
        reason: 'not_logged_in',
        feature_key: normalizedFeatureKey,
        recommended_product_code: ''
      }
    }

    if (normalizedFeatureKey === PAID_FEATURE_KEYS.VIP) {
      const entitlementPayload = await this.checkEntitlement(PAID_FEATURE_KEYS.VIP, options)
      return this.persistFeatureAccess(normalizedFeatureKey, {
        ...entitlementPayload,
        feature_key: normalizedFeatureKey,
        feature_name: normalizeKey(entitlementPayload?.feature_name || normalizedFeatureKey),
        required_entitlement: PAID_FEATURE_KEYS.VIP
      })
    }

    try {
      const payload = await request.get(
        `/client/entitlements/features/${encodeURIComponent(normalizedFeatureKey)}`
      )

      return this.persistFeatureAccess(normalizedFeatureKey, {
        ...payload,
        access_source: 'feature'
      })
    } catch (featureError) {
      const fallbackEntitlementKey = this.getFeatureRequiredEntitlement(normalizedFeatureKey)
      if (!fallbackEntitlementKey || options.disableEntitlementFallback === true) {
        throw featureError
      }

      const entitlementPayload = await this.checkEntitlement(fallbackEntitlementKey, options)
      return this.persistFeatureAccess(normalizedFeatureKey, {
        ...entitlementPayload,
        feature_key: normalizedFeatureKey,
        feature_name: normalizeKey(entitlementPayload?.feature_name || normalizedFeatureKey),
        required_entitlement: fallbackEntitlementKey,
        access_source: 'entitlement_fallback',
        fallback_error_message: normalizeKey(featureError?.message || featureError?.errMsg),
        fallback_error_code: normalizeKey(featureError?.code)
      })
    }
  }

  async prefetchFeatureAccessList(featureKeyList = [], options = {}) {
    const uniqueFeatureKeyList = Array.from(new Set(
      (Array.isArray(featureKeyList) ? featureKeyList : [])
        .map((item) => normalizeFeatureKey(item))
        .filter(Boolean)
    ))

    const settledList = await Promise.allSettled(
      uniqueFeatureKeyList.map((featureKey) => this.checkFeatureAccess(featureKey, options))
    )

    return uniqueFeatureKeyList.reduce((result, featureKey, index) => {
      const settledResult = settledList[index] || null
      if (settledResult?.status === 'fulfilled') {
        result[featureKey] = settledResult.value
      }
      return result
    }, {})
  }

  async prefetchEntitlementList(entitlementKeyList = [], options = {}) {
    const uniqueEntitlementKeyList = Array.from(new Set(
      (Array.isArray(entitlementKeyList) ? entitlementKeyList : [])
        .map((item) => normalizeKey(item))
        .filter(Boolean)
    ))

    const settledList = await Promise.allSettled(
      uniqueEntitlementKeyList.map((entitlementKey) => this.checkEntitlement(entitlementKey, options))
    )

    return uniqueEntitlementKeyList.reduce((result, entitlementKey, index) => {
      const settledResult = settledList[index] || null
      if (settledResult?.status === 'fulfilled') {
        result[entitlementKey] = settledResult.value
      }
      return result
    }, {})
  }
}

module.exports = new EntitlementService()
module.exports.PAID_FEATURE_KEYS = PAID_FEATURE_KEYS
module.exports.FEATURE_REQUIRED_ENTITLEMENT_MAP = FEATURE_REQUIRED_ENTITLEMENT_MAP
module.exports.DEFAULT_ACCESS_CACHE_MAX_AGE_MS = DEFAULT_ACCESS_CACHE_MAX_AGE_MS
