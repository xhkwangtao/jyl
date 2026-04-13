const {
  JYL_MARKER_POINTS
} = require('../config/jyl-map-data')
const {
  getCheckinRecords
} = require('./checkin')

const SECRET_FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '已收集', value: 'checked' },
  { label: '未收集', value: 'unchecked' }
]

function formatSecretIndex(index) {
  return String(index + 1).padStart(2, '0')
}

function formatSecretCode(index) {
  return `暗号 ${formatSecretIndex(index)}`
}

function formatPatternLabel(index) {
  return `图案 ${formatSecretIndex(index)}`
}

function formatSequenceText(point, index) {
  return point.sequenceText || `第 ${formatSecretIndex(index)} 站`
}

function formatCollectedTime(timestamp) {
  const safeTimestamp = Number(timestamp)

  if (!Number.isFinite(safeTimestamp) || safeTimestamp <= 0) {
    return '到达景点后扫码解锁'
  }

  const date = new Date(safeTimestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `收集于 ${month}-${day} ${hours}:${minutes}`
}

function normalizeMatchToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function buildSecretItem(point, index, records = {}) {
  const collectedAt = records[String(point.id)] || null
  const collected = Boolean(collectedAt)

  return {
    id: point.id,
    key: point.key,
    name: point.name,
    description: point.description,
    shortHint: point.shortHint || point.description || '等待现场解锁',
    sequenceText: formatSequenceText(point, index),
    themeTag: point.themeTag || '暗号点',
    themeTone: point.themeTone || 'teal',
    secretIndexText: formatSecretIndex(index),
    secretCode: formatSecretCode(index),
    patternLabel: formatPatternLabel(index),
    collected,
    collectedAt,
    statusText: collected ? '已收集' : '未收集',
    actionText: collected ? '取消收集' : '标记已收集',
    timeText: formatCollectedTime(collectedAt),
    collectionHint: collected
      ? `${formatPatternLabel(index)} 已收入你的研学档案`
      : `前往 ${point.name} 扫码后可解锁 ${formatPatternLabel(index)}`
  }
}

function buildSecretList(records = getCheckinRecords()) {
  return JYL_MARKER_POINTS.map((point, index) => buildSecretItem(point, index, records))
}

function buildHeroCopy(totalCount, collectedCount, pendingList) {
  if (collectedCount <= 0) {
    return {
      heroTitle: `开始收集 ${totalCount} 枚研学暗号`,
      heroDesc: '学生到达指定景点后扫描二维码，收齐全部暗号图案即可解锁本次研学报告。'
    }
  }

  if (collectedCount >= totalCount) {
    return {
      heroTitle: '全部暗号图案已收齐',
      heroDesc: '当前设备上的暗号收集任务已经完成，研学报告已进入可解锁状态。'
    }
  }

  const nextPending = pendingList[0]

  return {
    heroTitle: `已收集 ${collectedCount} / ${totalCount} 枚暗号`,
    heroDesc: nextPending
      ? `还差 ${totalCount - collectedCount} 枚暗号可解锁研学报告，下一处可前往 ${nextPending.name}。`
      : `还差 ${totalCount - collectedCount} 枚暗号可解锁研学报告。`
  }
}

function buildReportCopy(totalCount, collectedCount) {
  const remainingCount = Math.max(totalCount - collectedCount, 0)
  const reportUnlocked = totalCount > 0 && remainingCount === 0

  if (reportUnlocked) {
    return {
      reportUnlocked,
      reportStatusText: '已解锁',
      reportTitle: '研学报告已解锁',
      reportDesc: '全部暗号图案都已收齐，可以进入下一步查看或生成本次研学报告。',
      reportActionText: '查看研学报告'
    }
  }

  return {
    reportUnlocked,
    reportStatusText: '待解锁',
    reportTitle: `距离研学报告还差 ${remainingCount} 枚暗号`,
    reportDesc: '继续在景点现场扫描二维码，只有收齐全部暗号图案后才会解锁研学报告。',
    reportActionText: '去收集暗号'
  }
}

function buildSecretCollectionState(records = getCheckinRecords()) {
  const secretList = buildSecretList(records)
  const collectedSecretList = secretList.filter((item) => item.collected)
  const pendingSecretList = secretList.filter((item) => !item.collected)
  const totalCount = secretList.length
  const collectedCount = collectedSecretList.length
  const pendingCount = pendingSecretList.length
  const progressPercent = totalCount ? Math.round((collectedCount / totalCount) * 100) : 0

  return {
    ...buildHeroCopy(totalCount, collectedCount, pendingSecretList),
    ...buildReportCopy(totalCount, collectedCount),
    secretList,
    collectedSecretList,
    pendingSecretList,
    totalCount,
    collectedCount,
    pendingCount,
    progressPercent,
    progressPercentText: `${progressPercent}%`
  }
}

function filterSecretList(secretList, filterValue) {
  if (filterValue === 'checked') {
    return secretList.filter((item) => item.collected)
  }

  if (filterValue === 'unchecked') {
    return secretList.filter((item) => !item.collected)
  }

  return secretList
}

function buildScanTokens(rawValue) {
  const tokenSet = new Set()

  function appendToken(value) {
    const normalizedToken = normalizeMatchToken(value)

    if (normalizedToken) {
      tokenSet.add(normalizedToken)
    }
  }

  const text = String(rawValue || '').trim()

  if (!text) {
    return []
  }

  appendToken(text)

  try {
    appendToken(decodeURIComponent(text))
  } catch (error) {}

  ;[text].forEach((value) => {
    value.split(/[\s?&#=/:,;|]+/).forEach((segment) => {
      appendToken(segment)
    })

    try {
      const url = new URL(value)

      appendToken(url.pathname)
      url.pathname.split('/').forEach((segment) => {
        appendToken(segment)
      })

      url.searchParams.forEach((paramValue, paramKey) => {
        appendToken(paramKey)
        appendToken(paramValue)
      })
    } catch (error) {}
  })

  return Array.from(tokenSet)
}

function buildPointMatchTokens(point, index) {
  return [
    point.id,
    point.key,
    point.name,
    point.sourceName,
    formatSecretCode(index),
    formatPatternLabel(index),
    formatSecretIndex(index),
    `secret${formatSecretIndex(index)}`,
    `pattern${formatSecretIndex(index)}`
  ]
    .map((value) => normalizeMatchToken(value))
    .filter(Boolean)
}

function resolveSecretPointFromScanResult(scanResult, records = getCheckinRecords()) {
  const rawText = String(scanResult || '').trim()
  const scanTokens = buildScanTokens(rawText)
  const normalizedRawText = normalizeMatchToken(rawText)

  if (!scanTokens.length && !normalizedRawText) {
    return null
  }

  for (let index = 0; index < JYL_MARKER_POINTS.length; index += 1) {
    const point = JYL_MARKER_POINTS[index]
    const matchTokens = buildPointMatchTokens(point, index)
    const matched = matchTokens.some((token) => {
      return scanTokens.includes(token) || (token.length >= 4 && normalizedRawText.includes(token))
    })

    if (matched) {
      return buildSecretItem(point, index, records)
    }
  }

  return null
}

module.exports = {
  SECRET_FILTER_OPTIONS,
  buildSecretList,
  buildSecretCollectionState,
  filterSecretList,
  resolveSecretPointFromScanResult
}
