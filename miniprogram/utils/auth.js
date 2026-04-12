class Auth {
  async wxLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
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
        fail: () => {
          reject(new Error('微信登录失败'))
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

  async checkAndAutoLogin() {
    const existingToken = this.getToken()
    const loginTime = wx.getStorageSync('loginTime')

    if (!existingToken) {
      try {
        await this.wxLogin()
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
          await this.wxLogin()
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
