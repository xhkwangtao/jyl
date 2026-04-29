const request = require('../utils/request')

const ORDER_API_PREFIX_STORAGE_KEY = 'jyl_order_api_prefix'
const LOCAL_ORDER_STORAGE_KEY = 'jyl_local_payment_orders'
const MAX_LOCAL_ORDER_COUNT = 40
const DEFAULT_PAGE_SIZE = 10
const ORDER_API_PREFIXES = [
  '/client/orders',
  '/orders',
  '/client/payments/orders'
]

let cachedOrderApiPrefix = ''

function getStorageValue(key) {
  try {
    return wx.getStorageSync(key)
  } catch (error) {
    return ''
  }
}

function setStorageValue(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (error) {}
}

function readLocalOrderList() {
  const localOrderList = getStorageValue(LOCAL_ORDER_STORAGE_KEY)
  return Array.isArray(localOrderList) ? localOrderList : []
}

function writeLocalOrderList(orderList = []) {
  const normalizedList = Array.isArray(orderList)
    ? orderList.filter((item) => item && (item.orderNo || item.orderId)).slice(0, MAX_LOCAL_ORDER_COUNT)
    : []
  setStorageValue(LOCAL_ORDER_STORAGE_KEY, normalizedList)
  return normalizedList
}

function normalizeString(value) {
  return String(value === undefined || value === null ? '' : value).trim()
}

function normalizeNumber(value, fallbackValue = 0) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallbackValue
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstDefined(source = {}, keyList = []) {
  for (let index = 0; index < keyList.length; index += 1) {
    const key = keyList[index]
    const value = source ? source[key] : undefined
    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }
  return undefined
}

function firstString(source = {}, keyList = [], fallbackValue = '') {
  for (let index = 0; index < keyList.length; index += 1) {
    const key = keyList[index]
    const normalizedValue = normalizeString(source ? source[key] : '')
    if (normalizedValue) {
      return normalizedValue
    }
  }
  return fallbackValue
}

function normalizeStatus(statusValue = '', paidAtValue = '') {
  const normalizedStatus = normalizeString(statusValue).toLowerCase()

  if (!normalizedStatus) {
    return paidAtValue ? 'paid' : 'pending'
  }

  if ([
    'pending',
    'created',
    'new',
    'unpaid',
    'awaiting_payment',
    'pending_payment'
  ].includes(normalizedStatus)) {
    return 'pending'
  }

  if ([
    'paid',
    'completed',
    'success',
    'succeeded',
    'finished',
    'active'
  ].includes(normalizedStatus)) {
    return 'paid'
  }

  if ([
    'cancelled',
    'canceled',
    'closed',
    'failed'
  ].includes(normalizedStatus)) {
    return 'cancelled'
  }

  if ([
    'refunded',
    'refund_success',
    'partial_refunded'
  ].includes(normalizedStatus)) {
    return 'refunded'
  }

  return normalizedStatus
}

function getStatusPriority(statusValue = '') {
  switch (normalizeStatus(statusValue)) {
    case 'refunded':
      return 4
    case 'paid':
      return 3
    case 'cancelled':
      return 2
    case 'pending':
    default:
      return 1
  }
}

function sumOrderItemQuantity(itemList = []) {
  return itemList.reduce((totalCount, item) => {
    return totalCount + Math.max(0, normalizeNumber(item && item.quantity, 0))
  }, 0)
}

function normalizeOrderItem(rawItem = {}) {
  const unitAmountFen = normalizeNumber(
    firstDefined(rawItem, ['unit_amount', 'unit_amount_cents', 'unitAmount', 'unitAmountFen']),
    0
  )
  const quantity = Math.max(1, normalizeNumber(firstDefined(rawItem, ['quantity']), 1))
  const totalAmountFen = normalizeNumber(
    firstDefined(rawItem, ['total_amount', 'total_amount_cents', 'totalAmount', 'totalAmountFen']),
    unitAmountFen > 0 ? unitAmountFen * quantity : 0
  )

  return {
    sku: firstString(rawItem, ['sku']),
    title: firstString(rawItem, ['title', 'product_name', 'productName'], 'VIP权益'),
    quantity,
    unitAmountFen,
    totalAmountFen
  }
}

