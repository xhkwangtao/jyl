const { JYL_ROUTE_MARKER_POINTS } = require('../config/jyl-map-data.js')

const CANONICAL_SOURCE_CODE_BY_MARKER_ID = {
  '1': 'jqdm',
  '2': 'jqdmkzcpz',
  '3': 'bdfcklp',
  '4': 'bdqddst',
  '5': 'hygcdt',
  '6': 'dsbdzslxj',
  '7': 'dsbdqdzcrkp',
  '8': 'sqbzgc',
  '9': 'wwdgcjpk',
  '10': 'scpz14',
  '11': 'tqblpdpclc',
  '12': 'mlysslxj',
  '13': 'scpz17',
  '14': 'fclhhdd',
  '15': 'shzfcddygsp',
  '16': 'cswsj',
  '17': 'jzzxj',
  '18': 'ypcwp',
  '19': 'ypnewm',
  '20': 'dplblzdzn',
  '21': 'jyl',
  '22': 'dylsb',
  '23': 'bkq',
  '24': 'xsldycpzx',
  '25': 'xsedkpzx',
  '26': 'mtz'
}

function normalizePoiSourceCode(value = '') {
  return String(value || '').trim().toLowerCase()
}

const POI_SOURCE_CODE_ITEMS = (JYL_ROUTE_MARKER_POINTS || []).map((point) => {
  const markerId = String(point?.markerId || '')
  const pointId = normalizePoiSourceCode(point?.id || '')
  const canonicalSourceCode = normalizePoiSourceCode(
    CANONICAL_SOURCE_CODE_BY_MARKER_ID[markerId] || pointId || markerId
  )
  const aliases = Array.from(new Set([
    canonicalSourceCode,
    pointId,
    normalizePoiSourceCode(point?.key || ''),
    normalizePoiSourceCode(markerId)
  ].filter(Boolean)))

  return {
    markerId,
    pointId,
    canonicalSourceCode,
    name: point?.name || '',
    aliases
  }
})

const POI_SOURCE_CODE_LOOKUP = POI_SOURCE_CODE_ITEMS.reduce((result, item) => {
  item.aliases.forEach((alias) => {
    result[alias] = item
  })
  return result
}, {})

function resolvePoiSourceCodeItem(value = '') {
  return POI_SOURCE_CODE_LOOKUP[normalizePoiSourceCode(value)] || null
}

function resolvePoiSourceCodeToMarkerId(value = '') {
  return resolvePoiSourceCodeItem(value)?.markerId || ''
}

function resolvePoiSourceCodeToCanonical(value = '') {
  return resolvePoiSourceCodeItem(value)?.canonicalSourceCode || ''
}

module.exports = {
  POI_SOURCE_CODE_ITEMS,
  normalizePoiSourceCode,
  resolvePoiSourceCodeItem,
  resolvePoiSourceCodeToMarkerId,
  resolvePoiSourceCodeToCanonical
}
