const request = require('../utils/request')
const localMapData = require('../config/jyl-map-data.js')
const {
  API_BASE_URL_STORAGE_KEY,
  ONLINE_API_BASE_URL,
  LOCAL_API_BASE_URL
} = require('../utils/api-config')
const {
  buildPublishedMapRuntimeData
} = require('../utils/map-runtime-adapter')

const MAP_RUNTIME_PATH = '/client/content/map-runtime'

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

function buildMapRuntimeUrl() {
  return `${resolveBaseUrl()}${MAP_RUNTIME_PATH}`
}

class MapRuntimeService {
  async getPublishedMapRuntimeData() {
    try {
      const runtimePayload = await request.get(buildMapRuntimeUrl())

      if (!runtimePayload || typeof runtimePayload !== 'object') {
        return localMapData
      }

      return buildPublishedMapRuntimeData(localMapData, runtimePayload)
    } catch (error) {
      console.warn('map runtime request failed:', error?.message || error)
      return localMapData
    }
  }
}

module.exports = new MapRuntimeService()
