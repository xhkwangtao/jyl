const {
  API_BASE_URL_STORAGE_KEY,
  ONLINE_API_BASE_URL,
  LOCAL_API_BASE_URL
} = require('./api-config')
const request = require('./request')

const DEFAULT_WX_LOGIN_TIMEOUT_MS = 2500
const DEFAULT_LOGIN_REQUEST_TIMEOUT_MS = 5000
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000
const WECHAT_LOGIN_PATH = '/client/users/wechat-login'
const CURRENT_USER_PATH = '/client/users/me'
const CURRENT_USER_CACHE_STORAGE_KEY = 'currentUserProfile'

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

function resolveAuthBaseUrl() {
  const overrideBaseUrl = normalizeBaseUrl(getStorageValue(API_BASE_URL_STORAGE_KEY))

  if (overrideBaseUrl) {
    return overrideBaseUrl
  }

  const onlineBaseUrl = normalizeBaseUrl(ONLINE_API_BASE_URL)
  return onlineBaseUrl || normalizeBaseUrl(LOCAL_API_BASE_URL)
}

function buildWechatLoginUrl() {
  return `${resolveAuthBaseUrl()}${WECHAT_LOGIN_PATH}`
}

function normalizeUserInfo(user = {}) {
  if (!user || typeof user !== 'object') {
    return {}
  }

  const nickname = String(user.nickname || user.nickName || '').trim()

  return {
    ...user,
    nickname,
    nickName: nickname
  }
}

function normalizeLoginPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const accessToken = String(payload.access_token || payload.accessToken || '').trim()
  const tokenType = String(payload.token_type || payload.tokenType || 'bearer').trim().toLowerCase() || 'bearer'
  const expiresIn = Number(payload.expires_in ?? payload.expiresIn ?? 0)
  const userInfo = normalizeUserInfo(payload.user)

  if (!accessToken) {
    return null
  }

  return {
    token: accessToken,
    tokenType,
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 0,
    userInfo
  }
}

class Auth {
  constructor() {
    this.pendingLoginPromise = null
  }

  fetchWxCode(timeoutMs = DEFAULT_WX_LOGIN_TIMEOUT_MS) {
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
            reject(new Error('获取微信 code 失败'))
            return
          }

