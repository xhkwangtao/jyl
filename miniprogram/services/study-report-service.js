const {
  API_BASE_URL_STORAGE_KEY,
  ONLINE_API_BASE_URL,
  LOCAL_API_BASE_URL
} = require('../utils/api-config')

const STUDY_REPORT_UPLOAD_PATH = '/client/study-reports/upload'
const STUDY_REPORT_GENERATE_PATH = '/client/study-reports/generate'
const STUDY_REPORT_JOB_PATH = '/client/study-reports/jobs'
const STUDY_REPORT_LATEST_PATH = '/client/study-reports/latest'
const LATEST_STUDY_REPORT_STORAGE_KEY = 'latestStudyReport'
const STUDY_REPORT_SCAN_REQUEST_STORAGE_KEY = 'studyReportScanRequestState'
const DEFAULT_STUDY_REPORT_POLL_INTERVAL_MS = 2000
const DEFAULT_STUDY_REPORT_POLL_TIMEOUT_MS = 120000
const DEFAULT_STUDY_REPORT_PDF_FILE_NAME = '研学报告.pdf'

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

function sleep(timeoutMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(Number(timeoutMs) || 0, 0))
  })
}

function normalizePdfUrl(url = '') {
  const normalizedUrl = String(url || '').trim()
  if (!normalizedUrl) {
    return ''
  }

  return buildUrl(normalizedUrl)
}

function normalizeJobStatus(value = '') {
  return String(value || '').trim().toLowerCase()
}

function extractWorksheetImageUrl(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  return String(
    payload.worksheet_image_url
      || payload.worksheetImageUrl
      || payload.data?.worksheet_image_url
      || payload.result?.worksheet_image_url
      || ''
  ).trim()
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
      || DEFAULT_STUDY_REPORT_PDF_FILE_NAME
  ).trim() || DEFAULT_STUDY_REPORT_PDF_FILE_NAME

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

function extractMatchedCountValue(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const candidateValue = payload.report?.hidden_symbol_summary?.matched_count
    ?? payload.hidden_symbol_summary?.matched_count
    ?? payload.report?.matched_count
    ?? payload.matched_count
    ?? payload.hiddenSymbolSummary?.matchedCount
    ?? payload.matchedCount

  const numericValue = Number(candidateValue)
  return Number.isFinite(numericValue) ? Math.max(Math.floor(numericValue), 0) : null
}

function extractFilledCellsValue(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const candidateList = payload.report?.hidden_symbol_summary?.filled_cells
    ?? payload.hidden_symbol_summary?.filled_cells
    ?? payload.report?.filled_cells
    ?? payload.filled_cells
    ?? payload.hiddenSymbolSummary?.filledCells
    ?? payload.filledCells

  return normalizeIdList(candidateList)
}

function buildLatestReportCachePayload(payload = {}) {
  const normalizedPayload = payload && typeof payload === 'object' ? payload : {}

  return {
    cachedAt: Date.now(),
    matchedCount: extractMatchedCountValue(normalizedPayload),
    filledCells: extractFilledCellsValue(normalizedPayload),
    pdfUrl: normalizePdfUrl(
      normalizedPayload.pdf_url
        || normalizedPayload.pdfUrl
        || normalizedPayload.report?.pdf_url
        || normalizedPayload.report?.pdfUrl
        || normalizedPayload.pdf?.url
        || normalizedPayload.file_url
        || ''
    )
  }
}

function normalizeLatestReportCache(cachePayload = null) {
  if (!cachePayload || typeof cachePayload !== 'object') {
    return {
      cachedAt: 0,
      matchedCount: null,
      filledCells: [],
      pdfUrl: ''
    }
  }

  if (cachePayload.payload && typeof cachePayload.payload === 'object') {
    return buildLatestReportCachePayload(cachePayload.payload)
  }

  return {
    cachedAt: Number(cachePayload.cachedAt) || 0,
    matchedCount: extractMatchedCountValue(cachePayload),
    filledCells: extractFilledCellsValue(cachePayload),
    pdfUrl: normalizePdfUrl(cachePayload.pdfUrl || cachePayload.pdf_url || '')
  }
}

class StudyReportService {
  extractMatchedCount(payload = {}, options = {}) {
    const candidateValue = extractMatchedCountValue(payload)

    return normalizeCount(candidateValue, options.fallbackCount, options.totalCount)
  }

  extractFilledCells(payload = {}) {
    return extractFilledCellsValue(payload)
  }

