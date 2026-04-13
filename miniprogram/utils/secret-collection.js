const {
  JYL_SECRET_POINTS
} = require('../config/jyl-secret-data')
const {
  getCheckinRecords
} = require('./checkin')

const SECRET_ICON_ASSET_BASE = '/images/secret-icons'
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

function formatPointLabel(point, index) {
  return `暗号点 ${formatSecretIndex(index)}`
}

function formatSequenceText(point, index) {
  return point.sequenceText || formatPointLabel(point, index)
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

function buildIconPath(assetKey, variant) {
  return `${SECRET_ICON_ASSET_BASE}/${assetKey}-${variant}.png`
}

function buildSecretItem(point, index, records = {}) {
  const collectedAt = records[String(point.id)] || null
  const collected = Boolean(collectedAt)
  const assetKey = point.assetKey || point.key || `secret-${formatSecretIndex(index)}`
  const secretCode = point.secretCodeName || formatSecretCode(index)
  const iconDarkPath = buildIconPath(assetKey, 'dark')
  const iconGrayPath = buildIconPath(assetKey, 'gray')

  return {
    id: point.id,
    key: point.key,
    name: point.pointName,
    pointName: point.pointName,
    pointShortName: point.pointShortName || point.pointName,
    mapPointId: point.mapPointId || '',
    pdfPointNo: point.pdfPointNo || null,
    description: point.description || '',
    shortHint: point.pointShortName || point.pointName || '等待现场解锁',
    sequenceText: formatSequenceText(point, index),
    pointLabel: formatPointLabel(point, index),
    themeTag: point.themeTag || point.categoryName || '暗号点',
    themeTone: point.themeTone || 'teal',
    secretIndexText: formatSecretIndex(index),
    secretCode,
    secretName: point.secretName || `图案 ${formatSecretIndex(index)}`,
    patternLabel: point.categoryName || `图案 ${formatSecretIndex(index)}`,
    categoryName: point.categoryName || '暗号',
    collected,
    collectedAt,
    statusText: collected ? '已收集' : '未收集',
    actionText: collected ? '取消收集' : '标记已收集',
    timeText: formatCollectedTime(collectedAt),
    iconDarkPath,
    iconGrayPath,
    iconDisplayPath: collected ? iconDarkPath : iconGrayPath,
    navigable: Boolean(point.mapPointId),
    collectionHint: collected
      ? `${secretCode} 已收入你的研学档案`
      : `前往 ${point.pointShortName || point.pointName} 扫码后可解锁 ${secretCode}`
  }
}

function buildSecretList(records = getCheckinRecords()) {
  return JYL_SECRET_POINTS.map((point, index) => buildSecretItem(point, index, records))
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
    reportActionText: `再收集 ${remainingCount} 枚`
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
    themeSummaryList: buildThemeSummaryList(secretList),
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
    point.assetKey,
    point.pointName,
    point.pointShortName,
    point.secretName,
    point.secretCodeName,
    point.mapPointId,
    `secret${formatSecretIndex(index)}`,
    `pdf${String(point.pdfPointNo || '').padStart(2, '0')}`,
    ...(point.scanTokens || [])
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

  for (let index = 0; index < JYL_SECRET_POINTS.length; index += 1) {
    const point = JYL_SECRET_POINTS[index]
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

function buildThemeSummaryList(secretList) {
  const themeOrder = ['工匠暗号', '军防暗号', '生态暗号', '文化暗号']

  return themeOrder.map((themeName) => {
    const itemList = secretList.filter((item) => item.categoryName === themeName)
    const collectedCount = itemList.filter((item) => item.collected).length

    return {
      themeName,
      totalCount: itemList.length,
      collectedCount,
      pendingCount: Math.max(itemList.length - collectedCount, 0)
    }
  }).filter((item) => item.totalCount > 0)
}

module.exports = {
  SECRET_FILTER_OPTIONS,
  buildThemeSummaryList,
  buildSecretList,
  buildSecretCollectionState,
  filterSecretList,
  resolveSecretPointFromScanResult
}
