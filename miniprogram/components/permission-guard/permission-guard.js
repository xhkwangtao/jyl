const auth = require('../../utils/auth')
const entitlementService = require('../../services/entitlement-service')

const PERMISSION_AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeFeatureKey(featureKey = '') {
  return entitlementService.normalizeFeatureKey(featureKey)
}

function normalizeEntitlementKey(entitlementKey = '') {
  return normalizeText(entitlementKey)
}

function navigateToPage(url = '') {
  const targetUrl = normalizeText(url)
  if (!targetUrl) {
    return
  }

  wx.navigateTo({
    url: targetUrl,
    fail: () => {
      wx.redirectTo({
        url: targetUrl
      })
    }
  })
}

function buildCurrentPageUrl() {
  const currentPages = getCurrentPages()
  const currentPage = currentPages[currentPages.length - 1] || null
  if (!currentPage || !currentPage.route) {
    return ''
  }

  const options = currentPage.options || {}
  const query = Object.keys(options).reduce((result, key) => {
    const value = options[key]
    if (value === undefined || value === null || value === '') {
      return result
    }

    result.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    return result
  }, []).join('&')

  return query ? `/${currentPage.route}?${query}` : `/${currentPage.route}`
}

Component({
  options: {
    virtualHost: true
  },

  lifetimes: {
    attached() {
      this.pageVisible = true
      this.trackedFeatureKeySet = new Set()
      this.trackedEntitlementKeySet = new Set()
      this.permissionAutoRefreshTimer = null
      this.permissionRefreshPromise = null
      this.startPermissionAutoRefresh()
    },

    detached() {
      this.stopPermissionAutoRefresh()
      this.permissionRefreshPromise = null
      this.trackedFeatureKeySet = null
      this.trackedEntitlementKeySet = null
    }
  },

  pageLifetimes: {
    show() {
      this.pageVisible = true
      this.startPermissionAutoRefresh()
      this.refreshTrackedPermissions({
        reason: 'page_show'
      }).catch(() => {})
    },

    hide() {
      this.pageVisible = false
      this.stopPermissionAutoRefresh()
    }
  },

  methods: {
    trackFeatureKeys(featureKeyList = []) {
      if (!(this.trackedFeatureKeySet instanceof Set)) {
        this.trackedFeatureKeySet = new Set()
      }

      ;(Array.isArray(featureKeyList) ? featureKeyList : [featureKeyList]).forEach((featureKey) => {
        const normalizedFeatureKey = normalizeFeatureKey(featureKey)
        if (normalizedFeatureKey) {
          this.trackedFeatureKeySet.add(normalizedFeatureKey)
        }
      })

      this.startPermissionAutoRefresh()
    },

    trackEntitlementKeys(entitlementKeyList = []) {
      if (!(this.trackedEntitlementKeySet instanceof Set)) {
        this.trackedEntitlementKeySet = new Set()
      }

      ;(Array.isArray(entitlementKeyList) ? entitlementKeyList : [entitlementKeyList]).forEach((entitlementKey) => {
        const normalizedEntitlementKey = normalizeEntitlementKey(entitlementKey)
        if (normalizedEntitlementKey) {
          this.trackedEntitlementKeySet.add(normalizedEntitlementKey)
        }
      })

      this.startPermissionAutoRefresh()
    },

    getTrackedFeatureKeyList() {
      return this.trackedFeatureKeySet instanceof Set
        ? Array.from(this.trackedFeatureKeySet).filter(Boolean)
        : []
    },

    getTrackedEntitlementKeyList() {
      return this.trackedEntitlementKeySet instanceof Set
        ? Array.from(this.trackedEntitlementKeySet).filter(Boolean)
        : []
    },

    shouldRunPermissionAutoRefresh() {
      return this.pageVisible !== false
        && !!auth.getToken()
        && (
          this.getTrackedFeatureKeyList().length > 0
          || this.getTrackedEntitlementKeyList().length > 0
        )
    },

    startPermissionAutoRefresh() {
      if (!this.shouldRunPermissionAutoRefresh() || this.permissionAutoRefreshTimer) {
        return
      }

      this.permissionAutoRefreshTimer = setInterval(() => {
        this.refreshTrackedPermissions({
          reason: 'interval'
        })
      }, PERMISSION_AUTO_REFRESH_INTERVAL_MS)
    },

    stopPermissionAutoRefresh() {
      if (!this.permissionAutoRefreshTimer) {
        return
      }

      clearInterval(this.permissionAutoRefreshTimer)
      this.permissionAutoRefreshTimer = null
    },

    async refreshTrackedPermissions(options = {}) {
      if (this.permissionRefreshPromise) {
        return this.permissionRefreshPromise
      }

      const featureKeyList = this.getTrackedFeatureKeyList()
      const entitlementKeyList = this.getTrackedEntitlementKeyList()

      if ((!featureKeyList.length && !entitlementKeyList.length) || !auth.getToken()) {
        this.stopPermissionAutoRefresh()
        return {
          featureAccessMap: {},
          entitlementAccessMap: {}
        }
      }

      this.startPermissionAutoRefresh()

      this.permissionRefreshPromise = (async () => {
        const refreshOptions = {
          ...options,
          ensureLogin: false,
          forceRefresh: true
        }

        const [featureAccessMap, entitlementAccessMap] = await Promise.all([
          featureKeyList.length
            ? entitlementService.prefetchFeatureAccessList(featureKeyList, refreshOptions)
            : Promise.resolve({}),
          entitlementKeyList.length
            ? entitlementService.prefetchEntitlementList(entitlementKeyList, refreshOptions)
            : Promise.resolve({})
        ])

        const detail = {
          reason: normalizeText(options.reason) || 'manual',
          featureKeyList,
          entitlementKeyList,
          featureAccessMap,
          entitlementAccessMap
        }

        this.triggerEvent('permissionrefresh', detail)
        return detail
      })().finally(() => {
        this.permissionRefreshPromise = null

        if (!this.shouldRunPermissionAutoRefresh()) {
          this.stopPermissionAutoRefresh()
        }
      })

      return this.permissionRefreshPromise
    },

    getCurrentUserProfile() {
      return auth.getCachedCurrentUserProfile() || auth.getUserInfo() || null
    },

    getCurrentUserType() {
      return normalizeText(this.getCurrentUserProfile()?.user_type).toLowerCase()
    },

    isStaffUser() {
      return this.getCurrentUserType() === 'staff'
    },

    isVisitorUser() {
      return this.getCurrentUserType() === 'visitor'
    },

    async ensureLogin(options = {}) {
      if (options.ensureLogin === false) {
        return !!auth.getToken()
      }

      const hasLogin = await auth.checkAndAutoLogin(Number(options.timeoutMs) || 2500).catch(() => false)
      if (!hasLogin && options.showLoginToast !== false) {
        wx.showToast({
          title: options.loginToastTitle || '登录失败，请稍后重试',
          icon: 'none'
        })
      }

      return hasLogin
    },

    async refreshCurrentUserProfile(options = {}) {
      const hasLogin = await this.ensureLogin({
        ...options,
        showLoginToast: options.showLoginToast !== false
      })

      if (!hasLogin || !auth.getToken()) {
        return this.getCurrentUserProfile()
      }

      try {
        return await auth.syncCurrentUserProfile()
      } catch (error) {
        if (options.showErrorToast) {
          wx.showToast({
            title: error?.message || '用户信息刷新失败',
            icon: 'none'
          })
        }
        return this.getCurrentUserProfile()
      }
    },

    async checkEntitlement(entitlementKey = '', options = {}) {
      this.trackEntitlementKeys(entitlementKey)

      const hasLogin = await this.ensureLogin({
        ...options,
        showLoginToast: options.showLoginToast === true
      })

      if (!hasLogin || !auth.getToken()) {
        return {
          available: false,
          reason: 'not_logged_in',
          entitlement_key: normalizeText(entitlementKey)
        }
      }

      this.startPermissionAutoRefresh()
      return entitlementService.checkEntitlement(entitlementKey, options)
    },

    async checkFeatureAccess(featureKey = '', options = {}) {
      this.trackFeatureKeys(featureKey)

      const hasLogin = await this.ensureLogin({
        ...options,
        showLoginToast: options.showLoginToast === true
      })

      if (!hasLogin || !auth.getToken()) {
        return {
          available: false,
          reason: 'not_logged_in',
          feature_key: normalizeText(featureKey),
          recommended_product_code: ''
        }
      }

      this.startPermissionAutoRefresh()
      return entitlementService.checkFeatureAccess(featureKey, options)
    },

    buildSubscribeUrl(options = {}, access = {}) {
      const featureKey = normalizeText(options.featureKey)
      const featureName = normalizeText(options.featureName)
      const productName = normalizeText(options.productName)
      const description = normalizeText(options.description)
      const successRedirect = normalizeText(options.successRedirect || buildCurrentPageUrl())
      const amount = normalizeText(options.amount)
      const originalPrice = normalizeText(options.originalPrice)
      const productCode = normalizeText(
        access?.recommended_product_code
        || options.productCode
        || options.fallbackProductCode
        || 'vip'
      )

      const queryList = [
        `feature=${encodeURIComponent(featureKey)}`,
        `productCode=${encodeURIComponent(productCode)}`
      ]

      if (featureName) {
        queryList.push(`featureName=${encodeURIComponent(featureName)}`)
      }

      if (productName) {
        queryList.push(`productName=${encodeURIComponent(productName)}`)
      }

      if (description) {
        queryList.push(`description=${encodeURIComponent(description)}`)
      }

      if (amount) {
        queryList.push(`amount=${encodeURIComponent(amount)}`)
      }

      if (originalPrice) {
        queryList.push(`originalPrice=${encodeURIComponent(originalPrice)}`)
      }

      if (successRedirect) {
        queryList.push(`successRedirect=${encodeURIComponent(successRedirect)}`)
      }

      return `/subpackages/guide/pages/payment/subscribe/subscribe?${queryList.join('&')}`
    },

    async ensureFeatureAccess(options = {}) {
      const featureKey = normalizeText(options.featureKey)
      let access = null

      try {
        access = await this.checkFeatureAccess(featureKey, options)
      } catch (error) {
        if (options.showErrorToast !== false) {
          wx.showToast({
            title: error?.message || '权益校验失败，请稍后重试',
            icon: 'none'
          })
        }

        this.triggerEvent('featureerror', {
          featureKey,
          error
        })

        return {
          allowed: false,
          access: null,
          subscribeUrl: '',
          error
        }
      }

      this.triggerEvent('featurechecked', {
        featureKey,
        access
      })

      if (access?.available) {
        return {
          allowed: true,
          access,
          subscribeUrl: ''
        }
      }

      if (access?.reason === 'not_logged_in') {
        return {
          allowed: false,
          access,
          subscribeUrl: ''
        }
      }

      const subscribeUrl = this.buildSubscribeUrl(options, access)

      if (options.showDeniedToast) {
        wx.showToast({
          title: options.deniedToastTitle || '当前功能需要开通权益',
          icon: 'none'
        })
      }

      if (options.redirectOnDenied !== false && subscribeUrl) {
        navigateToPage(subscribeUrl)
      }

      this.triggerEvent('featuredenied', {
        featureKey,
        access,
        subscribeUrl
      })

      return {
        allowed: false,
        access,
        subscribeUrl
      }
    },

    async ensureStaffUser(options = {}) {
      await this.refreshCurrentUserProfile({
        ...options,
        showLoginToast: options.showLoginToast !== false
      })

      if (!auth.getToken()) {
        return {
          allowed: false,
          userType: '',
          reason: 'not_logged_in'
        }
      }

      const allowed = this.isStaffUser()
      const userType = this.getCurrentUserType()

      if (!allowed && options.showDeniedToast !== false) {
        wx.showToast({
          title: options.deniedToastTitle || '当前账号不是工作人员',
          icon: 'none'
        })
      }

      if (!allowed && options.redirectUrl) {
        setTimeout(() => {
          navigateToPage(options.redirectUrl)
        }, Number(options.redirectDelayMs) || 160)
      }

      return {
        allowed,
        userType
      }
    },

    async prefetchFeatureAccessList(featureKeyList = [], options = {}) {
      this.trackFeatureKeys(featureKeyList)

      if (options.ensureLogin !== false && !auth.getToken()) {
        const hasLogin = await this.ensureLogin({
          ...options,
          showLoginToast: false
        })
        if (!hasLogin || !auth.getToken()) {
          return {}
        }
      }

      if (!auth.getToken()) {
        this.stopPermissionAutoRefresh()
        return {}
      }

      this.startPermissionAutoRefresh()
      return entitlementService.prefetchFeatureAccessList(featureKeyList, options)
    },

    async prefetchEntitlementList(entitlementKeyList = [], options = {}) {
      this.trackEntitlementKeys(entitlementKeyList)

      if (options.ensureLogin !== false && !auth.getToken()) {
        const hasLogin = await this.ensureLogin({
          ...options,
          showLoginToast: false
        })
        if (!hasLogin || !auth.getToken()) {
          return {}
        }
      }

      if (!auth.getToken()) {
        this.stopPermissionAutoRefresh()
        return {}
      }

      this.startPermissionAutoRefresh()
      return entitlementService.prefetchEntitlementList(entitlementKeyList, options)
    }
  }
})
