const {
  resolvePoiSourceCodeToCanonical
} = require('./poi-source-code.js')
const {
  GUIDE_MAP_PAGE,
  GUIDE_SUBSCRIBE_PAGE
} = require('./guide-routes')

const STORAGE_KEYS = {
  scene: 'landingScene',
  sourceCode: 'landingSourceCode',
  serialNumber: 'landingSerialNumber',
  compatibilitySource: 'sParam'
}

const VIP_SUBSCRIBE_PATH = GUIDE_SUBSCRIBE_PAGE
const ROUTE_SOURCE_CODES = new Set(['route-highlight', 'route-deep'])
const POINT_SOURCE_TYPES = new Set(['bsp'])
const ROUTE_SOURCE_TYPES = new Set(['route'])
const FILTER_SOURCE_TYPES = new Set(['filter'])

function buildRouteDataQueryValue(routeId = '') {
  const normalizedRouteId = normalizeSourceCode(routeId)

  if (!normalizedRouteId) {
    return ''
  }

  return JSON.stringify({
    routeId: normalizedRouteId
  })
}

function safeDecode(value) {
  if (typeof value !== 'string') {
    return ''
  }

  let decodedValue = value

  for (let index = 0; index < 2; index += 1) {
    try {
      const nextValue = decodeURIComponent(decodedValue)

      if (nextValue === decodedValue) {
        break
      }

      decodedValue = nextValue
    } catch (error) {
      break
    }
  }

  return decodedValue.trim()
}

function parseQueryString(query = '') {
  const normalizedQuery = safeDecode(query)

  if (!normalizedQuery) {
    return {}
  }

  return normalizedQuery.split('&').reduce((result, pair) => {
    if (!pair) {
      return result
    }

    const [rawKey, ...rawValueParts] = pair.split('=')
    const key = safeDecode(rawKey)
    const value = safeDecode(rawValueParts.join('='))

    if (key) {
      result[key] = value
    }

    return result
  }, {})
}

function normalizeSourceCode(value) {
  return safeDecode(value).toLowerCase()
}

function isKeyValueScenePayload(scene = '') {
  return /(^|&)[^=&]+=/.test(safeDecode(scene))
}

function normalizeLandingOptions(options = {}) {
  const scene = safeDecode(options.scene || '')
  const hasKeyValueScenePayload = isKeyValueScenePayload(scene)
  const sceneParams = hasKeyValueScenePayload ? parseQueryString(scene) : {}
  const bareSceneValue = !hasKeyValueScenePayload ? scene : ''

  const sourceCode = normalizeSourceCode(sceneParams.s || options.s || '')
  const serialNumber = safeDecode(sceneParams.sn || sceneParams.scene || options.sn || bareSceneValue || '')

  return {
    scene,
    sceneParams,
    bareSceneValue,
    sourceCode,
    serialNumber
  }
}

function hasLandingPayload(options = {}) {
  const landingOptions = normalizeLandingOptions(options)

  return Boolean(
    landingOptions.scene
      || landingOptions.sourceCode
      || landingOptions.serialNumber
  )
}

function buildQuery(path, query = {}) {
  const queryString = Object.keys(query).reduce((result, key) => {
    const value = query[key]

    if (value === undefined || value === null || value === '') {
      return result
    }

    result.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    return result
  }, []).join('&')

  return queryString ? `${path}?${queryString}` : path
}

