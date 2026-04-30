const assert = require('node:assert/strict')

if (process.env.ORDER_CENTER_ACCESS_TEST_FORCE_LOAD_FAILURE === '1') {
  throw new Error('forced order center access utils load failure')
}

const {
  buildOrderCenterAccessState,
  resolveOrderCenterAccessState,
  ORDER_CENTER_BLOCKED_MESSAGE
} = require('../../miniprogram/utils/order-center-access')

const tests = []

function test(name, run) {
  tests.push({ name, run })
}

test('buildOrderCenterAccessState enables order center when greatwall is true', () => {
  assert.deepEqual(
    buildOrderCenterAccessState({
      greatwall: true
    }),
    {
      enabled: true,
      showEntry: true,
      allowPageAccess: true,
      blockedMessage: ''
    }
  )
})

test('buildOrderCenterAccessState hides and blocks order center when greatwall is not true', () => {
  assert.deepEqual(
    buildOrderCenterAccessState({
      greatwall: false
    }),
    {
      enabled: false,
      showEntry: false,
      allowPageAccess: false,
      blockedMessage: ORDER_CENTER_BLOCKED_MESSAGE
    }
  )

  assert.equal(buildOrderCenterAccessState(null).allowPageAccess, false)
  assert.equal(buildOrderCenterAccessState({ greatwall: 1 }).showEntry, false)
  assert.equal(buildOrderCenterAccessState(true).enabled, true)
})

test('resolveOrderCenterAccessState forces a config refresh before deciding access', async () => {
  let receivedOptions = null

  const accessState = await resolveOrderCenterAccessState({
    getConfig: async (options = {}) => {
      receivedOptions = options
      return {
        greatwall: false
      }
    }
  })

  assert.deepEqual(receivedOptions, {
    forceRefresh: true
  })
  assert.equal(accessState.allowPageAccess, false)
  assert.equal(accessState.blockedMessage, ORDER_CENTER_BLOCKED_MESSAGE)
})

module.exports = process.env.ORDER_CENTER_ACCESS_TEST_FORCE_INVALID_EXPORT === '1'
  ? { invalid: true }
  : tests