function normalizeTransaction(rawTransaction = {}) {
  return {
    transactionId: firstString(rawTransaction, ['transaction_id', 'transactionId', 'wechat_transaction_id']),
    tradeState: firstString(rawTransaction, ['trade_state', 'tradeState', 'status'], 'SUCCESS'),
    amountFen: normalizeNumber(
      firstDefined(rawTransaction, ['amount_total', 'amount_cents', 'amount', 'amountFen']),
      0
    ),
    payTime: firstString(rawTransaction, ['success_time', 'paid_at', 'payTime', 'created_at']),
    provider: firstString(rawTransaction, ['provider', 'payment_method', 'paymentMethod'])
  }
}

function buildFallbackOrderItems({
  productName = '',
  quantity = 1,
  totalAmountFen = 0
} = {}) {
  return [
    {
      sku: '',
      title: productName || 'VIP权益',
      quantity: Math.max(1, normalizeNumber(quantity, 1)),
      unitAmountFen: totalAmountFen > 0 ? Math.round(totalAmountFen / Math.max(1, normalizeNumber(quantity, 1))) : 0,
      totalAmountFen: Math.max(0, normalizeNumber(totalAmountFen, 0))
    }
  ]
}

function normalizeOrder(rawOrder = {}) {
  if (!rawOrder || typeof rawOrder !== 'object') {
    return null
  }

  const paymentInfo = safeObject(rawOrder.payment)
  const metadata = safeObject(rawOrder.metadata || rawOrder.extra_metadata)
  const normalizedItems = Array.isArray(rawOrder.items)
    ? rawOrder.items.map((item) => normalizeOrderItem(item)).filter(Boolean)
    : []
  const quantity = Math.max(
    1,
    normalizeNumber(firstDefined(rawOrder, ['quantity']), 0) || sumOrderItemQuantity(normalizedItems) || 1
  )
  const totalAmountFen = normalizeNumber(
    firstDefined(rawOrder, [
      'amount_total',
      'total_amount',
      'total_amount_cents',
      'totalAmountFen',
      'amount_payable',
      'paid_amount_cents',
      'amount_cents'
    ]),
    0
  )
  const payableAmountFen = normalizeNumber(
    firstDefined(rawOrder, ['amount_payable', 'amount_payable_fen', 'amountPayableFen']),
    totalAmountFen
  )
  const paidAmountFen = normalizeNumber(
    firstDefined(rawOrder, ['paid_amount_cents', 'amount_paid', 'amountPaidFen']),
    normalizeNumber(firstDefined(paymentInfo, ['amount_cents', 'amount_total', 'amountFen']), 0)
  )
  const productName = firstString(rawOrder, ['product_name', 'productName'], normalizedItems[0]?.title || 'VIP权益')
  const paidAt = firstString(rawOrder, ['paid_at', 'paidAt'], firstString(paymentInfo, ['paid_at', 'success_time']))
  const status = normalizeStatus(firstString(rawOrder, ['status']), paidAt)
  const transactions = Array.isArray(rawOrder.transactions)
    ? rawOrder.transactions.map((item) => normalizeTransaction(item)).filter(Boolean)
    : (paymentInfo && Object.keys(paymentInfo).length
      ? [normalizeTransaction(paymentInfo)]
      : [])

  return {
    orderId: normalizeNumber(firstDefined(rawOrder, ['order_id', 'id', 'orderId']), 0) || null,
    orderNo: firstString(rawOrder, ['order_no', 'orderNo', 'out_trade_no'], firstString(paymentInfo, ['out_trade_no'])),
    productCode: firstString(rawOrder, ['product_code', 'productCode'], metadata.feature_key || 'vip'),
    productName,
    quantity,
    amountTotalFen: totalAmountFen,
    amountPayableFen: payableAmountFen > 0 ? payableAmountFen : totalAmountFen,
    amountPaidFen: paidAmountFen > 0 ? paidAmountFen : (status === 'paid' ? totalAmountFen : 0),
    currency: firstString(rawOrder, ['currency'], firstString(paymentInfo, ['currency'], 'CNY')),
    status,
    rawStatus: firstString(rawOrder, ['status']),
    createdAt: firstString(rawOrder, ['created_at', 'createdAt']),
    updatedAt: firstString(rawOrder, ['updated_at', 'updatedAt']),
    paidAt,
    refundStatus: firstString(rawOrder, ['refund_status', 'refundStatus']),
    vipStatus: firstString(rawOrder, ['vip_status'], firstString(metadata, ['vip_status'])),
    vipExpiresAt: firstString(rawOrder, ['vip_expires_at'], firstString(metadata, ['vip_expires_at'])),
    paymentChannel: firstString(rawOrder, ['payment_channel', 'paymentChannel'], firstString(paymentInfo, ['payment_method', 'provider'], '微信支付')),
    prepayId: firstString(rawOrder, ['prepay_id', 'prepayId']),
    orderPath: firstString(rawOrder, ['order_path', 'orderPath']),
    metadata,
    items: normalizedItems.length ? normalizedItems : buildFallbackOrderItems({
      productName,
      quantity,
      totalAmountFen: totalAmountFen || payableAmountFen
    }),
    transactions,
    source: firstString(rawOrder, ['source'], 'remote')
  }
}

