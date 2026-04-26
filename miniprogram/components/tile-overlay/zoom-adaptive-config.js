const ZOOM_ADAPTIVE_CONFIG = {
  16: {
    bufferRatio: 0.18,
    maxTiles: 72
  },
  17: {
    bufferRatio: 0.2,
    maxTiles: 84
  },
  18: {
    bufferRatio: 0.22,
    maxTiles: 96
  },
  19: {
    bufferRatio: 0.24,
    maxTiles: 110
  }
}

function getZoomConfig(zoom) {
  const normalizedZoom = Math.max(16, Math.min(19, Math.round(Number(zoom) || 16)))
  return ZOOM_ADAPTIVE_CONFIG[normalizedZoom] || ZOOM_ADAPTIVE_CONFIG[16]
}

module.exports = {
  getZoomConfig
}
