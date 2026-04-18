const request = require('../utils/request')

function normalizeSourceCode(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeSceneValue(context = {}) {
  const serialNumber = String(context.serialNumber || '').trim()
  const scene = String(context.scene || '').trim()

  return serialNumber || scene
}

class LandingService {
  async getRedirectConfig(sourceCode, context = {}) {
    const normalizedSourceCode = normalizeSourceCode(sourceCode)
    const normalizedSceneValue = normalizeSceneValue(context)

    if (!normalizedSourceCode || !normalizedSceneValue) {
      return null
    }

    try {
      const data = await request.get(`/flashcard/landing/config/${encodeURIComponent(normalizedSourceCode)}`, {
        s: normalizedSourceCode,
        scene: normalizedSceneValue
      })

      if (!data || typeof data !== 'object') {
        return null
      }

      return {
        sourceCode: normalizeSourceCode(data.sourceCode || normalizedSourceCode),
        redirectUrl: data.redirectUrl || '',
        action: data.action || 'redirect',
        enabled: data.enabled !== false,
        description: data.description || ''
      }
    } catch (error) {
      console.warn('landing config request failed:', normalizedSourceCode, error?.message || error)
      return null
    }
  }
}

module.exports = new LandingService()
