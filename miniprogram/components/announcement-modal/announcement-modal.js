const {
  buildImagePaddingTop
} = require('../../utils/announcement-utils')

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeBlockLink(link = {}) {
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

function buildImageMode(block = {}) {
  const fit = normalizeText(block.fit || block.image_fit || 'cover').toLowerCase()
  return fit === 'contain' ? 'aspectFit' : 'aspectFill'
}

function buildRenderBlock(block = {}, index = 0) {
  const type = normalizeText(block.type).toLowerCase()
  const link = normalizeBlockLink(block.link)

  if (type === 'image') {
    const imageUrl = normalizeText(block.url || block.src || block.image_url)
    if (!imageUrl) {
      return null
    }

    return {
      id: normalizeText(block.id) || `announcement_block_${index}`,
      type,
      imageUrl,
      imageMode: buildImageMode(block),
      imagePaddingTop: buildImagePaddingTop(block.aspect_ratio || block.aspectRatio),
      tappable: link.type !== 'none',
      link,
      rawBlock: block
    }
  }

  if (type === 'heading' || type === 'paragraph' || type === 'button') {
    const text = normalizeText(block.text || block.title || block.label)
    if (!text) {
      return null
    }

    return {
      id: normalizeText(block.id) || `announcement_block_${index}`,
      type,
      text,
      tappable: link.type !== 'none',
      link,
      rawBlock: block
    }
  }

  return null
}

function buildRenderBlocks(blocks = []) {
  if (!Array.isArray(blocks)) {
    return []
  }

  return blocks
    .map((block, index) => buildRenderBlock(block, index))
    .filter(Boolean)
}

Component({
  options: {
    virtualHost: true
  },

  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    announcement: {
      type: Object,
      value: {}
    },
    blocks: {
      type: Array,
      value: []
    }
  },

  data: {
    renderBlocks: []
  },

  observers: {
    blocks(blocks) {
      this.setData({
        renderBlocks: buildRenderBlocks(blocks)
      })
    }
  },

  methods: {
    noop() {},

    onCloseTap() {
      this.triggerEvent('close')
    },

    onBlockTap(event) {
      const blockIndex = Number(event?.currentTarget?.dataset?.blockIndex)
      const block = this.data.renderBlocks[blockIndex] || null

      if (!block || !block.tappable) {
        return
      }

      this.triggerEvent('linktap', {
        block: block.rawBlock || null,
        link: block.link
      })
    }
  }
})
