const apiConfig = require('./api-config')

function getStorageValue(key) {
  try {
    return wx.getStorageSync(key)
  } catch (error) {
    return ''
  }
}

function isAbsoluteUrl(url) {
  return /^https?:\/\//i.test(String(url || ''))
}

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

class Request {
  getBaseUrl() {
    const overrideBaseUrl = normalizeBaseUrl(
      getStorageValue(apiConfig.API_BASE_URL_STORAGE_KEY)
    )

    if (overrideBaseUrl) {
      return overrideBaseUrl
    }

    return normalizeBaseUrl(apiConfig.API_BASE_URL)
  }

  buildUrl(url = '') {
    return isAbsoluteUrl(url) ? url : `${this.getBaseUrl()}${url}`
  }

  async request(options = {}) {
    const token = String(getStorageValue('token') || '').trim()

    return new Promise((resolve, reject) => {
      wx.request({
        url: this.buildUrl(options.url || ''),
        method: options.method || 'GET',
        data: options.data,
        timeout: options.timeout || apiConfig.TIMEOUT,
        header: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
          ...options.header
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data)
            return
          }

          let errorMessage = `请求失败 (${res.statusCode})`

          if (res.data && typeof res.data === 'object') {
            errorMessage = res.data.message || res.data.detail || res.data.error || errorMessage
          } else if (typeof res.data === 'string' && res.data.trim()) {
            errorMessage = res.data
          }

          reject(new Error(errorMessage))
        },
        fail: (error) => {
          reject(new Error(error?.errMsg || '网络请求失败'))
        }
      })
    })
  }

  stream(options = {}) {
    const token = String(getStorageValue('token') || '').trim()
    let settled = false
    let receivedChunk = false

    const task = wx.request({
      url: this.buildUrl(options.url || ''),
      method: options.method || 'GET',
      data: options.data,
      timeout: options.timeout || apiConfig.TIMEOUT,
      enableChunked: true,
      responseType: 'arraybuffer',
      header: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: token ? `Bearer ${token}` : '',
        ...options.header
      },
      success: (res) => {
        if (settled) {
          return
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          settled = true
          const errorMessage = res?.data?.detail || res?.data?.message || `请求失败 (${res.statusCode})`
          if (typeof options.onError === 'function') {
            options.onError(new Error(errorMessage))
          }
          return
        }

        if (!receivedChunk && res.data && typeof options.onChunk === 'function') {
          options.onChunk(res.data)
        }

        settled = true
        if (typeof options.onComplete === 'function') {
          options.onComplete(res.data, res)
        }
      },
      fail: (error) => {
        if (settled) {
          return
        }

        settled = true
        const message = error?.errMsg || '网络请求失败'
        if (/abort/i.test(message)) {
          if (typeof options.onAbort === 'function') {
            options.onAbort()
          }
          return
        }
        if (typeof options.onError === 'function') {
          options.onError(new Error(message))
        }
      }
    })

    if (task && typeof task.onChunkReceived === 'function') {
      task.onChunkReceived((chunkEvent) => {
        receivedChunk = true
        if (typeof options.onChunk === 'function') {
          options.onChunk(chunkEvent?.data, chunkEvent)
        }
      })
    }

    return task
  }

  get(url, data = {}, options = {}) {
    return this.request({
      ...options,
      url,
      data,
      method: 'GET'
    })
  }
}

module.exports = new Request()
