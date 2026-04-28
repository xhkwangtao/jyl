const DEFAULT_REPORT_TITLE = '九眼楼长城守城人'
const DEFAULT_REPORT_SUBTITLE = 'AI研学报告'

function normalizeTextValue(value = '') {
  return String(value === undefined || value === null ? '' : value).trim()
}

function normalizeCount(value, fallbackValue = 0, maxValue = Number.POSITIVE_INFINITY) {
  const fallbackNumber = Number.isFinite(Number(fallbackValue))
    ? Math.max(Math.floor(Number(fallbackValue)), 0)
    : 0
  const maxNumber = Number.isFinite(Number(maxValue))
    ? Math.max(Math.floor(Number(maxValue)), 0)
    : Number.POSITIVE_INFINITY
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return Math.min(fallbackNumber, maxNumber)
  }

  return Math.min(Math.max(Math.floor(numericValue), 0), maxNumber)
}

function formatStudyDateText(value = '') {
  const rawText = normalizeTextValue(value)
  if (!rawText) {
    return '未填写'
  }

  const date = new Date(rawText)
  if (Number.isNaN(date.getTime())) {
    return rawText
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDurationText(value) {
  const durationMinutes = Number(value)

  if (!Number.isFinite(durationMinutes) || durationMinutes < 0) {
    return '未填写'
  }

  if (durationMinutes === 0) {
    return '0分钟'
  }

  if (durationMinutes < 60) {
    return `${Math.floor(durationMinutes)}分钟`
  }

  const hours = Math.floor(durationMinutes / 60)
  const minutes = Math.floor(durationMinutes % 60)

  if (!minutes) {
    return `${hours}小时`
  }

  return `${hours}小时${minutes}分钟`
}

function buildParagraphList(value = '') {
  return normalizeTextValue(value)
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildMetricText(label, value) {
  const normalizedLabel = normalizeTextValue(label)
  const normalizedValue = normalizeTextValue(value)

  if (!normalizedLabel || !normalizedValue) {
    return ''
  }

  return `${normalizedLabel}：${normalizedValue}`
}

function buildSection({
  key,
  title,
  metrics = [],
  paragraphs = [],
  highlightLines = [],
  centered = false
} = {}) {
  return {
    key: normalizeTextValue(key),
    title: normalizeTextValue(title),
    centered: !!centered,
    metrics: Array.isArray(metrics) ? metrics.map((item) => normalizeTextValue(item)).filter(Boolean) : [],
    paragraphs: Array.isArray(paragraphs) ? paragraphs.map((item) => normalizeTextValue(item)).filter(Boolean) : [],
    highlightLines: Array.isArray(highlightLines) ? highlightLines.map((item) => normalizeTextValue(item)).filter(Boolean) : []
  }
}

function buildEmptyLatestStudyReportRenderCache() {
  return {
    cachedAt: 0,
    recordId: 0,
    hasContent: false,
    title: '',
    subtitle: DEFAULT_REPORT_SUBTITLE,
    metaList: [],
    sectionList: [],
    studentName: '',
    studentCode: ''
  }
}

function buildLatestStudyReportRenderCachePayload(payload = {}) {
  const normalizedPayload = payload && typeof payload === 'object' ? payload : {}
  const reportPayload = normalizedPayload.report && typeof normalizedPayload.report === 'object'
    ? normalizedPayload.report
    : normalizedPayload && typeof normalizedPayload === 'object' && normalizedPayload.heading
      ? normalizedPayload
      : null

  if (!reportPayload) {
    return buildEmptyLatestStudyReportRenderCache()
  }

  const hiddenSymbolSummary = reportPayload.hidden_symbol_summary && typeof reportPayload.hidden_symbol_summary === 'object'
    ? reportPayload.hidden_symbol_summary
    : {}
  const questionSummary = reportPayload.question_summary && typeof reportPayload.question_summary === 'object'
    ? reportPayload.question_summary
    : {}
  const title = normalizeTextValue(reportPayload.heading) || DEFAULT_REPORT_TITLE
  const studentName = normalizeTextValue(reportPayload.student_name) || '未填写'
  const studentCode = normalizeTextValue(reportPayload.student_code) || '未填写'
  const studyDateText = formatStudyDateText(reportPayload.study_date)
  const durationText = formatDurationText(reportPayload.duration_minutes)
  const hiddenAccuracyPercent = normalizeCount(hiddenSymbolSummary.accuracy_percent, 0, 100)
  const overallAccuracyPercent = normalizeCount(
    reportPayload.overall_accuracy_percent,
    questionSummary.accuracy_percent,
    100
  )
  const overallCommentText = normalizeTextValue(reportPayload.overall_comment)
  const cipherAnalysisText = normalizeTextValue(reportPayload.cipher_analysis)
  const poemAnalysisText = normalizeTextValue(reportPayload.poem_analysis)
  const finalCommentText = normalizeTextValue(reportPayload.final_comment || reportPayload.overall_comment)
  const badgeTitle = normalizeTextValue(reportPayload.badge_title) || '长城守城人'
  const badgeDescription = normalizeTextValue(reportPayload.badge_description)
    || '恭喜你完成本次九眼楼研学任务，已经获得专属的长城探索称号。'
  const sectionList = [
    buildSection({
      key: 'overall',
      title: '总评：',
      paragraphs: [
        overallCommentText,
        buildMetricText('正确率', `${overallAccuracyPercent}%`),
        overallCommentText ? `AI点评：${overallCommentText}` : ''
      ]
    }),
    buildSection({
      key: 'cipher',
      title: '暗号解读',
      paragraphs: [
        buildMetricText('正确率', `${hiddenAccuracyPercent}%`),
        cipherAnalysisText ? `AI点评：${cipherAnalysisText}` : ''
      ]
    }),
    buildSection({
      key: 'poem',
      title: '诗词解读',
      paragraphs: buildParagraphList(poemAnalysisText)
    }),
    buildSection({
      key: 'badge',
      title: '',
      centered: true,
      paragraphs: buildParagraphList(badgeDescription),
      highlightLines: [
        `现授予你：${badgeTitle}`
      ]
    }),
    buildSection({
      key: 'final',
      title: 'AI综合评语',
      paragraphs: buildParagraphList(finalCommentText)
    })
  ].filter((section) => section.paragraphs.length || section.highlightLines.length)

  return {
    cachedAt: Date.now(),
    recordId: normalizeCount(normalizedPayload.record_id || normalizedPayload.recordId, 0),
    hasContent: true,
    title,
    subtitle: DEFAULT_REPORT_SUBTITLE,
    metaList: [
      { label: '姓名', value: studentName },
      { label: '编号', value: studentCode },
      { label: '研学时间', value: studyDateText },
      { label: '探索用时', value: durationText }
    ],
    sectionList,
    studentName,
    studentCode
  }
}

function normalizeLatestStudyReportRenderCache(cachePayload = null) {
  if (!cachePayload || typeof cachePayload !== 'object') {
    return buildEmptyLatestStudyReportRenderCache()
  }

  return {
    cachedAt: Number(cachePayload.cachedAt) || 0,
    recordId: normalizeCount(cachePayload.recordId, 0),
    hasContent: cachePayload.hasContent !== false && !!normalizeTextValue(cachePayload.title),
    title: normalizeTextValue(cachePayload.title),
    subtitle: normalizeTextValue(cachePayload.subtitle) || DEFAULT_REPORT_SUBTITLE,
    metaList: Array.isArray(cachePayload.metaList)
      ? cachePayload.metaList.map((item) => ({
        label: normalizeTextValue(item?.label),
        value: normalizeTextValue(item?.value)
      })).filter((item) => item.label && item.value)
      : [],
    sectionList: Array.isArray(cachePayload.sectionList)
      ? cachePayload.sectionList
        .map((item) => buildSection(item))
        .filter((item) => item.title || item.paragraphs.length || item.highlightLines.length)
      : [],
    studentName: normalizeTextValue(cachePayload.studentName),
    studentCode: normalizeTextValue(cachePayload.studentCode)
  }
}

module.exports = {
  buildLatestStudyReportRenderCachePayload,
  normalizeLatestStudyReportRenderCache
}
