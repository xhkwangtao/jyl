const BADGE_IMAGE_FALLBACKS = [
  '/images/badges/arc-emerald.svg',
  '/images/badges/arc-blue.svg',
  '/images/badges/arc-cyan.svg',
  '/images/badges/arc-green.svg',
  '/images/badges/arc-light-pink.svg',
  '/images/badges/arc-orange.svg',
  '/images/badges/arc-purple.svg',
  '/images/badges/arc-red.svg',
  '/images/badges/arc-yellow.svg',
  '/images/badges/olive-branch.svg'
]

function buildDefaultBadges() {
  return BADGE_IMAGE_FALLBACKS.map((image, index) => ({
    id: `default-badge-${index + 1}`,
    name: `徽章 ${index + 1}`,
    image,
    description: index < 4 ? 'AI 视觉展示' : '待解锁',
    unlocked: index < 4
  }))
}

function normalizeBadge(sourceBadge, fallbackBadge, index) {
  const badge = sourceBadge || {}

  return {
    id: badge.id || fallbackBadge.id || `badge-${index + 1}`,
    name: badge.name || fallbackBadge.name || `徽章 ${index + 1}`,
    image: badge.image || fallbackBadge.image || '/images/badges/badge-placeholder.svg',
    description: typeof badge.description === 'string' ? badge.description : fallbackBadge.description,
    unlocked: typeof badge.unlocked === 'boolean' ? badge.unlocked : fallbackBadge.unlocked
  }
}

Component({
  properties: {
    badges: {
      type: Array,
      value: []
    }
  },

  data: {
    displayBadges: buildDefaultBadges()
  },

  lifetimes: {
    attached() {
      this.syncBadges(this.properties.badges)
    }
  },

  observers: {
    badges(newBadges) {
      this.syncBadges(newBadges)
    }
  },

  methods: {
    syncBadges(badges) {
      const defaults = buildDefaultBadges()
      const source = Array.isArray(badges) ? badges.slice(0, 10) : []
      const displayBadges = defaults.map((fallbackBadge, index) => normalizeBadge(source[index], fallbackBadge, index))

      this.setData({
        displayBadges
      })
    },

    onBadgeTap(event) {
      const index = Number(event.currentTarget.dataset.index)
      const badge = this.data.displayBadges[index]

      this.triggerEvent('badgeTap', {
        index,
        badge
      })
    },

    onImageError(event) {
      const index = Number(event.currentTarget.dataset.index)
      const updateKey = `displayBadges[${index}].image`

      this.setData({
        [updateKey]: '/images/badges/badge-placeholder.svg'
      })
    }
  }
})
