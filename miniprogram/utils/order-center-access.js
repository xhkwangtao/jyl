const ORDER_CENTER_BLOCKED_MESSAGE = '当前版本暂未开放订单中心'

function normalizeGreatwallValue(config = {}) {
  if (config === true || config === false) {
    return config
  }

  if (!config || typeof config !== 'object') {
    return false
  }

  return config.greatwall === true
}

function buildOrderCenterAccessState(config = {}) {
  const enabled = normalizeGreatwallValue(config)

  return {
    enabled,
    showEntry: enabled,
    allowPageAccess: enabled,
    blockedMessage: enabled ? '' : ORDER_CENTER_BLOCKED_MESSAGE
  }
}

async function resolveOrderCenterAccessState(configService, options = {}) {
  if (!configService || typeof configService.getConfig !== 'function') {
    return buildOrderCenterAccessState()
  }

  const config = await configService.getConfig({
    forceRefresh: options.forceRefresh !== false
  })

  return buildOrderCenterAccessState(config)
}

module.exports = {
  ORDER_CENTER_BLOCKED_MESSAGE,
  buildOrderCenterAccessState,
  resolveOrderCenterAccessState
}
