const apiConfig = require('./api-config')

function getStorageValue(key) {
  try {
    return wx.getStorageSync(key)
  } catch (error) {
    return ''
  }
}

class Request {
  getTenantId() {
    const storedTenantId = String(
      getStorageValue('tenantId')
      || getStorageValue('scenicAreaId')
      || ''
    ).trim()

    return storedTenantId || apiConfig.SCENIC_AREA_ID
  }

  getBaseUrl() {
    return `https://${apiConfig.API_HOST}/${this.getTenantId()}/api/v1`
  }

  async request(options = {}) {
    const token = String(getStorageValue('token') || '').trim()
    const tenantId = this.getTenantId()

    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.getBaseUrl()}${options.url || ''}`,
        method: options.method || 'GET',
        data: options.data,
        timeout: options.timeout || apiConfig.TIMEOUT,
        header: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
          'X-Scenic-Area': tenantId,
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
