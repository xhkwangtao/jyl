const {
  API_BASE_URL_STORAGE_KEY,
  ONLINE_API_BASE_URL,
  LOCAL_API_BASE_URL
} = require('../utils/api-config')

const STUDY_REPORT_GENERATE_PATH = '/client/study-reports/generate'
const STUDY_REPORT_LATEST_PATH = '/client/study-reports/latest'
const LATEST_STUDY_REPORT_STORAGE_KEY = 'latestStudyReport'

function getStorageValue(key) {
  try {
    return wx.getStorageSync(key)
  } catch (error) {
    return ''
  }
}

function normalizeBaseUrl(url = '') {
  return String(url || '').trim().replace(/\/+$/, '')
}

function resolveBaseUrl() {
  const overrideBaseUrl = normalizeBaseUrl(getStorageValue(API_BASE_URL_STORAGE_KEY))

  if (overrideBaseUrl) {
    return overrideBaseUrl
  }

  const onlineBaseUrl = normalizeBaseUrl(ONLINE_API_BASE_URL)
  return onlineBaseUrl || normalizeBaseUrl(LOCAL_API_BASE_URL)
}

function buildUrl(path = '') {
  if (/^https?:\/\//i.test(String(path || ''))) {
    return path
  }

  return `${resolveBaseUrl()}${path}`
}

function safeParseJson(text = '') {
  try {
    return JSON.parse(text)
  } catch (error) {
    return null
  }
}

function extractErrorMessage(payload, fallbackMessage) {
  if (payload && typeof payload === 'object') {
    return payload.detail || payload.message || payload.error || fallbackMessage
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim()
  }

  return fallbackMessage
}

function buildRequestError(statusCode, payload, fallbackMessage) {
  const error = new Error(extractErrorMessage(payload, fallbackMessage))
  error.statusCode = Number(statusCode) || 0
  error.payload = payload
  return error
}

function normalizeCount(value, fallbackValue = 0, maxValue = Number.POSITIVE_INFINITY) {
  const normalizedFallbackValue = Number.isFinite(Number(fallbackValue))
    ? Math.max(Math.floor(Number(fallbackValue)), 0)
    : 0
  const normalizedMaxValue = Number.isFinite(Number(maxValue))
    ? Math.max(Math.floor(Number(maxValue)), 0)
    : Number.POSITIVE_INFINITY
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return Math.min(normalizedFallbackValue, normalizedMaxValue)
  }

  return Math.min(Math.max(Math.floor(numericValue), 0), normalizedMaxValue)
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => String(item === undefined || item === null ? '' : item).trim())
    .filter(Boolean)
}

function normalizePdfUrl(url = '') {
  const normalizedUrl = String(url || '').trim()
  if (!normalizedUrl) {
    return ''
  }

  return buildUrl(normalizedUrl)
}

function extractPdfDescriptor(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidateUrls = [
    payload.pdf_url,
    payload.pdfUrl,
    payload.report_pdf_url,
    payload.reportPdfUrl,
    payload.file_url,
    payload.fileUrl,
    payload.download_url,
    payload.downloadUrl,
    payload.pdf?.url,
    payload.pdf?.file_url,
    payload.report?.pdf_url,
    payload.report?.pdfUrl,
    payload.report?.file_url
  ].map(normalizePdfUrl).filter(Boolean)

  const base64Value = String(
    payload.pdf_base64
      || payload.pdfBase64
      || payload.pdf?.base64
      || payload.file_base64
      || ''
  ).trim()

  const fileName = String(
    payload.pdf_file_name
      || payload.pdfFileName
      || payload.file_name
      || payload.fileName
      || payload.pdf?.file_name
      || '九眼楼研学报告.pdf'
  ).trim() || '九眼楼研学报告.pdf'

  if (candidateUrls.length) {
    return {
      type: 'url',
      url: candidateUrls[0],
      fileName
    }
  }

  if (base64Value) {
    return {
      type: 'base64',
      base64: base64Value,
      fileName
    }
  }

  return null
}

class StudyReportService {
  extractMatchedCount(payload = {}, options = {}) {
    const normalizedPayload = payload && typeof payload === 'object' ? payload : {}
    const candidateValue = normalizedPayload.report?.hidden_symbol_summary?.matched_count
      ?? normalizedPayload.hidden_symbol_summary?.matched_count
      ?? normalizedPayload.report?.matched_count
      ?? normalizedPayload.matched_count

    return normalizeCount(candidateValue, options.fallbackCount, options.totalCount)
  }

