const auth = require('../../utils/auth')
const orderService = require('../../services/order-service')
const greatwallConfigService = require('../../services/greatwall-config-service')
const {
  resolveOrderCenterAccessState
} = require('../../utils/order-center-access')
const {
  withPageAnalytics
} = require('../../utils/with-page-analytics')

const SUBSCRIBE_PAGE_ROOT = '/subpackages/guide/pages/payment/subscribe/subscribe'
const STATUS_TABS = [
  { key: 'all', title: '全部', apiValue: '' },
  { key: 'pending', title: '待支付', apiValue: 'pending_payment' },
  { key: 'paid', title: '已完成', apiValue: 'paid' },
  { key: 'cancelled', title: '已取消', apiValue: 'cancelled' },
  { key: 'refunded', title: '已退款', apiValue: 'refunded' }
]

const ORDER_STATUS_TEXT = {
  pending: '待支付',
  paid: '已完成',
  cancelled: '已取消',
  refunded: '已退款'
}

const VIP_STATUS_TEXT = {
  active: '权益已开通',
  processing: '权益激活中',
  pending: '权益待激活'
}

function formatAmountFen(amountFen) {
  const numericValue = Number(amountFen)
  if (!Number.isFinite(numericValue)) {
    return '0.00'
  }
  return (numericValue / 100).toFixed(2)
}