          resolve({
            code: String(res.code).trim()
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

  exchangeCodeForToken(code, timeoutMs = DEFAULT_LOGIN_REQUEST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: buildWechatLoginUrl(),
        method: 'POST',
        timeout: timeoutMs,
        data: {
          code
        },
        header: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        success: (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const errorMessage = res?.data?.detail || res?.data?.message || `用户登录失败 (${res.statusCode})`
            reject(new Error(errorMessage))
            return
          }

          const normalizedPayload = normalizeLoginPayload(res.data)

          if (!normalizedPayload) {
            reject(new Error('登录接口返回数据不完整'))
            return
          }

          resolve(normalizedPayload)
        },
        fail: (error) => {
          reject(new Error(error?.errMsg || '用户登录请求失败'))
        }
      })
    })
  }

  persistLoginState(loginPayload = {}) {
    const now = Date.now()
    const userInfo = normalizeUserInfo(loginPayload.userInfo)
    const tokenExpiresAt = loginPayload.expiresIn > 0
      ? now + loginPayload.expiresIn * 1000
      : 0

    wx.setStorageSync('token', loginPayload.token)
    wx.setStorageSync('tokenType', loginPayload.tokenType || 'bearer')
    wx.setStorageSync('tokenExpiresAt', tokenExpiresAt)
    wx.setStorageSync('loginTime', now)
    wx.setStorageSync('userInfo', userInfo)
    wx.setStorageSync('clientUser', userInfo)
    wx.removeStorageSync(CURRENT_USER_CACHE_STORAGE_KEY)

    return {
      token: loginPayload.token,
      tokenType: loginPayload.tokenType || 'bearer',
      expiresIn: loginPayload.expiresIn || 0,
      tokenExpiresAt,
      userInfo,
      user: userInfo
    }
  }

  persistUserInfo(userInfo = {}) {
    const existingUserInfo = normalizeUserInfo(this.getUserInfo() || {})
    const normalizedUserInfo = normalizeUserInfo({
      ...existingUserInfo,
      ...userInfo
    })

    wx.setStorageSync('userInfo', normalizedUserInfo)
    wx.setStorageSync('clientUser', normalizedUserInfo)

    return normalizedUserInfo
  }

  async wxLogin(options = {}) {
    if (this.pendingLoginPromise) {
      return this.pendingLoginPromise
    }

    const wxLoginTimeoutMs = Number(options.timeoutMs) > 0
      ? Number(options.timeoutMs)
      : DEFAULT_WX_LOGIN_TIMEOUT_MS
    const requestTimeoutMs = Number(options.requestTimeoutMs) > 0
      ? Number(options.requestTimeoutMs)
      : DEFAULT_LOGIN_REQUEST_TIMEOUT_MS

    this.pendingLoginPromise = this.fetchWxCode(wxLoginTimeoutMs)
      .then(({ code }) => this.exchangeCodeForToken(code, requestTimeoutMs))
      .then((loginPayload) => this.persistLoginState(loginPayload))
      .finally(() => {
        this.pendingLoginPromise = null
      })

    return this.pendingLoginPromise
  }

  getToken() {
    return String(getStorageValue('token') || '').trim()
  }

  getTokenExpiresAt() {
    const tokenExpiresAt = Number(getStorageValue('tokenExpiresAt') || 0)
    return Number.isFinite(tokenExpiresAt) ? tokenExpiresAt : 0
  }

  getCachedCurrentUserProfile() {
    const cachedProfile = getStorageValue(CURRENT_USER_CACHE_STORAGE_KEY)
    if (!cachedProfile || typeof cachedProfile !== 'object') {
      return null
    }

    return normalizeUserInfo(cachedProfile)
  }

  persistCurrentUserProfileCache(userInfo = {}) {
    const normalizedUserInfo = normalizeUserInfo(userInfo)
    wx.setStorageSync(CURRENT_USER_CACHE_STORAGE_KEY, normalizedUserInfo)
    return normalizedUserInfo
  }

  hasValidToken(bufferMs = TOKEN_EXPIRY_BUFFER_MS) {
    const token = this.getToken()
    if (!token) {
      return false
    }

    const tokenExpiresAt = this.getTokenExpiresAt()
    const tokenType = String(getStorageValue('tokenType') || '').trim().toLowerCase()
    if (!tokenExpiresAt) {
      if (!tokenType || /^jyl_/i.test(token)) {
        return false
      }

      return true
    }

    return tokenExpiresAt - Date.now() > bufferMs
  }

  isLoggedIn() {
    return this.hasValidToken(0)
  }

  getUserInfo() {
    return getStorageValue('userInfo') || null
  }

  async syncCurrentUserProfile() {
    if (!this.isLoggedIn()) {
      return this.getUserInfo()
    }

    const userProfile = await request.get(CURRENT_USER_PATH)
    this.persistCurrentUserProfileCache(userProfile)
    return this.persistUserInfo(userProfile)
  }

  logout() {
    wx.removeStorageSync('token')
    wx.removeStorageSync('tokenType')
    wx.removeStorageSync('tokenExpiresAt')
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('clientUser')
    wx.removeStorageSync('loginTime')
    wx.removeStorageSync(CURRENT_USER_CACHE_STORAGE_KEY)
  }

  debugAuthStatus() {
    return {
      hasToken: !!this.getToken(),
      hasValidToken: this.hasValidToken(0),
      tokenExpiresAt: this.getTokenExpiresAt() || null,
      userInfo: this.getUserInfo(),
      loginTime: getStorageValue('loginTime') || null,
      authBaseUrl: resolveAuthBaseUrl()
    }
  }

  async checkAndAutoLogin(timeoutMs = DEFAULT_WX_LOGIN_TIMEOUT_MS) {
    if (this.hasValidToken()) {
      return true
    }

    if (this.getToken()) {
      this.logout()
    }

    try {
      await this.wxLogin({
        timeoutMs
      })
      return true
    } catch (error) {
      return false
    }
  }
}

module.exports = new Auth()