  persistLatestReport(payload = {}) {
    const cachePayload = buildLatestReportCachePayload(payload)

    wx.setStorageSync(LATEST_STUDY_REPORT_STORAGE_KEY, cachePayload)
    return cachePayload
  }

  persistEmptyLatestReport() {
    const cachePayload = {
      cachedAt: Date.now(),
      matchedCount: null,
      filledCells: [],
      pdfUrl: ''
    }

    wx.setStorageSync(LATEST_STUDY_REPORT_STORAGE_KEY, cachePayload)
    return cachePayload
  }

  getLatestReportCache() {
    try {
      return normalizeLatestReportCache(wx.getStorageSync(LATEST_STUDY_REPORT_STORAGE_KEY) || null)
    } catch (error) {
      return normalizeLatestReportCache(null)
    }
  }

  clearLatestReportCache() {
    try {
      wx.removeStorageSync(LATEST_STUDY_REPORT_STORAGE_KEY)
    } catch (error) {}
  }

  getLatestMatchedCount(options = {}) {
    const cachePayload = this.getLatestReportCache()
    if (!Number.isFinite(Number(cachePayload?.matchedCount))) {
      return normalizeCount(options.fallbackCount, options.fallbackCount, options.totalCount)
    }

    return normalizeCount(cachePayload.matchedCount, options.fallbackCount, options.totalCount)
  }

  getLatestFilledCells() {
    const cachePayload = this.getLatestReportCache()
    return Array.isArray(cachePayload?.filledCells) ? cachePayload.filledCells.slice() : []
  }

  getLatestPdfUrl() {
    const cachePayload = this.getLatestReportCache()
    return normalizePdfUrl(cachePayload?.pdfUrl || '')
  }

  hasLatestPdfUrl() {
    return !!this.getLatestPdfUrl()
  }

  persistScanRequestState(requestState = {}) {
    const normalizedState = requestState && typeof requestState === 'object' ? requestState : {}
    const cachePayload = {
      requested: normalizedState.requested !== false,
      requestedAt: Number(normalizedState.requestedAt) || Date.now(),
      recordId: Number(normalizedState.recordId || 0) || 0
    }

    wx.setStorageSync(STUDY_REPORT_SCAN_REQUEST_STORAGE_KEY, cachePayload)
    return cachePayload
  }

  getScanRequestState() {
    try {
      const cachePayload = wx.getStorageSync(STUDY_REPORT_SCAN_REQUEST_STORAGE_KEY)
      if (!cachePayload || typeof cachePayload !== 'object') {
        return {
          requested: false,
          requestedAt: 0,
          recordId: 0
        }
      }

      return {
        requested: cachePayload.requested !== false,
        requestedAt: Number(cachePayload.requestedAt) || 0,
        recordId: Number(cachePayload.recordId || 0) || 0
      }
    } catch (error) {
      return {
        requested: false,
        requestedAt: 0,
        recordId: 0
      }
    }
  }

  hasScanRequestRecord() {
    return !!this.getScanRequestState().requested
  }

