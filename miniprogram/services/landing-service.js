const request = require('../utils/request')

function normalizeSourceCode(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeSceneValue(context = {}) {
  const serialNumber = String(context.serialNumber || '').trim()
  const scene = String(context.scene || '').trim()

  return serialNumber || scene
}

function normalizeLandingConfigPayload(data, normalizedSourceCode) {
  if (!data || typeof data !== 'object') {
    return null
  }

  return {
    sourceCode: normalizeSourceCode(
      data.sourceCode
        || data.source_code
        || data.s
        || normalizedSourceCode
    ),
    redirectUrl: data.redirectUrl || data.redirect_url || data.targetPageUrl || data.target_page_url || '',
    action: data.action || 'redirect',
    enabled: data.enabled !== false,
    description: data.description || data.summary || ''
  }
}

class LandingService {
  async getRedirectConfig(sourceCode, context = {}) {
    const normalizedSourceCode = normalizeSourceCode(sourceCode)
    const normalizedSceneValue = normalizeSceneValue(context)

    if (!normalizedSourceCode || !normalizedSceneValue) {
      return null
    }

    try {
      const data = await request.get(`/client/landing-pages/config/${encodeURIComponent(normalizedSourceCode)}`, {
        s: normalizedSourceCode,
        scene: normalizedSceneValue
      })
      return normalizeLandingConfigPayload(data, normalizedSourceCode)
    } catch (error) {
      console.warn('landing config request failed:', normalizedSourceCode, error?.message || error)
      return null
    }
  }
}

module.exports = new LandingService()