function formatTimeString(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function encodeQueryValue(value) {
  return encodeURIComponent(String(value === undefined || value === null ? '' : value))
}

function navigateToPage(url) {
  wx.navigateTo({
    url,
    fail: () => {
      wx.redirectTo({
        url
      })
    }
  })
}

function redirectToHomePage() {
  wx.reLaunch({
    url: '/pages/index/index',
    fail: () => {
      wx.redirectTo({
        url: '/pages/index/index'
      })
    }
  })
}

function buildSubscribeUrl(order = {}) {
  const productCode = String(order.productCode || 'vip').trim() || 'vip'
  const featureKey = String((order.metadata && order.metadata.feature_key) || productCode || 'vip').trim() || 'vip'
  const productName = String(order.productName || 'VIP权益').trim() || 'VIP权益'
  const description = String((order.metadata && order.metadata.description) || '继续完成当前订单支付').trim() || '继续完成当前订单支付'
  const queryList = [
    `productCode=${encodeQueryValue(productCode)}`,
    `feature=${encodeQueryValue(featureKey)}`,
    `productName=${encodeQueryValue(productName)}`,
    `description=${encodeQueryValue(description)}`
  ]
  return `${SUBSCRIBE_PAGE_ROOT}?${queryList.join('&')}`
}

Page(withPageAnalytics('/pages/order-center/index', {
  data: {
    tabs: STATUS_TABS,
    activeStatus: 'all',
    activeStatusText: '全部',
    orders: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    refreshing: false,
    initialized: false,
    fallbackSourceText: ''
  },

  async onLoad() {
    const canAccessOrderCenter = await this.ensureOrderCenterAccess()
    if (!canAccessOrderCenter) {
      return
    }

    this.ensureLoginAndLoad()
  },

  onShow() {
    if (this.data.initialized && !this.data.loading) {
      this.loadOrders(true)
    }
  },

  async ensureOrderCenterAccess() {
    const accessState = await resolveOrderCenterAccessState(greatwallConfigService)

    if (accessState.allowPageAccess) {
      return true
    }

    wx.showToast({
      title: accessState.blockedMessage,
      icon: 'none',
      duration: 1800
    })

    setTimeout(() => {
      redirectToHomePage()
    }, 200)

    return false
  },

  async ensureLoginAndLoad() {
    try {
      const hasLogin = await auth.checkAndAutoLogin(3000)
      if (!hasLogin || !auth.getToken()) {
        throw new Error('登录失败，请稍后重试')
      }

      await auth.syncCurrentUserProfile().catch(() => null)
      await this.loadOrders(true)
    } catch (error) {
      wx.showToast({
        title: error?.message || '加载失败，请稍后重试',
        icon: 'none',
        duration: 1800
      })
    }
  },

  async loadOrders(reset = false) {
    if (this.data.loading) {
      return
    }

    this.setData({
      loading: true
    })

    const nextPage = reset ? 1 : this.data.page
    const statusTab = this.data.tabs.find((item) => item.key === this.data.activeStatus)
    const statusValue = statusTab ? statusTab.apiValue : ''

    try {
      const response = await orderService.listOrders({
        page: nextPage,
        page_size: this.data.pageSize,
        status: statusValue || undefined
      })
      const formattedOrders = this.decorateOrders(response && response.orders)
      const mergedOrders = reset ? formattedOrders : this.data.orders.concat(formattedOrders)
      const hasMore = !!(response && response.has_more)
      const activeStatusText = statusTab ? statusTab.title : '全部'

      this.setData({
        activeStatusText,
        orders: mergedOrders,
        page: hasMore ? nextPage + 1 : nextPage,
        hasMore,
        initialized: true,
        fallbackSourceText: response && response.source === 'local' ? '当前展示本地缓存订单' : ''
      })
    } catch (error) {
      wx.showToast({
        title: error?.message || '获取订单失败',
        icon: 'none',
        duration: 1800
      })
    } finally {
      this.setData({
        loading: false,
        refreshing: false
      })
      wx.stopPullDownRefresh()
    }
  },

  decorateOrders(orderList = []) {
    if (!Array.isArray(orderList)) {
      return []
    }

    return orderList.map((order, index) => {
      const status = String(order && order.status || 'pending').trim() || 'pending'
      const amountFen = Number(
        order && (order.amountPaidFen || order.amountTotalFen || order.amountPayableFen || 0)
      )
      const quantity = Math.max(1, Number(order && order.quantity) || 1)

      return {
        ...order,
        orderKey: String(order && (order.orderNo || order.orderId || index)),
        status,
        statusText: ORDER_STATUS_TEXT[status] || status,
        statusClass: status,
        vipStatusText: VIP_STATUS_TEXT[String(order && order.vipStatus || '').trim()] || '',
        amountText: formatAmountFen(amountFen),
        createdAtText: formatTimeString(order && order.createdAt),
        paidAtText: formatTimeString(order && order.paidAt),
        quantityText: `x${quantity}`,
        canContinuePay: status === 'pending'
      }
    })
  },

  onTabChange(event) {
    const statusKey = String(event.currentTarget?.dataset?.status || '').trim()
    if (!statusKey || statusKey === this.data.activeStatus) {
      return
    }

    this.setData({
      activeStatus: statusKey,
      orders: [],
      page: 1,
      hasMore: true
    })
    this.loadOrders(true)
  },

  onPullDownRefresh() {
    this.setData({
      refreshing: true
    })
    this.loadOrders(true)
  },

  onReachBottom() {
    if (this.data.loading || !this.data.hasMore) {
      return
    }

    this.loadOrders(false)
  },

  onBackTap() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({
        delta: 1
      })
      return
    }

    this.onHomeTap()
  },

  onHomeTap() {
    wx.reLaunch({
      url: '/pages/index/index',
      fail: () => {
        wx.redirectTo({
          url: '/pages/index/index'
        })
      }
    })
  },

  onGoSubscribe() {
    navigateToPage(SUBSCRIBE_PAGE_ROOT)
  },

  onContinuePay(event) {
    const orderIndex = Number(event.currentTarget?.dataset?.index)
    const order = this.data.orders[orderIndex]
    if (!order) {
      return
    }

    navigateToPage(buildSubscribeUrl(order))
  },

  viewDetail(event) {
    const orderId = String(event.currentTarget?.dataset?.orderId || '').trim()
    const orderNo = String(event.currentTarget?.dataset?.orderNo || '').trim()
    let query = ''

    if (orderId) {
      query = `orderId=${encodeQueryValue(orderId)}`
    } else if (orderNo) {
      query = `orderNo=${encodeQueryValue(orderNo)}`
    }

    if (!query) {
      return
    }

    navigateToPage(`/pages/order-center/detail?${query}`)
  }
}))
