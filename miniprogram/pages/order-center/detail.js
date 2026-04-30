const auth = require('../../utils/auth')
const orderService = require('../../services/order-service')
const {
  withPageAnalytics
} = require('../../utils/with-page-analytics')

const SUBSCRIBE_PAGE_ROOT = '/subpackages/guide/pages/payment/subscribe/subscribe'

const ORDER_STATUS_TEXT = {
  pending: '待支付',
  paid: '已完成',
  cancelled: '已取消',
  refunded: '已退款'
}

const VIP_STATUS_TEXT = {
  active: '可领取',
  processing: '准备中',
  pending: '待领取'
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
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

function encodeQueryValue(value) {
  return encodeURIComponent(String(value === undefined || value === null ? '' : value))
}

function normalizeDisplayProductName(value) {
  const text = String(value || '').trim()
  if (!text) {
    return '研学道具'
  }

  if (/vip/i.test(text) || text.includes('会员') || text.includes('权益')) {
    return '研学道具'
  }

  return text
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

function buildSubscribeUrl(order = {}) {
  const productCode = String(order.productCode || 'vip').trim() || 'vip'
  const featureKey = String((order.metadata && order.metadata.feature_key) || productCode || 'vip').trim() || 'vip'
  const productName = normalizeDisplayProductName(order.productName || '研学道具')
  const description = String((order.metadata && order.metadata.description) || '继续完成当前订单支付').trim() || '继续完成当前订单支付'
  const queryList = [
    `productCode=${encodeQueryValue(productCode)}`,
    `feature=${encodeQueryValue(featureKey)}`,
    `productName=${encodeQueryValue(productName)}`,
    `description=${encodeQueryValue(description)}`
  ]
  return `${SUBSCRIBE_PAGE_ROOT}?${queryList.join('&')}`
}

Page(withPageAnalytics('/pages/order-center/detail', {
  data: {
    orderId: '',
    orderNo: '',
    order: null,
    loading: false,
    errorMessage: ''
  },

  async onLoad(options = {}) {
    this.parseOptions(options)

    try {
      const hasLogin = await auth.checkAndAutoLogin(3000)
      if (!hasLogin || !auth.getToken()) {
        throw new Error('登录失败，请稍后重试')
      }
      await this.loadOrderDetail()
    } catch (error) {
      this.setData({
        errorMessage: error?.message || '订单加载失败'
      })
    }
  },

  parseOptions(options = {}) {
    this.setData({
      orderId: String(options.orderId || '').trim(),
      orderNo: String(options.orderNo || '').trim()
    })
  },

  async loadOrderDetail() {
    if (this.data.loading) {
      return
    }

    this.setData({
      loading: true,
      errorMessage: ''
    })

    try {
      let orderDetail = null
      if (this.data.orderId) {
        orderDetail = await orderService.getOrderDetail(this.data.orderId)
      } else if (this.data.orderNo) {
        orderDetail = await orderService.getOrderDetailByNo(this.data.orderNo)
      }

      if (!orderDetail) {
        throw new Error('未找到订单信息')
      }

      this.setData({
        order: this.decorateOrder(orderDetail),
        orderId: String(orderDetail.orderId || ''),
        orderNo: String(orderDetail.orderNo || '')
      })
    } catch (error) {
      this.setData({
        errorMessage: error?.message || '加载失败，请稍后重试'
      })
    } finally {
      this.setData({
        loading: false
      })
    }
  },

  async loadOrderStatus() {
    if (this.data.loading) {
      return
    }

    const orderId = String(this.data.orderId || '').trim()
    if (!orderId) {
      this.loadOrderDetail()
      return
    }

    this.setData({
      loading: true,
      errorMessage: ''
    })

    try {
      const orderStatusDetail = await orderService.getOrderStatus(orderId)
      if (!orderStatusDetail) {
        throw new Error('未找到订单状态信息')
      }

      this.setData({
        order: this.decorateOrder(orderStatusDetail),
        orderId: String(orderStatusDetail.orderId || orderId),
        orderNo: String(orderStatusDetail.orderNo || this.data.orderNo || '')
      })
    } catch (error) {
      this.setData({
        errorMessage: error?.message || '刷新失败，请稍后重试'
      })
    } finally {
      this.setData({
        loading: false
      })
    }
  },

  decorateOrder(order = {}) {
    const status = String(order.status || 'pending').trim() || 'pending'
    const quantity = Math.max(1, Number(order.quantity) || 1)
    const productName = normalizeDisplayProductName(order.productName)
    const items = Array.isArray(order.items)
      ? order.items.map((item) => ({
        title: normalizeDisplayProductName(item.title || productName || '研学道具'),
        quantity: Math.max(1, Number(item.quantity) || quantity),
        unitAmountText: formatAmountFen(item.unitAmountFen),
        totalAmountText: formatAmountFen(item.totalAmountFen)
      }))
      : []
    const transactions = Array.isArray(order.transactions)
      ? order.transactions.map((transaction) => ({
        transactionId: transaction.transactionId,
        tradeState: transaction.tradeState || 'SUCCESS',
        amountText: formatAmountFen(transaction.amountFen),
        payTimeText: formatTimeString(transaction.payTime)
      }))
      : []

    return {
      ...order,
      productName,
      status,
      statusText: ORDER_STATUS_TEXT[status] || status,
      vipStatusText: VIP_STATUS_TEXT[String(order.vipStatus || '').trim()] || '',
      amountText: formatAmountFen(order.amountPaidFen || order.amountTotalFen || order.amountPayableFen),
      amountPayableText: formatAmountFen(order.amountPayableFen || order.amountTotalFen),
      createdAtText: formatTimeString(order.createdAt),
      paidAtText: formatTimeString(order.paidAt),
      vipExpiresAtText: formatTimeString(order.vipExpiresAt),
      quantityText: `x${quantity}`,
      canContinuePay: status === 'pending',
      items,
      transactions
    }
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

  refreshOrder() {
    if (this.data.orderId) {
      this.loadOrderStatus()
      return
    }

    this.loadOrderDetail()
  },

  continuePay() {
    const order = this.data.order
    if (!order || !order.canContinuePay) {
      return
    }

    navigateToPage(buildSubscribeUrl(order))
  },

  copyOrderNo() {
    const orderNo = String(this.data.orderNo || '').trim()
    if (!orderNo) {
      return
    }

    wx.setClipboardData({
      data: orderNo,
      success() {
        wx.showToast({
          title: '订单号已复制',
          icon: 'none',
          duration: 1500
        })
      }
    })
  }
}))
