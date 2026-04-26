const ZOOM_ADAPTIVE_CONFIG = {
  16: {
    bufferRatio: 0.12,
    maxTiles: 16
  },
  17: {
    bufferRatio: 0.14,
    maxTiles: 20
  },
  18: {
    bufferRatio: 0.16,
    maxTiles: 24
  },
  19: {
    bufferRatio: 0.18,
    maxTiles: 24
  }
}

function getZoomConfig(zoom) {
  const normalizedZoom = Math.max(16, Math.min(19, Math.round(Number(zoom) || 16)))
  return ZOOM_ADAPTIVE_CONFIG[normalizedZoom] || ZOOM_ADAPTIVE_CONFIG[16]
}

module.exports = {
  getZoomConfig
}