const LANDING_REDIRECT_CONFIG = {
  hb1: {
    sourceCode: 'hb1',
    enabled: true,
    action: 'redirect',
    title: '红包专享入口',
    description: '正在为您进入九眼楼 VIP 专享购买页。',
    targetLabel: 'VIP 购买页',
    redirectUrl: buildQuery(VIP_SUBSCRIBE_PATH, {
      feature: 'vip',
      amount: '18.60',
      originalPrice: '69',
      currency: 'CNY',
      featureName: '九眼楼 VIP',
      description: '红包专享优惠入口'
    })
  },
  hb2: {
    sourceCode: 'hb2',
    enabled: true,
    action: 'redirect',
    title: '限时优惠入口',
    description: '正在为您进入九眼楼限时优惠购买页。',
    targetLabel: 'VIP 购买页',
    redirectUrl: buildQuery(VIP_SUBSCRIBE_PATH, {
      feature: 'vip',
      amount: '15.80',
      originalPrice: '69',
      currency: 'CNY',
      featureName: '九眼楼 VIP',
      description: '限时优惠购买入口'
    })
  },
  taipingzhai: {
    sourceCode: 'taipingzhai',
    enabled: true,
    action: 'redirect',
    title: '太平寨扫码入口',
    description: '正在为您进入九眼楼首页。',
    targetLabel: '首页',
    redirectUrl: '/pages/index/index'
  },
  jinguolou: {
    sourceCode: 'jinguolou',
    enabled: true,
    action: 'redirect',
    title: '金国楼扫码入口',
    description: '正在为您进入九眼楼首页。',
    targetLabel: '首页',
    redirectUrl: '/pages/index/index'
  },
  huangyaxizhao: {
    sourceCode: 'huangyaxizhao',
    enabled: true,
    action: 'redirect',
    title: '黄崖夕照扫码入口',
    description: '正在为您进入九眼楼首页。',
    targetLabel: '首页',
    redirectUrl: '/pages/index/index'
  },
  changshouyuan: {
    sourceCode: 'changshouyuan',
    enabled: true,
    action: 'redirect',
    title: '长寿园扫码入口',
    description: '正在为您进入九眼楼首页。',
    targetLabel: '首页',
    redirectUrl: '/pages/index/index'
  },
  default: {
    sourceCode: 'default',
    enabled: true,
    action: 'redirect',
    title: '欢迎来到九眼楼',
    description: '入口参数已识别，正在为您进入首页。',
    targetLabel: '首页',
    redirectUrl: '/pages/index/index'
  }
}

function getLandingRedirectConfig(sourceCode = '', fallbackToDefault = true) {
  const normalizedSourceCode = normalizeSourceCode(sourceCode)

  if (LANDING_REDIRECT_CONFIG[normalizedSourceCode]) {
    return LANDING_REDIRECT_CONFIG[normalizedSourceCode]
  }

  return fallbackToDefault ? LANDING_REDIRECT_CONFIG.default : null
}

function buildMapPageUrlFromLanding(options = {}) {
  const landingOptions = normalizeLandingOptions(options)
  const sourceCode = landingOptions.sourceCode
  const serialNumber = normalizeSourceCode(landingOptions.serialNumber)
  const canonicalPoiSerialNumber = resolvePoiSourceCodeToCanonical(serialNumber)

  if (POINT_SOURCE_TYPES.has(sourceCode) && canonicalPoiSerialNumber) {
    return buildQuery(GUIDE_MAP_PAGE, {
      poiId: canonicalPoiSerialNumber
    })
  }

  if (ROUTE_SOURCE_TYPES.has(sourceCode) && (ROUTE_SOURCE_CODES.has(serialNumber) || serialNumber.startsWith('route-'))) {
    return buildQuery(GUIDE_MAP_PAGE, {
      routeData: buildRouteDataQueryValue(serialNumber)
    })
  }

  if (FILTER_SOURCE_TYPES.has(sourceCode) && serialNumber) {
    return buildQuery(GUIDE_MAP_PAGE, {
      filter: serialNumber
    })
  }

  return ''
}

function buildLandingPageUrl(options = {}) {
  const landingOptions = normalizeLandingOptions(options)

  if (
    !landingOptions.scene
    && !landingOptions.sourceCode
    && !landingOptions.serialNumber
  ) {
    return ''
  }

  if (landingOptions.scene) {
    if (landingOptions.sourceCode && landingOptions.bareSceneValue) {
      return buildQuery('/pages/landing/index', {
        s: landingOptions.sourceCode,
        scene: landingOptions.bareSceneValue
      })
    }

    return buildQuery('/pages/landing/index', {
      scene: landingOptions.scene
    })
  }

  return buildQuery('/pages/landing/index', {
    s: landingOptions.sourceCode,
    sn: landingOptions.serialNumber
  })
}

function syncStorageValue(key, value) {
  try {
    if (value) {
      wx.setStorageSync(key, value)
      return
    }

    wx.removeStorageSync(key)
  } catch (error) {
    console.warn(`landing storage sync failed: ${key}`, error)
  }
}

function persistLandingContext(options = {}) {
  const landingOptions = normalizeLandingOptions(options)

  syncStorageValue(STORAGE_KEYS.scene, landingOptions.scene)
  syncStorageValue(STORAGE_KEYS.sourceCode, landingOptions.sourceCode)
  syncStorageValue(STORAGE_KEYS.serialNumber, landingOptions.serialNumber)
  syncStorageValue(STORAGE_KEYS.compatibilitySource, landingOptions.sourceCode)

  return landingOptions
}

module.exports = {
  STORAGE_KEYS,
  safeDecode,
  parseQueryString,
  normalizeLandingOptions,
  hasLandingPayload,
  buildLandingPageUrl,
  buildMapPageUrlFromLanding,
  persistLandingContext,
  getLandingRedirectConfig
}
