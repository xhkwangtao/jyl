const { buildMiniProgramUrl } = require('./announcement-utils')

function normalizeText(value = '') {
  return String(value || '').trim()
}

function showUnsupportedToast(title = '暂不支持打开该链接') {
  wx.showToast({
    title,
    icon: 'none',
    duration: 1800
  })
}

function navigateToMiniProgramUrl(url = '') {
  return new Promise((resolve) => {
    wx.navigateTo({
      url,
      success: () => {
        resolve(true)
      },
      fail: () => {
        wx.redirectTo({
          url,
          success: () => {
            resolve(true)
          },
          fail: () => {
            showUnsupportedToast('页面跳转失败')
            resolve(false)
          }
        })
      }
    })
  })
}

function normalizeLinkPayload(link = {}) {
  if (!link || typeof link !== 'object') {
    return {
      type: 'none',
      url: '',
      params: {}
    }
  }

  const normalizedType = normalizeText(link.type || link.link_type || 'none').toLowerCase() || 'none'

  return {
    type: normalizedType === 'url' ? 'webview' : normalizedType,
    url: normalizeText(link.url || link.link_url || ''),
    params: link.params && typeof link.params === 'object' ? link.params : {}
  }
}

async function handleAnnouncementLink(link = {}) {
  const normalizedLink = normalizeLinkPayload(link)

  if (normalizedLink.type === 'none') {
    return false
  }

  if (normalizedLink.type === 'webview') {
    showUnsupportedToast()
    return false
  }

  if (normalizedLink.type !== 'miniprogram') {
    showUnsupportedToast('链接暂不可用')
    return false
  }

  if (!normalizedLink.url.startsWith('/')) {
    showUnsupportedToast('链接暂不可用')
    return false
  }

  const targetUrl = buildMiniProgramUrl(normalizedLink.url, normalizedLink.params)
  if (!targetUrl) {
    showUnsupportedToast('链接暂不可用')
    return false
  }

  return navigateToMiniProgramUrl(targetUrl)
}

module.exports = {
  handleAnnouncementLink
}