function getOrderIdentity(order = {}) {
  const orderNo = normalizeString(order.orderNo)
  if (orderNo) {
    return `no:${orderNo}`
  }

  const orderId = normalizeString(order.orderId)
  return orderId ? `id:${orderId}` : ''
}

function mergeOrderRecord(primaryOrder = null, fallbackOrder = null) {
  if (!primaryOrder) {
    return fallbackOrder
  }
  if (!fallbackOrder) {
    return primaryOrder
  }

  const mergedOrder = {
    ...fallbackOrder,
    ...primaryOrder,
    items: primaryOrder.items && primaryOrder.items.length ? primaryOrder.items : fallbackOrder.items,
    transactions: primaryOrder.transactions && primaryOrder.transactions.length
      ? primaryOrder.transactions
      : fallbackOrder.transactions
  }

  if (getStatusPriority(fallbackOrder.status) > getStatusPriority(primaryOrder.status)) {
    mergedOrder.status = fallbackOrder.status
    mergedOrder.rawStatus = fallbackOrder.rawStatus || primaryOrder.rawStatus
    mergedOrder.paidAt = fallbackOrder.paidAt || primaryOrder.paidAt
    mergedOrder.amountPaidFen = fallbackOrder.amountPaidFen || primaryOrder.amountPaidFen
    if (fallbackOrder.transactions && fallbackOrder.transactions.length) {
      mergedOrder.transactions = fallbackOrder.transactions
    }
  }

  return mergedOrder
}

function sortOrdersByCreatedAt(orderList = []) {
  return orderList.slice().sort((leftOrder, rightOrder) => {
    const leftTime = Date.parse(leftOrder.createdAt || leftOrder.updatedAt || leftOrder.paidAt || '')
    const rightTime = Date.parse(rightOrder.createdAt || rightOrder.updatedAt || rightOrder.paidAt || '')
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
  })
}

function filterOrdersByStatus(orderList = [], statusFilter = '') {
  const normalizedStatusFilter = normalizeString(statusFilter).toLowerCase()
  if (!normalizedStatusFilter || normalizedStatusFilter === 'all') {
    return orderList
  }

  return orderList.filter((order) => normalizeStatus(order && order.status) === normalizeStatus(normalizedStatusFilter))
}

function buildLocalListResponse(params = {}, fallbackReason = '') {
  const page = Math.max(1, normalizeNumber(params.page, 1))
  const pageSize = Math.max(1, normalizeNumber(params.page_size || params.pageSize, DEFAULT_PAGE_SIZE))
  const allLocalOrders = filterOrdersByStatus(sortOrdersByCreatedAt(readLocalOrderList().map((item) => normalizeOrder(item)).filter(Boolean)), params.status)
  const offset = (page - 1) * pageSize
  const currentPageOrders = allLocalOrders.slice(offset, offset + pageSize)

  return {
    source: 'local',
    fallbackReason,
    total: allLocalOrders.length,
    page,
    page_size: pageSize,
    has_more: offset + pageSize < allLocalOrders.length,
    orders: currentPageOrders
  }
}

