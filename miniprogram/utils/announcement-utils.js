function isAbsoluteUrl(url = '') {
  return /^[a-z][a-z\d+\-.]*:\/\//i.test(String(url || '').trim())
}

function buildMiniProgramUrl(url = '', params = {}) {
  const normalizedUrl = String(url || '').trim()
  if (!normalizedUrl || isAbsoluteUrl(normalizedUrl)) {
    return ''
  }

  const query = Object.keys(params || {}).reduce((result, key) => {
    const value = params[key]
    if (value === undefined || value === null || value === '') {
      return result
    }

    result.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    return result
  }, []).join('&')

  return query ? `${normalizedUrl}?${query}` : normalizedUrl
}

function buildImagePaddingTop(aspectRatio = '') {
  const normalizedAspectRatio = String(aspectRatio || '').trim()
  const match = normalizedAspectRatio.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)

  if (!match) {
    return '56.25%'
  }

  const width = Number(match[1])
  const height = Number(match[2])

  if (!width || !height) {
    return '56.25%'
  }

  const percentage = (height / width) * 100
  return `${Number(percentage.toFixed(2))}%`
}

function buildAnnouncementFingerprint(announcement = {}) {
  const hasId = announcement.id !== undefined
    && announcement.id !== null
    && announcement.id !== ''

  if (!hasId) {
    return 'static'
  }

  if (announcement.updated_at !== undefined && announcement.updated_at !== null && announcement.updated_at !== '') {
    return `${announcement.id}:${announcement.updated_at}`
  }

  return `${announcement.id}:static`
}

function parseAnnouncementTime(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const timestamp = Date.parse(String(value))
  return Number.isFinite(timestamp) ? timestamp : Number.NaN
}

function isAnnouncementActiveAt(announcement = {}, now = new Date()) {
  const currentTimestamp = now instanceof Date
    ? now.getTime()
    : Date.parse(String(now))

  if (!Number.isFinite(currentTimestamp)) {
    return false
  }

  const startTimestamp = parseAnnouncementTime(announcement.starts_at)
  if (Number.isNaN(startTimestamp)) {
    return false
  }

  if (Number.isFinite(startTimestamp) && currentTimestamp < startTimestamp) {
    return false
  }

  const endTimestamp = parseAnnouncementTime(announcement.ends_at)
  if (Number.isNaN(endTimestamp)) {
    return false
  }

  if (Number.isFinite(endTimestamp) && currentTimestamp > endTimestamp) {
    return false
  }

  return true
}

function pickHomeModalAnnouncement(announcements = [], dismissedFingerprint = '', now = new Date()) {
  for (const announcement of announcements) {
    if (!announcement || announcement.display_type !== 'modal') {
      continue
    }

    if (!isAnnouncementActiveAt(announcement, now)) {
      continue
    }

    if (buildAnnouncementFingerprint(announcement) === dismissedFingerprint) {
      continue
    }

    return announcement
  }

  return null
}

function normalizeAnnouncementBlocks(announcement = {}) {
  if (Array.isArray(announcement.content_blocks) && announcement.content_blocks.length > 0) {
    return announcement.content_blocks
  }

  return [{
    id: 'fallback_content',
    type: 'paragraph',
    text: announcement.content || '',
    link: {
      type: announcement.link_type || 'none',
      url: announcement.link_url || ''
    }
  }]
}

module.exports = {
  buildAnnouncementFingerprint,
  buildImagePaddingTop,
  buildMiniProgramUrl,
  isAnnouncementActiveAt,
  pickHomeModalAnnouncement,
  normalizeAnnouncementBlocks
}
