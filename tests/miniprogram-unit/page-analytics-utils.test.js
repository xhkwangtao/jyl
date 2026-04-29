const assert = require('node:assert/strict')

if (process.env.PAGE_ANALYTICS_UTILS_TEST_FORCE_LOAD_FAILURE === '1') {
  throw new Error('forced page analytics utils load failure')
}

const {
  getPageAnalyticsMeta
} = require('../../miniprogram/config/page-analytics-pages')
const {
  buildAnonymousId,
  buildPageAnalyticsPayload,
  buildReferrerFromPageStack,
  serializeQuery
} = require('../../miniprogram/utils/page-analytics-utils')

const tests = []

function test(name, run) {
  tests.push({ name, run })
}

test('getPageAnalyticsMeta returns the configured homepage title', () => {
  const meta = getPageAnalyticsMeta('/pages/index/index')
  assert.equal(meta.pageTitle, '首页')
})

test('getPageAnalyticsMeta builds map extra from allowed fields only', () => {
  const meta = getPageAnalyticsMeta('/subpackages/guide/pages/map/map')

  assert.deepEqual(
    meta.buildExtra({
      poiId: '12',
      filter: 'culture',
      action: 'navigate',
      ignored: 'skip-me'
    }, {}),
    {
      poiId: '12',
      filter: 'culture',
      action: 'navigate'
    }
  )
})

test('serializeQuery sorts keys and URL-encodes values', () => {
  assert.equal(
    serializeQuery({
      feature: 'vip',
      keyword: '五一 推荐'
    }),
    'feature=vip&keyword=%E4%BA%94%E4%B8%80%20%E6%8E%A8%E8%8D%90'
  )
})

test('buildReferrerFromPageStack uses the previous page route and options', () => {
  const referrer = buildReferrerFromPageStack([
    {
      route: 'pages/index/index',
      options: {
        s: 'hb1'
      }
    },
    {
      route: 'subpackages/guide/pages/map/map',
      options: {
        poiId: '12'
      }
    }
  ])

  assert.equal(referrer, '/pages/index/index?s=hb1')
})

test('buildPageAnalyticsPayload normalizes strings and omits empty extra', () => {
  assert.deepEqual(
    buildPageAnalyticsPayload({
      pageMeta: {
        pagePath: '/pages/index/index',
        pageTitle: '首页'
      },
      anonymousId: 'anon_fixed',
      scene: '1001',
      source: 'launch',
      referrer: '',
      systemInfo: {
        platform: 'ios',
        version: '8.0.50',
        model: 'iPhone 15 Pro'
      },
      networkType: 'wifi',
      extra: {}
    }),
    {
      page_path: '/pages/index/index',
      page_title: '首页',
      scene: '1001',
      source: 'launch',
      referrer: null,
      anonymous_id: 'anon_fixed',
      platform: 'ios',
      wechat_version: '8.0.50',
      device_model: 'iPhone 15 Pro',
      network_type: 'wifi',
      extra: null
    }
  )
})

test('buildAnonymousId returns a non-empty stable-looking prefix', () => {
  const anonymousId = buildAnonymousId()

  assert.equal(anonymousId.startsWith('anon_'), true)
  assert.equal(anonymousId.length > 10, true)
})

module.exports = process.env.PAGE_ANALYTICS_UTILS_TEST_FORCE_INVALID_EXPORT === '1'
  ? { invalid: true }
  : tests