  requestStudyReportJob({ token, recordId }) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: buildUrl(`${STUDY_REPORT_JOB_PATH}/${recordId}`),
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
            reject(buildRequestError(payload?.statusCode || res.statusCode, payload, `研学报告状态查询失败 (${res.statusCode})`))
            return
          }

          resolve(payload)
        },
        fail: (error) => {
          reject(new Error(error?.errMsg || '研学报告状态查询失败'))
        }
      })
    })
  }

  async pollStudyReportJob({
    token,
    recordId,
    intervalMs = DEFAULT_STUDY_REPORT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_STUDY_REPORT_POLL_TIMEOUT_MS,
    onProgress
  } = {}) {
    const normalizedRecordId = Number(recordId)

    if (!Number.isFinite(normalizedRecordId) || normalizedRecordId <= 0) {
      throw new Error('接口未返回有效的任务记录 ID')
    }

    const deadlineAt = Date.now() + Math.max(Number(timeoutMs) || 0, 10000)

    while (Date.now() <= deadlineAt) {
      const payload = await this.requestStudyReportJob({
        token,
        recordId: normalizedRecordId
      })
      const status = normalizeJobStatus(payload?.status)

      if (typeof onProgress === 'function') {
        onProgress(payload)
      }

      if (!status && payload?.report) {
        const cachePayload = this.persistLatestReport(payload)

        return {
          payload,
          cachePayload,
          pdfDescriptor: extractPdfDescriptor(payload || {})
        }
      }

      if (status === 'generated') {
        const cachePayload = this.persistLatestReport(payload)

        return {
          payload,
          cachePayload,
          pdfDescriptor: extractPdfDescriptor(payload || {})
        }
      }

      if (status === 'failed') {
        throw new Error(extractErrorMessage(payload?.last_error || payload, '研学报告生成失败'))
      }

      await sleep(intervalMs)
    }

    throw new Error('研学报告生成超时，请稍后到“我的档案”查看结果')
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

  uploadWorksheetImage({ token, filePath, onProgress } = {}) {
    return new Promise((resolve, reject) => {
      if (typeof onProgress === 'function') {
        onProgress({
          phase: 'uploading'
        })
      }

      const uploadUrl = buildUrl(STUDY_REPORT_UPLOAD_PATH)

      console.log('[study-report] upload worksheet image', {
        url: uploadUrl,
        fileFieldName: 'worksheet_image',
        filePath,
        hasToken: !!token
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
        success: (res) => {
          const parsedPayload = safeParseJson(res.data)
          const payload = parsedPayload || res.data

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(buildRequestError(payload?.statusCode || res.statusCode, payload, `答题卡图片上传失败 (${res.statusCode})`))
            return
          }

          const worksheetImageUrl = extractWorksheetImageUrl(payload)
          if (!worksheetImageUrl) {
            reject(new Error('上传成功，但接口未返回答题卡图片地址'))
            return
          }

          resolve({
            payload: parsedPayload || payload || {},
            worksheetImageUrl
          })
        },
        fail: (error) => {
          reject(new Error(error?.errMsg || '答题卡图片上传失败'))
        }
      })
    })
  }

  requestGenerateStudyReport({
    token,
    worksheetImageUrl,
    studentName,
    studentCode,
    studyDate,
    durationMinutes,
    onProgress
  } = {}) {
    return new Promise((resolve, reject) => {
      if (typeof onProgress === 'function') {
        onProgress({
          phase: 'submitting'
        })
      }

      const payload = {
        worksheet_image_url: worksheetImageUrl,
        student_name: studentName ? String(studentName).trim() : null,
        student_code: studentCode ? String(studentCode).trim() : null,
        study_date: studyDate ? String(studyDate).trim() : null,
        duration_minutes: Number.isFinite(Number(durationMinutes))
          ? Math.max(Math.floor(Number(durationMinutes)), 0)
          : null
      }

      console.log('[study-report] submit generate payload', {
        url: buildUrl(STUDY_REPORT_GENERATE_PATH),
        hasToken: !!token,
        payload
      })

      wx.request({
        url: buildUrl(STUDY_REPORT_GENERATE_PATH),
        method: 'POST',
        timeout: 30000,
        header: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        data: payload,
        success: (res) => {
          const responsePayload = res.data

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(buildRequestError(responsePayload?.statusCode || res.statusCode, responsePayload, `研学报告提交失败 (${res.statusCode})`))
            return
          }

          this.persistScanRequestState({
            requested: true,
            recordId: Number(responsePayload?.record_id || 0) || 0
          })

          resolve(responsePayload || {})
        },
        fail: (error) => {
          reject(new Error(error?.errMsg || '研学报告提交失败'))
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
    pollIntervalMs,
    pollTimeoutMs,
    onProgress
  }) {
    const uploadResult = await this.uploadWorksheetImage({
      token,
      filePath,
      onProgress
    })
    const submitPayload = await this.requestGenerateStudyReport({
      token,
      worksheetImageUrl: uploadResult.worksheetImageUrl,
      studentName,
      studentCode,
      studyDate,
      durationMinutes,
      onProgress
    })

    const submitStatus = normalizeJobStatus(submitPayload?.status)
    const submitRecordId = Number(submitPayload?.record_id || 0) || 0

    if (typeof onProgress === 'function') {
      onProgress(submitPayload)
    }

    if ((!submitStatus && submitPayload?.report) || submitStatus === 'generated') {
      const cachePayload = this.persistLatestReport(submitPayload)

      return {
        payload: submitPayload,
        cachePayload,
        pdfDescriptor: extractPdfDescriptor(submitPayload || {})
      }
    }

    if (submitStatus === 'failed') {
      throw new Error(extractErrorMessage(submitPayload?.last_error || submitPayload, '研学报告生成失败'))
    }

    return this.pollStudyReportJob({
      token,
      recordId: submitRecordId,
      intervalMs: pollIntervalMs,
      timeoutMs: pollTimeoutMs,
      onProgress
    })
  }
}

module.exports = new StudyReportService()
