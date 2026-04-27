const {
  API_BASE_URL_STORAGE_KEY,
  ONLINE_API_BASE_URL,
  LOCAL_API_BASE_URL
} = require('../utils/api-config')

const STUDY_REPORT_GENERATE_PATH = '/client/study-reports/generate'

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
      wx.uploadFile({
        url: buildUrl(STUDY_REPORT_GENERATE_PATH),
        filePath,
        name: 'worksheet_image',
        timeout: 60000,
        header: {
          Accept: 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        formData: {
          student_name: studentName || '',
          student_code: studentCode || '',
          study_date: studyDate || '',
          duration_minutes: durationMinutes === undefined || durationMinutes === null || durationMinutes === ''
            ? ''
            : String(durationMinutes),
          scene: scene || 'qrcode:study-report',
          client_request_id: clientRequestId || ''
        },
        success: (res) => {
          const parsedPayload = safeParseJson(res.data)
          const payload = parsedPayload || res.data

          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(extractErrorMessage(payload, `研学报告生成失败 (${res.statusCode})`)))
            return
          }

          resolve({
            payload,
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