function resolveOrderApiPrefixes() {
  if (!cachedOrderApiPrefix) {
    const storedPrefix = normalizeString(getStorageValue(ORDER_API_PREFIX_STORAGE_KEY))
    if (ORDER_API_PREFIXES.includes(storedPrefix)) {
      cachedOrderApiPrefix = storedPrefix
    }
  }

  if (!cachedOrderApiPrefix) {
    return ORDER_API_PREFIXES.slice()
  }

  return [cachedOrderApiPrefix].concat(
    ORDER_API_PREFIXES.filter((prefix) => prefix !== cachedOrderApiPrefix)
  )
}

async function requestOrderApi({
  path = '',
  data = {}
} = {}) {
  const prefixList = resolveOrderApiPrefixes()
  let lastError = null

  for (let index = 0; index < prefixList.length; index += 1) {
    const prefix = prefixList[index]

    try {
      const payload = await request.get(`${prefix}${path}`, data, { timeout: 5000 })
      cachedOrderApiPrefix = prefix
      setStorageValue(ORDER_API_PREFIX_STORAGE_KEY, prefix)
      return payload
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('订单接口暂不可用')
}

function extractRemoteOrderList(payload = {}) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload.orders)) {
    return payload.orders
  }

  if (Array.isArray(payload.items)) {
    return payload.items
  }

  if (payload.data && Array.isArray(payload.data.orders)) {
    return payload.data.orders
  }

  if (payload.data && Array.isArray(payload.data.items)) {
    return payload.data.items
  }

  if (payload.data && Array.isArray(payload.data)) {
    return payload.data
  }

  return []
}

function extractRemoteDetail(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  if (payload.order && typeof payload.order === 'object') {
    return payload.order
  }

  if (payload.data && payload.data.order && typeof payload.data.order === 'object') {
    return payload.data.order
  }

  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data
  }

  return payload
}

function replaceLocalOrder(nextOrder = {}) {
  const normalizedOrder = normalizeOrder({
    ...nextOrder,
    source: nextOrder.source || 'local'
  })

  if (!normalizedOrder || (!normalizedOrder.orderNo && !normalizedOrder.orderId)) {
    return null
  }

  const orderIdentity = getOrderIdentity(normalizedOrder)
  const nextOrderList = sortOrdersByCreatedAt(
    [normalizedOrder].concat(
      readLocalOrderList()
        .map((item) => normalizeOrder(item))
        .filter((item) => item && getOrderIdentity(item) && getOrderIdentity(item) !== orderIdentity)
    )
  )

  writeLocalOrderList(nextOrderList)
  return normalizedOrder
}

function findLocalOrder({ orderId = null, orderNo = '' } = {}) {
  const normalizedOrderNo = normalizeString(orderNo)
  const normalizedOrderId = normalizeString(orderId)

  return readLocalOrderList()
    .map((item) => normalizeOrder(item))
    .find((item) => {
      if (!item) {
        return false
      }

      if (normalizedOrderNo && normalizeString(item.orderNo) === normalizedOrderNo) {
        return true
      }

      if (normalizedOrderId && normalizeString(item.orderId) === normalizedOrderId) {
        return true
      }

      return false
    }) || null
}

class OrderService {
  async listOrders(params = {}) {
    try {
      const remotePayload = await requestOrderApi({
        path: '',
        data: params
      })
      const remoteOrders = extractRemoteOrderList(remotePayload)
        .map((item) => normalizeOrder(item))
        .filter(Boolean)

      if (!remoteOrders.length) {
        return buildLocalListResponse(params)
      }

      const localOrderMap = new Map()
      readLocalOrderList()
        .map((item) => normalizeOrder(item))
        .filter(Boolean)
        .forEach((item) => {
          localOrderMap.set(getOrderIdentity(item), item)
        })

      const mergedOrders = remoteOrders.map((item) => {
        return mergeOrderRecord(item, localOrderMap.get(getOrderIdentity(item)))
      })

      return {
        source: 'remote',
        total: normalizeNumber(firstDefined(remotePayload, ['total']), mergedOrders.length),
        page: Math.max(1, normalizeNumber(firstDefined(remotePayload, ['page']), params.page || 1)),
        page_size: Math.max(1, normalizeNumber(firstDefined(remotePayload, ['page_size', 'pageSize']), params.page_size || params.pageSize || DEFAULT_PAGE_SIZE)),
        has_more: !!firstDefined(remotePayload, ['has_more', 'hasMore']),
        orders: mergedOrders
      }
    } catch (error) {
      return buildLocalListResponse(params, error?.message || '')
    }
  }

