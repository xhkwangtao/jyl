const DEFAULT_LOGIN_TIMEOUT_MS = 2500

class Auth {
  async wxLogin(options = {}) {
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_LOGIN_TIMEOUT_MS

    return new Promise((resolve, reject) => {
      let settled = false
      const timeoutId = setTimeout(() => {
        if (settled) {
          return
        }

        settled = true
        reject(new Error('微信登录超时'))
      }, timeoutMs)

      wx.login({
        success: (res) => {
          if (settled) {
            return
          }

          clearTimeout(timeoutId)
          settled = true

          if (!res.code) {
            reject(new Error('获取微信code失败'))
            return
          }

          const pseudoToken = `jyl_${res.code}_${Date.now()}`
          wx.setStorageSync('token', pseudoToken)
          wx.setStorageSync('loginTime', Date.now())

          resolve({
            token: pseudoToken,
            code: res.code
          })
        },
        fail: (error) => {
          if (settled) {
            return
          }

          clearTimeout(timeoutId)
          settled = true
          reject(new Error(error?.errMsg || '微信登录失败'))
        }
      })
    })
  }

  isLoggedIn() {
    const token = wx.getStorageSync('token')
    return !!token
  }

  getUserInfo() {
    return wx.getStorageSync('userInfo') || null
  }

  getToken() {
    return wx.getStorageSync('token') || ''
  }

  logout() {
    wx.removeStorageSync('token')
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('loginTime')
  }

  debugAuthStatus() {
    return {
      hasToken: !!this.getToken(),
      userInfo: this.getUserInfo(),
      loginTime: wx.getStorageSync('loginTime') || null
    }
  }

  async checkAndAutoLogin(timeoutMs = DEFAULT_LOGIN_TIMEOUT_MS) {
    const existingToken = this.getToken()
    const loginTime = wx.getStorageSync('loginTime')

    if (!existingToken) {
      try {
        await this.wxLogin({ timeoutMs })
        return true
      } catch (error) {
        return false
      }
    }

    if (loginTime) {
      const hoursSinceLogin = (Date.now() - loginTime) / (1000 * 60 * 60)
      if (hoursSinceLogin > 23) {
        this.logout()
        try {
          await this.wxLogin({ timeoutMs })
          return true
        } catch (error) {
          return false
        }
      }
    }

    return true
  }
}

module.exports = new Auth()
