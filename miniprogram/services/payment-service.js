const {
  API_BASE_URL_STORAGE_KEY,
  ONLINE_API_BASE_URL,
  LOCAL_API_BASE_URL
} = require('../utils/api-config')

function getStorageValue(key) {
  try {
    return wx.getStorageSync(key)
  } catch (error) {
    return ''
  }
}

function normalizeBaseUrl(url = '') {
  return String(url || '').trim().replace(/\/+$/, '')
}

function resolveBaseUrl() {
  const overrideBaseUrl = normalizeBaseUrl(getStorageValue(API_BASE_URL_STORAGE_KEY))

  if (overrideBaseUrl) {
    return overrideBaseUrl
  }

  const onlineBaseUrl = normalizeBaseUrl(ONLINE_API_BASE_URL)
  return onlineBaseUrl || normalizeBaseUrl(LOCAL_API_BASE_URL)
}

function getToken() {
  return String(getStorageValue('token') || '').trim()
}

function buildUrl(path = '') {
  return `${resolveBaseUrl()}${path}`
}

function createErrorMessage(statusCode, payload, fallbackMessage) {
  if (payload && typeof payload === 'object') {
    return payload.detail || payload.message || payload.error || fallbackMessage || `请求失败 (${statusCode})`
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim()
  }

  return fallbackMessage || `请求失败 (${statusCode})`
}

function requestApi({ url, method = 'GET', data, timeout = 10000, needAuth = false }) {
  return new Promise((resolve, reject) => {
    const token = getToken()

    wx.request({
      url: buildUrl(url),
      method,
      data,
      timeout,
      header: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: needAuth && token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }

        reject(new Error(createErrorMessage(res.statusCode, res.data)))
      },
      fail: (error) => {
        reject(new Error(error?.errMsg || '网络请求失败'))
      }
    })
  })
}

class PaymentService {
  getProductPrice(productCode) {
    const normalizedProductCode = String(productCode || '').trim()

    if (!normalizedProductCode) {
      return Promise.reject(new Error('缺少产品编码'))
    }

    return requestApi({
      url: `/client/payments/products/prices/${encodeURIComponent(normalizedProductCode)}`,
      method: 'GET',
      needAuth: false
    })
  }

  createJsapiPrepay({ productCode, quantity = 1, featureKey = '' } = {}) {
    const normalizedProductCode = String(productCode || '').trim()

    if (!normalizedProductCode) {
      return Promise.reject(new Error('缺少产品编码'))
    }

    return requestApi({
      url: '/client/payments/jsapi-prepay',
      method: 'POST',
      data: {
        product_code: normalizedProductCode,
        quantity: Number(quantity) > 0 ? Number(quantity) : 1,
        feature_key: String(featureKey || '').trim() || null
      },
      timeout: 10000,
      needAuth: true
    })
  }
}

module.exports = new PaymentService()
