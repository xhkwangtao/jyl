const request = require('../utils/request')
const {
  normalizeAnnouncementBlocks,
  pickHomeModalAnnouncement
} = require('../utils/announcement-utils')

const HOME_ANNOUNCEMENTS_PATH = '/client/announcements/home'

class AnnouncementService {
  async getHomeModalAnnouncement(dismissedFingerprint = '') {
    try {
      const response = await request.get(HOME_ANNOUNCEMENTS_PATH)
      const items = Array.isArray(response?.items) ? response.items : []
      const announcement = pickHomeModalAnnouncement(items, dismissedFingerprint)

      if (!announcement) {
        return null
      }

      return {
        ...announcement,
        normalizedBlocks: normalizeAnnouncementBlocks(announcement)
      }
    } catch (error) {
      console.warn('home announcement request failed:', error?.message || error)
      return null
    }
  }
}

module.exports = new AnnouncementService()
