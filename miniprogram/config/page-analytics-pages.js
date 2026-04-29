function normalizeString(value = '') {
  return String(value === undefined || value === null ? '' : value).trim()
}

function pickValue(value = '') {
  return normalizeString(value)
}

function buildObjectWithoutEmptyValues(source = {}) {
  const result = {}

  Object.keys(source || {}).forEach((key) => {
    const normalizedKey = pickValue(key)
    const normalizedValue = pickValue(source[key])

    if (!normalizedKey || !normalizedValue) {
      return
    }

    result[normalizedKey] = normalizedValue
  })

  return result
}

const PAGE_ANALYTICS_META_MAP = {
  '/pages/index/index': {
    pageTitle: '首页'
  },
  '/pages/landing/index': {
    pageTitle: '扫码承接页'
  },
  '/pages/my-page/my-page': {
    pageTitle: '我的'
  },
  '/pages/order-center/index': {
    pageTitle: '订单中心'
  },
  '/pages/order-center/detail': {
    pageTitle: '订单详情',
    buildExtra: (options = {}, context = {}) => buildObjectWithoutEmptyValues({
      orderNo: context.pageInstance?.data?.orderNo || options.orderNo
    })
  },
  '/pages/study-report/study-report': {
    pageTitle: '研学报告'
  },
  '/pages/check-in/check-in': {
    pageTitle: '守城认证中心'
  },
  '/pages/staff-study-report/staff-study-report': {
    pageTitle: '员工研学报告'
  },
  '/subpackages/guide/pages/map/map': {
    pageTitle: '地图',
    buildExtra: (options = {}) => buildObjectWithoutEmptyValues({
      poiId: options.poiId || options.poi,
      filter: options.filter,
      action: options.action
    })
  },
  '/subpackages/guide/pages/ai-chat/ai-chat': {
    pageTitle: 'AI聊天'
  },
  '/subpackages/guide/pages/scenic-audio-list/scenic-audio-list': {
    pageTitle: '景点讲解'
  },
  '/subpackages/guide/pages/payment/subscribe/subscribe': {
    pageTitle: '购买页',
    buildExtra: (options = {}, context = {}) => buildObjectWithoutEmptyValues({
      featureKey: context.pageInstance?.data?.featureKey || options.feature
    })
  }
}

function getPageAnalyticsMeta(pagePath = '') {
  const normalizedPagePath = pickValue(pagePath)
  const pageMeta = PAGE_ANALYTICS_META_MAP[normalizedPagePath]

  if (!pageMeta) {
    return {
      pagePath: normalizedPagePath,
      pageTitle: normalizedPagePath,
      buildExtra: () => ({})
    }
  }

  return {
    pagePath: normalizedPagePath,
    pageTitle: pageMeta.pageTitle,
    buildExtra: typeof pageMeta.buildExtra === 'function'
      ? pageMeta.buildExtra
      : () => ({})
  }
}

module.exports = {
  PAGE_ANALYTICS_META_MAP,
  getPageAnalyticsMeta
}