  extractFilledCells(payload = {}) {
    const normalizedPayload = payload && typeof payload === 'object' ? payload : {}
    const candidateList = normalizedPayload.report?.hidden_symbol_summary?.filled_cells
      ?? normalizedPayload.hidden_symbol_summary?.filled_cells
      ?? normalizedPayload.report?.filled_cells
      ?? normalizedPayload.filled_cells

    return normalizeIdList(candidateList)
  }

  persistLatestReport(payload = {}) {
    const normalizedPayload = payload && typeof payload === 'object' ? payload : {}
    const report = normalizedPayload.report && typeof normalizedPayload.report === 'object'
      ? normalizedPayload.report
      : {}

    const cachePayload = {
      payload: normalizedPayload,
      cachedAt: Date.now(),
      recordId: Number(normalizedPayload.record_id || 0) || 0,
      worksheetImageUrl: String(normalizedPayload.worksheet_image_url || '').trim(),
      pdfUrl: normalizePdfUrl(normalizedPayload.pdf_url || normalizedPayload.report?.pdf_url || ''),
      studentName: String(report.student_name || '').trim(),
      studentCode: String(report.student_code || '').trim(),
      studyDate: String(report.study_date || '').trim()
    }

    wx.setStorageSync(LATEST_STUDY_REPORT_STORAGE_KEY, cachePayload)
    return cachePayload
  }

  getLatestReportCache() {
    try {
      return wx.getStorageSync(LATEST_STUDY_REPORT_STORAGE_KEY) || null
    } catch (error) {
      return null
    }
  }

  clearLatestReportCache() {
    try {
      wx.removeStorageSync(LATEST_STUDY_REPORT_STORAGE_KEY)
    } catch (error) {}
  }

  getLatestMatchedCount(options = {}) {
    const cachePayload = this.getLatestReportCache()
    const payload = cachePayload?.payload && typeof cachePayload.payload === 'object'
      ? cachePayload.payload
      : null

    if (!payload) {
      return normalizeCount(options.fallbackCount, options.fallbackCount, options.totalCount)
    }

    return this.extractMatchedCount(payload, options)
  }

  getLatestFilledCells() {
    const cachePayload = this.getLatestReportCache()
    const payload = cachePayload?.payload && typeof cachePayload.payload === 'object'
      ? cachePayload.payload
      : null

    if (!payload) {
      return []
    }

    return this.extractFilledCells(payload)
  }

  async getLatestReport({ token } = {}) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: buildUrl(STUDY_REPORT_LATEST_PATH),
        method: 'GET',
        timeout: 15000,
        header: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        success: (res) => {
          const payload = res.data

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(buildRequestError(payload?.statusCode || res.statusCode, payload, `研学报告查询失败 (${res.statusCode})`))
            return
          }

          const cachePayload = this.persistLatestReport(payload)

          resolve({
            payload,
            cachePayload,
            pdfDescriptor: extractPdfDescriptor(payload || {})
          })
        },
        fail: (error) => {
          reject(new Error(error?.errMsg || '研学报告查询失败'))
        }
      })
    })
  }

  async generateReport({
    token,
    filePath,
    studentName,
    studentCode,
    studyDate,
    durationMinutes,
    scene,
    clientRequestId
  }) {
    return new Promise((resolve, reject) => {
      const uploadUrl = buildUrl(STUDY_REPORT_GENERATE_PATH)
      const uploadFormData = {
        student_name: studentName || '',
        student_code: studentCode || '',
        study_date: studyDate || '',
        duration_minutes: durationMinutes === undefined || durationMinutes === null || durationMinutes === ''
          ? ''
          : String(durationMinutes),
        scene: scene || 'qrcode:study-report',
        client_request_id: clientRequestId || ''
      }

      console.log('[study-report] upload payload', {
        url: uploadUrl,
        fileFieldName: 'worksheet_image',
        filePath,
        hasToken: !!token,
        formData: uploadFormData
      })

      wx.uploadFile({
        url: uploadUrl,
        filePath,
        name: 'worksheet_image',
        timeout: 60000,
        header: {
          Accept: 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        formData: uploadFormData,
        success: (res) => {
          const parsedPayload = safeParseJson(res.data)
          const payload = parsedPayload || res.data

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(buildRequestError(payload?.statusCode || res.statusCode, payload, `研学报告生成失败 (${res.statusCode})`))
            return
          }

          const cachePayload = parsedPayload && typeof parsedPayload === 'object'
            ? this.persistLatestReport(parsedPayload)
            : null

          resolve({
            payload,
            cachePayload,
            pdfDescriptor: extractPdfDescriptor(parsedPayload || {})
          })
        },
        fail: (error) => {
          reject(new Error(error?.errMsg || '研学报告上传失败'))
        }
      })
    })
  }
}

module.exports = new StudyReportService()