  async getOrderDetail(orderId) {
    const normalizedOrderId = normalizeString(orderId)
    if (!normalizedOrderId) {
      return Promise.reject(new Error('缺少订单 ID'))
    }

    try {
      const remotePayload = await requestOrderApi({
        path: `/${encodeURIComponent(normalizedOrderId)}`
      })
      const remoteOrder = normalizeOrder(extractRemoteDetail(remotePayload))
      if (!remoteOrder) {
        throw new Error('未找到订单信息')
      }

      return mergeOrderRecord(remoteOrder, findLocalOrder({ orderId: normalizedOrderId }))
    } catch (error) {
      const localOrder = findLocalOrder({ orderId: normalizedOrderId })
      if (localOrder) {
        return localOrder
      }

      throw error
    }
  }

  async getOrderDetailByNo(orderNo) {
    const normalizedOrderNo = normalizeString(orderNo)
    if (!normalizedOrderNo) {
      return Promise.reject(new Error('缺少订单号'))
    }

    try {
      const remotePayload = await requestOrderApi({
        path: `/by-no/${encodeURIComponent(normalizedOrderNo)}`
      })
      const remoteOrder = normalizeOrder(extractRemoteDetail(remotePayload))
      if (!remoteOrder) {
        throw new Error('未找到订单信息')
      }

      return mergeOrderRecord(remoteOrder, findLocalOrder({ orderNo: normalizedOrderNo }))
    } catch (error) {
      const localOrder = findLocalOrder({ orderNo: normalizedOrderNo })
      if (localOrder) {
        return localOrder
      }

      throw error
    }
  }

  recordPendingOrder(prepayPayload = {}) {
    const normalizedOrder = normalizeOrder({
      ...(safeObject(prepayPayload.order)),
      payment: safeObject(prepayPayload.payment),
      source: 'local'
    })

    if (!normalizedOrder) {
      return null
    }

    normalizedOrder.status = normalizeStatus(normalizedOrder.status || 'pending')
    return replaceLocalOrder(normalizedOrder)
  }

  markOrderPaid(prepayPayload = {}) {
    const normalizedPayloadOrder = normalizeOrder({
      ...(safeObject(prepayPayload.order)),
      payment: safeObject(prepayPayload.payment),
      source: 'local'
    })
    const localOrder = findLocalOrder({
      orderId: normalizedPayloadOrder?.orderId,
      orderNo: normalizedPayloadOrder?.orderNo
    })

    const nextOrder = {
      ...(localOrder || normalizedPayloadOrder || {}),
      status: 'paid',
      rawStatus: 'paid',
      paidAt: (localOrder && localOrder.paidAt) || normalizedPayloadOrder?.paidAt || new Date().toISOString(),
      amountPaidFen: normalizePayloadOrderAmountPaid(localOrder, normalizedPayloadOrder),
      source: 'local'
    }

    return replaceLocalOrder(nextOrder)
  }
}

function normalizePayloadOrderAmountPaid(localOrder = null, payloadOrder = null) {
  const localAmount = normalizeNumber(localOrder && localOrder.amountPaidFen, 0)
  if (localAmount > 0) {
    return localAmount
  }

  const payloadAmount = normalizeNumber(payloadOrder && payloadOrder.amountPaidFen, 0)
  if (payloadAmount > 0) {
    return payloadAmount
  }

  return normalizeNumber(
    payloadOrder && (payloadOrder.amountTotalFen || payloadOrder.amountPayableFen),
    normalizeNumber(localOrder && (localOrder.amountTotalFen || localOrder.amountPayableFen), 0)
  )
}

module.exports = new OrderService()
