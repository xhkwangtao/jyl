const auth = require('../../utils/auth')
const {
  updatePointCheckin
} = require('../../utils/checkin')
const {
  ENABLE_MANUAL_SECRET_COLLECTION_FOR_TESTING
} = require('../../config/feature-flags')
const {
  buildSecretCollectionState,
  filterSecretList
} = require('../../utils/secret-collection')
const {
  GUIDE_MAP_PAGE
} = require('../../utils/guide-routes')
const studyReportService = require('../../services/study-report-service')
const {
  PAID_FEATURE_KEYS
} = require('../../services/entitlement-service')
const {
  POSTER_CANVAS_WIDTH,
  POSTER_CANVAS_HEIGHT,
  POSTER_EXPORT_WIDTH,
  POSTER_EXPORT_HEIGHT,
  renderStudyReportPoster
} = require('../../utils/study-report-poster')
const {
  withPageAnalytics
} = require('../../utils/with-page-analytics')

const GENERATED_REPORT_PDF_FILE_NAME = '研学报告.pdf'
const GENERATED_REPORT_PREVIEW_DIR_NAME = 'study-report-preview'
const STAFF_STUDY_REPORT_PAGE = '/pages/staff-study-report/staff-study-report'
const STUDY_REPORT_ACCESS_FEATURE_KEY = PAID_FEATURE_KEYS.STUDY_REPORT_GENERATE
const WORKSHEET_SCAN_NOTICE_TITLE = '扫描前提示'
const WORKSHEET_SCAN_NOTICE_CONTENT = '手机上只能扫描一次答题卡；如需重新扫描，请出检票口后联系工作人员协助扫描。'
const CHECKIN_FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '已记录', value: 'checked' },
  { label: '待寻找', value: 'unchecked' }
]

const RULE_LIST = [
  {
    indexText: '01',
    title: '到景点寻找暗号',
    desc: '到达对应景点后，留意现场线索，找到属于该点位的暗号图案。'
  },
  {
    indexText: '02',
    title: '把暗号画到答题卡上',
    desc: '将你找到的暗号画到答题卡对应位置，完成本次研学记录。'
  },
  {
    indexText: '03',
    title: '扫描答题卡生成报告',
    desc: '游览结束后填写编号和姓名并拍摄答题卡，系统会识别内容并生成专属 AI 研学报告。'
  }
]

function buildCheckinHeroCopy({
  generatedReportReady = false
} = {}) {
  if (generatedReportReady) {
    return {
      heroTitle: '研学报告已生成',
      heroDesc: '答题卡识别完成，可直接查看或保存本次专属 AI 研学报告。'
    }
  }

  return {
    heroTitle: '按景点寻找研学暗号',
    heroDesc: '在景点找到暗号后，把图案画到答题卡上；游览结束后扫描答题卡，即可生成专属 AI 研学报告。'
  }
}

function buildCheckinVisibleSecretList(secretList = []) {
  return (secretList || []).map((item = {}) => {
    const pointName = item.pointShortName || item.pointName || item.name || '对应景点'

    return {
      ...item,
      statusText: item.collected ? '已记录' : '待寻找',
      timeText: item.collected ? item.timeText : '到达景点后寻找暗号',
      collectionHint: item.collected
        ? `${item.secretCode || '该暗号'} 已记录在本次研学成果中`
        : `前往 ${pointName} 寻找暗号，并画到答题卡对应位置`
    }
  })
}

function buildSectionCaption(currentFilter, collectedCount, pendingCount) {
  if (currentFilter === 'checked') {
    return `当前展示 ${collectedCount} 枚已记录的暗号图案`
  }

  if (currentFilter === 'unchecked') {
    return `当前展示 ${pendingCount} 枚待寻找的暗号图案`
  }

  return '当前已经按景区真实暗号点整理，共 19 枚暗号图案。'
}

function navigateToPage(url) {
  wx.navigateTo({
    url,
    fail: () => {
      wx.redirectTo({
        url
      })
    }
  })
}

function normalizeOptionValue(value) {
  if (value === undefined || value === null) {
    return ''
  }

  const rawText = String(value).trim()
  if (!rawText) {
    return ''
  }

  try {
    return decodeURIComponent(rawText)
  } catch (error) {
    return rawText
  }
}

function buildStudyDateText() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function buildPdfFileName() {
  return GENERATED_REPORT_PDF_FILE_NAME
}

function buildReportPosterCacheKey(reportRenderCache = {}) {
  return [
    Number(reportRenderCache?.recordId || 0),
    Number(reportRenderCache?.cachedAt || 0),
    String(reportRenderCache?.title || '').trim(),
    String(reportRenderCache?.studentCode || '').trim()
  ].join('::')
}

function isCancelError(error) {
  return /cancel/i.test(error?.errMsg || error?.message || '')
}

function normalizePdfTitle(pdfPath = '') {
  const normalizedPath = String(pdfPath || '').trim()
  if (!normalizedPath) {
    return ''
  }

  const pathParts = normalizedPath.split('/')
  return pathParts[pathParts.length - 1] || GENERATED_REPORT_PDF_FILE_NAME
}

function buildGeneratedReportDescText(studentName = '', studentCode = '') {
  const normalizedStudentName = String(studentName || '').trim()
  const normalizedStudentCode = String(studentCode || '').trim()

  if (normalizedStudentName && normalizedStudentCode) {
    return `姓名 ${normalizedStudentName} · 编号 ${normalizedStudentCode}`
  }

  if (normalizedStudentName) {
    return `姓名 ${normalizedStudentName}`
  }

  if (normalizedStudentCode) {
    return `编号 ${normalizedStudentCode}`
  }

  return '研学报告已生成，可直接预览或下载'
}

function formatDateTimeText(value) {
  const rawText = String(value || '').trim()
  if (!rawText) {
    return ''
  }

  const date = new Date(rawText)
  if (Number.isNaN(date.getTime())) {
    return rawText
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function getMiniProgramFileSystemManager() {
  if (typeof wx.getFileSystemManager !== 'function') {
    return null
  }

  return wx.getFileSystemManager()
}

function getFileDirectoryPath(filePath = '') {
  const normalizedPath = String(filePath || '').trim()
  if (!normalizedPath) {
    return ''
  }

  const lastSlashIndex = normalizedPath.lastIndexOf('/')
  return lastSlashIndex > 0 ? normalizedPath.slice(0, lastSlashIndex) : ''
}

function buildGeneratedReportPreviewFilePath() {
  return `${wx.env.USER_DATA_PATH}/${GENERATED_REPORT_PREVIEW_DIR_NAME}/${GENERATED_REPORT_PDF_FILE_NAME}`
}

function buildGeneratedReportSavedFilePath() {
  return `${wx.env.USER_DATA_PATH}/${GENERATED_REPORT_PDF_FILE_NAME}`
}

function ensureFileSystemDirectory(dirPath) {
  const fs = getMiniProgramFileSystemManager()
  const normalizedDirPath = String(dirPath || '').trim()

  if (!fs || !normalizedDirPath) {
    return Promise.reject(new Error('文件系统不可用'))
  }

  return new Promise((resolve, reject) => {
    fs.mkdir({
      dirPath: normalizedDirPath,
      recursive: true,
      success: () => resolve(normalizedDirPath),
      fail: (error) => {
        const errorMessage = String(error?.errMsg || '')
        if (errorMessage.includes('file already exists')) {
          resolve(normalizedDirPath)
          return
        }

        reject(error)
      }
    })
  })
}

function accessFileSystemPath(filePath) {
  const fs = getMiniProgramFileSystemManager()
  const normalizedFilePath = String(filePath || '').trim()

  if (!fs || !normalizedFilePath) {
    return Promise.reject(new Error('文件不存在'))
  }

  return new Promise((resolve, reject) => {
    fs.access({
      path: normalizedFilePath,
      success: () => resolve(normalizedFilePath),
      fail: reject
    })
  })
}

function copyLocalFileToPath(sourcePath, targetPath) {
  const fs = getMiniProgramFileSystemManager()
  const normalizedSourcePath = String(sourcePath || '').trim()
  const normalizedTargetPath = String(targetPath || '').trim()

  if (!fs || !normalizedSourcePath || !normalizedTargetPath) {
    return Promise.reject(new Error('PDF 文件路径无效'))
  }

  return ensureFileSystemDirectory(getFileDirectoryPath(normalizedTargetPath))
    .then(() => new Promise((resolve, reject) => {
      fs.copyFile({
        srcPath: normalizedSourcePath,
        destPath: normalizedTargetPath,
        success: () => resolve(normalizedTargetPath),
        fail: (copyError) => {
          fs.readFile({
            filePath: normalizedSourcePath,
            success: (readResult = {}) => {
              fs.writeFile({
                filePath: normalizedTargetPath,
                data: readResult.data,
                success: () => resolve(normalizedTargetPath),
                fail: reject
              })
            },
            fail: (readError) => reject(readError || copyError)
          })
        }
      })
    }))
}

function extractFileTransferErrorMessage(payload, fallbackMessage) {
  if (payload && typeof payload === 'object') {
    return payload.detail || payload.message || payload.error || payload.errMsg || fallbackMessage
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim()
  }

  return fallbackMessage
}

function writeBinaryFileToPath(fileData, targetPath) {
  const fs = getMiniProgramFileSystemManager()
  const normalizedTargetPath = String(targetPath || '').trim()

  if (!fs || !normalizedTargetPath || fileData === undefined || fileData === null) {
    return Promise.reject(new Error('PDF 文件写入失败'))
  }

  return ensureFileSystemDirectory(getFileDirectoryPath(normalizedTargetPath))
    .then(() => new Promise((resolve, reject) => {
      fs.writeFile({
        filePath: normalizedTargetPath,
        data: fileData,
        success: () => resolve(normalizedTargetPath),
        fail: reject
      })
    }))
}

function writeBase64FileToPath(base64Value, targetPath) {
  const fs = getMiniProgramFileSystemManager()
  const normalizedBase64Value = String(base64Value || '').trim()
  const normalizedTargetPath = String(targetPath || '').trim()

  if (!fs || !normalizedBase64Value || !normalizedTargetPath) {
    return Promise.reject(new Error('PDF 文件写入失败'))
  }

  return ensureFileSystemDirectory(getFileDirectoryPath(normalizedTargetPath))
    .then(() => new Promise((resolve, reject) => {
      fs.writeFile({
        filePath: normalizedTargetPath,
        data: normalizedBase64Value,
        encoding: 'base64',
        success: () => resolve(normalizedTargetPath),
        fail: reject
      })
    }))
}

function requestRemoteFileToPath(url, targetPath) {
  const normalizedUrl = String(url || '').trim()
  const normalizedTargetPath = String(targetPath || '').trim()
  const token = auth.getToken()

  if (!normalizedUrl || !normalizedTargetPath) {
    return Promise.reject(new Error('PDF 文件下载失败'))
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: normalizedUrl,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 60000,
      header: {
        Accept: 'application/pdf,application/octet-stream,*/*',
        Authorization: token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (!(res.statusCode >= 200 && res.statusCode < 300) || !res.data) {
          console.warn('[study-report] request pdf failed', {
            url: normalizedUrl,
            statusCode: res.statusCode,
            payload: res.data
          })
          reject(new Error(extractFileTransferErrorMessage(res.data, `PDF 文件下载失败 (${res.statusCode})`)))
          return
        }

        writeBinaryFileToPath(res.data, normalizedTargetPath)
          .then(() => resolve(normalizedTargetPath))
          .catch(() => reject(new Error('PDF 文件写入失败')))
      },
      fail: (error) => {
        console.warn('[study-report] request pdf transport failed', {
          url: normalizedUrl,
          error
        })
        reject(new Error(extractFileTransferErrorMessage(error, 'PDF 文件下载失败')))
      }
    })
  })
}

function downloadRemoteFileToPath(url, targetPath) {
  const normalizedUrl = String(url || '').trim()
  const normalizedTargetPath = String(targetPath || '').trim()
  const token = auth.getToken()

  if (!normalizedUrl || !normalizedTargetPath) {
    return Promise.reject(new Error('PDF 文件下载失败'))
  }

  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: normalizedUrl,
      timeout: 60000,
      header: {
        Authorization: token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (!(res.statusCode >= 200 && res.statusCode < 300) || !res.tempFilePath) {
          console.warn('[study-report] download pdf failed', {
            url: normalizedUrl,
            statusCode: res.statusCode,
            payload: res.data
          })
          reject(new Error(extractFileTransferErrorMessage(res.data, `PDF 文件下载失败 (${res.statusCode})`)))
          return
        }

        copyLocalFileToPath(res.tempFilePath, normalizedTargetPath)
          .then(() => resolve(normalizedTargetPath))
          .catch(() => reject(new Error('PDF 文件写入失败')))
      },
      fail: (error) => {
        console.warn('[study-report] download pdf transport failed', {
          url: normalizedUrl,
          error
        })
        reject(new Error(extractFileTransferErrorMessage(error, 'PDF 文件下载失败')))
      }
    })
  })
}

function resolveStudyReportLoadingTitle(payload = {}) {
  const phase = String(payload?.phase || '').trim().toLowerCase()
  const status = String(payload?.status || '').trim().toLowerCase()

  if (phase === 'uploading') {
    return '上传图片中...'
  }

  if (phase === 'submitting') {
    return '正在提交...'
  }

  if (status === 'queued') {
    return '任务排队中...'
  }

  if (status === 'processing') {
    return 'AI识别中...'
  }

  if (status === 'generated') {
    return '报告生成中...'
  }

  return 'AI识别中...'
}

function buildWorksheetScanTip({
  hasCachedReport = false,
  hasRequested = false
} = {}) {
  if (hasCachedReport) {
    return ''
  }

  if (hasRequested) {
    return '答题卡已提交，请勿重复扫描；稍后可在“我的档案”查看研学报告。'
  }

  return '完成答题卡后填写编号和姓名并拍摄上传，系统将自动识别并生成研学报告。'
}

Page(withPageAnalytics('/pages/check-in/check-in', {
  data: {
    pageTitle: '暗号收集',
    navFadeHeight: 50,
    navBackground: 'rgba(255,255,255,0)',
    navTheme: 'dark',
    filterOptions: CHECKIN_FILTER_OPTIONS,
    currentFilter: 'all',
    heroTitle: '',
    heroDesc: '',
    totalCount: 0,
    collectedCount: 0,
    displayCollectedCount: 0,
    pendingCount: 0,
    displayPendingCount: 0,
    progressPercent: 0,
    progressPercentText: '0%',
    displayProgressPercent: 0,
    displayProgressPercentText: '0%',
    sectionCaption: '',
    visibleCount: 0,
    secretList: [],
    visibleSecretList: [],
    ruleList: RULE_LIST,
    targetSecretId: '',
    scanTip: '完成答题卡后填写编号和姓名并拍摄上传，系统将自动识别并生成研学报告。',
    manualCollectEnabled: ENABLE_MANUAL_SECRET_COLLECTION_FOR_TESTING,
    showWorksheetDialog: false,
    worksheetStudentCode: '',
    worksheetStudentName: '',
    worksheetTaskRunning: false,
    generatedReportReady: false,
    generatedReportStudentName: '',
    generatedReportStudentCode: '',
    generatedReportDescText: '',
    generatedReportPdfTitle: '',
    generatedReportPdfTempPath: '',
    generatedReportPdfSavedPath: '',
    generatedReportRemotePdfUrl: '',
    generatedReportGeneratedAtText: '',
    generatedReportWarningText: '',
    generatedReportPosterTempPath: '',
    generatedReportPosterCacheKey: '',
    reportPosterSaving: false,
    reportPosterPreviewing: false
  },

  onLoad(options = {}) {
    this.entryMapPointId = normalizeOptionValue(options.mapPointId)
    this.entrySecretId = normalizeOptionValue(options.secretId)
    this.entryTargetHintShown = false
    this.refreshPageState()
    this.resumePendingStudyReportPollingIfNeeded()
  },

  onReady() {
    this.permissionGuard = this.selectComponent('#permissionGuard')
    this.ensureEntryAccess()
  },

  onShow() {
    this.refreshPageState()
    this.resumePendingStudyReportPollingIfNeeded()
  },

  noop() {},

  getPermissionGuard() {
    if (this.permissionGuard) {
      return this.permissionGuard
    }

    this.permissionGuard = this.selectComponent('#permissionGuard')
    return this.permissionGuard || null
  },

  async ensureEntryAccess() {
    if (this.entryAccessPromise) {
      return this.entryAccessPromise
    }

    const permissionGuard = this.getPermissionGuard()
    if (!permissionGuard) {
      return null
    }

    this.entryAccessPromise = (async () => {
      await permissionGuard.refreshCurrentUserProfile({
        showLoginToast: true
      })

      if (permissionGuard.isStaffUser()) {
        navigateToPage(STAFF_STUDY_REPORT_PAGE)
        return {
          allowed: false,
          redirectedToStaffPage: true
        }
      }

      return permissionGuard.ensureFeatureAccess({
        featureKey: STUDY_REPORT_ACCESS_FEATURE_KEY,
        featureName: 'AI研学报告',
        productName: 'AI研学报告权益',
        description: '生成专属AI研学报告需要开通权益',
        successRedirect: '/pages/check-in/check-in',
        showLoginToast: true
      })
    })().finally(() => {
      this.entryAccessPromise = null
    })

    return this.entryAccessPromise
  },

  getWorksheetEntryState() {
    const hasCachedReport = studyReportService.hasLatestReportRenderCache() || studyReportService.hasLatestPdfUrl()
    const hasRequested = studyReportService.getPendingScanRecordId() > 0

    return {
      hasCachedReport,
      hasRequested,
      blocked: hasCachedReport || hasRequested
    }
  },

  onPageScroll({ scrollTop = 0 }) {
    const max = this.data.navFadeHeight || 50
    const ratio = Math.min(Math.max(scrollTop / max, 0), 1)
    const nextOpacity = Number(ratio.toFixed(2))

    this.setData({
      navBackground: `rgba(255,255,255,${nextOpacity})`,
      navTheme: 'dark'
    })
  },

  refreshPageState() {
    const collectionState = buildSecretCollectionState()
    const currentFilter = this.data.currentFilter || 'all'
    const visibleSecretList = buildCheckinVisibleSecretList(
      filterSecretList(collectionState.secretList, currentFilter)
    )
    const targetSecret = this.resolveEntryTargetSecret(collectionState.secretList)
    const targetSecretId = targetSecret?.id || ''
    const worksheetEntryState = this.getWorksheetEntryState()
    const generatedReportCardState = this.buildGeneratedReportCardState()
    const displayCollectedCount = studyReportService.getLatestMatchedCount({
      totalCount: collectionState.totalCount,
      fallbackCount: collectionState.collectedCount
    })
    const displayPendingCount = Math.max(collectionState.totalCount - displayCollectedCount, 0)
    const displayProgressPercent = collectionState.totalCount
      ? Math.round((displayCollectedCount / collectionState.totalCount) * 100)
      : 0
    const heroCopy = buildCheckinHeroCopy({
      totalCount: collectionState.totalCount,
      displayCollectedCount,
      generatedReportReady: generatedReportCardState.generatedReportReady
    })

    this.setData({
      ...collectionState,
      ...heroCopy,
      displayCollectedCount,
      displayPendingCount,
      displayProgressPercent,
      displayProgressPercentText: `${displayProgressPercent}%`,
      visibleSecretList,
      targetSecretId,
      scanTip: buildWorksheetScanTip(worksheetEntryState),
      ...generatedReportCardState,
      visibleCount: visibleSecretList.length,
      sectionCaption: buildSectionCaption(currentFilter, collectionState.collectedCount, collectionState.pendingCount)
    }, () => {
      this.notifyEntryTarget(targetSecret)
    })
  },

  applyGeneratedReportResult(result = {}, options = {}) {
    const reportRenderCache = studyReportService.getLatestReportRenderCache()
    const warningText = Array.isArray(result?.payload?.warnings) && result.payload.warnings.length
      ? result.payload.warnings.join('；')
      : ''
    const generatedReportGeneratedAtText = formatDateTimeText(result?.payload?.generated_at || '')
    const generatedReportStudentName = String(options.studentName || reportRenderCache.studentName || '').trim()
    const generatedReportStudentCode = String(options.studentCode || reportRenderCache.studentCode || '').trim()
    const generatedReportPdfTitle = String(reportRenderCache.title || '').trim()
      || '九眼楼AI研学报告'

    this.setData({
      generatedReportReady: true,
      generatedReportStudentName,
      generatedReportStudentCode,
      generatedReportDescText: buildGeneratedReportDescText(generatedReportStudentName, generatedReportStudentCode),
      generatedReportPdfTitle,
      generatedReportPdfTempPath: '',
      generatedReportPdfSavedPath: '',
      generatedReportRemotePdfUrl: '',
      generatedReportPosterTempPath: '',
      generatedReportPosterCacheKey: '',
      generatedReportGeneratedAtText,
      generatedReportWarningText: warningText
    })

    this.refreshPageState()
  },

  async resumePendingStudyReportPollingIfNeeded() {
    if (this.pendingStudyReportPollingPromise || this.data.worksheetTaskRunning) {
      return this.pendingStudyReportPollingPromise || null
    }

    const pendingRecordId = studyReportService.getPendingScanRecordId()
    if (!pendingRecordId) {
      return null
    }

    if (studyReportService.hasLatestReportRenderCache()) {
      studyReportService.clearScanRequestState()
      return null
    }

    this.pendingStudyReportPollingPromise = this.pollPendingStudyReportJob({
      recordId: pendingRecordId,
      showLoading: false,
      showSuccessToast: true
    }).finally(() => {
      this.pendingStudyReportPollingPromise = null
    })

    return this.pendingStudyReportPollingPromise
  },

  async pollPendingStudyReportJob({
    recordId,
    token: initialToken = '',
    showLoading = false,
    showSuccessToast = true
  }) {
    console.log('[study-report] start polling pending job', {
      recordId: Number(recordId || 0),
      showLoading,
      showSuccessToast,
      hasInitialToken: !!String(initialToken || '').trim()
    })

    this.setData({
      worksheetTaskRunning: true
    })

    let currentLoadingTitle = '继续获取报告中...'
    const showTaskLoading = (title) => {
      const nextTitle = String(title || '').trim() || 'AI识别中...'

      if (nextTitle === currentLoadingTitle) {
        return
      }

      currentLoadingTitle = nextTitle
      if (showLoading) {
        wx.showLoading({
          title: currentLoadingTitle,
          mask: true
        })
      }
    }

    if (showLoading) {
      wx.showLoading({
        title: currentLoadingTitle,
        mask: true
      })
    }

    try {
      let token = String(initialToken || '').trim()
      if (!token) {
        const hasLogin = await auth.checkAndAutoLogin(3000)
        if (!hasLogin) {
          throw new Error('登录失败，请稍后重试')
        }

        token = auth.getToken()
      }

      if (!token) {
        throw new Error('缺少用户登录状态，请重新进入页面后再试')
      }

      const result = await studyReportService.pollStudyReportJob({
        token,
        recordId,
        onProgress: (payload) => {
          showTaskLoading(resolveStudyReportLoadingTitle(payload))
        }
      })

      this.applyGeneratedReportResult(result)

      if (showSuccessToast) {
        wx.showToast({
          title: '研学报告已生成',
          icon: 'success',
          duration: 1800
        })
      }
    } catch (error) {
      this.refreshPageState()
      wx.showToast({
        title: error?.message || '研学报告获取失败',
        icon: 'none',
        duration: 2200
      })
    } finally {
      if (showLoading) {
        wx.hideLoading()
      }
      this.setData({
        worksheetTaskRunning: false
      })
    }
  },

  buildGeneratedReportCardState() {
    const renderedReportCache = studyReportService.getLatestReportRenderCache()
    const cachedPdfUrl = studyReportService.getLatestPdfUrl()
    const generatedReportPdfTempPath = String(this.data.generatedReportPdfTempPath || '').trim()
    const generatedReportPdfSavedPath = String(this.data.generatedReportPdfSavedPath || '').trim()
    const generatedReportStudentName = String(
      this.data.generatedReportStudentName || renderedReportCache.studentName || ''
    ).trim()
    const generatedReportStudentCode = String(
      this.data.generatedReportStudentCode || renderedReportCache.studentCode || ''
    ).trim()
    const generatedReportPdfTitle = String(this.data.generatedReportPdfTitle || '').trim()
      || String(renderedReportCache.title || '').trim()
      || normalizePdfTitle(generatedReportPdfSavedPath)
      || normalizePdfTitle(generatedReportPdfTempPath)
      || '九眼楼AI研学报告'
    const generatedReportReady = !!(
      renderedReportCache.hasContent
      || cachedPdfUrl
      || generatedReportPdfTempPath
      || generatedReportPdfSavedPath
    )

    if (!generatedReportReady) {
      return {
        generatedReportReady: false,
        generatedReportDescText: '',
        generatedReportRemotePdfUrl: '',
        generatedReportPdfTitle: '',
        generatedReportPdfSavedPath: '',
        generatedReportPdfTempPath: '',
        generatedReportPosterTempPath: '',
        generatedReportPosterCacheKey: '',
        generatedReportGeneratedAtText: '',
        generatedReportWarningText: ''
      }
    }

    return {
      generatedReportReady: true,
      generatedReportDescText: buildGeneratedReportDescText(generatedReportStudentName, generatedReportStudentCode),
      generatedReportRemotePdfUrl: cachedPdfUrl,
      generatedReportPdfTitle,
      generatedReportPdfSavedPath,
      generatedReportPdfTempPath
    }
  },

  resolveEntryTargetSecret(secretList = []) {
    if (this.entrySecretId) {
      const matchedBySecretId = secretList.find((item) => String(item.id) === String(this.entrySecretId))

      if (matchedBySecretId) {
        return matchedBySecretId
      }
    }

    if (this.entryMapPointId) {
      return secretList.find((item) => String(item.mapPointId || '') === String(this.entryMapPointId)) || null
    }

    return null
  },

  notifyEntryTarget(targetSecret) {
    if (this.entryTargetHintShown || !targetSecret) {
      return
    }

    this.entryTargetHintShown = true

    wx.showToast({
      title: `已定位到 ${targetSecret.name}`,
      icon: 'none',
      duration: 1600
    })
  },

  onFilterTap(event) {
    const nextFilter = event.currentTarget?.dataset?.value || 'all'

    if (nextFilter === this.data.currentFilter) {
      return
    }

    this.setData({
      currentFilter: nextFilter
    }, () => {
      this.refreshPageState()
    })
  },

  onScanCollect() {
    if (this.data.worksheetTaskRunning) {
      return
    }

    const worksheetEntryState = this.getWorksheetEntryState()
    if (worksheetEntryState.blocked) {
      wx.showToast({
        title: '您已扫描过答题卡，再次扫描请前往景区入口游客中心联系工作人员',
        icon: 'none',
        duration: 10000
      })
      return
    }

    wx.showModal({
      title: WORKSHEET_SCAN_NOTICE_TITLE,
      content: WORKSHEET_SCAN_NOTICE_CONTENT,
      confirmText: '继续扫描',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        this.setData({
          showWorksheetDialog: true
        })
      }
    })
  },

  onWorksheetDialogClose() {
    if (this.data.worksheetTaskRunning) {
      return
    }

    this.setData({
      showWorksheetDialog: false
    })
  },

  onWorksheetInput(event) {
    const field = event.currentTarget?.dataset?.field

    if (!field) {
      return
    }

    this.setData({
      [field]: String(event.detail?.value || '')
    })
  },

  async onWorksheetDialogConfirm() {
    if (this.data.worksheetTaskRunning) {
      return
    }

    const worksheetStudentCode = String(this.data.worksheetStudentCode || '').trim()
    const worksheetStudentName = String(this.data.worksheetStudentName || '').trim()

    if (!worksheetStudentCode) {
      wx.showToast({
        title: '请先输入编号',
        icon: 'none',
        duration: 1600
      })
      return
    }

    if (!worksheetStudentName) {
      wx.showToast({
        title: '请先输入姓名',
        icon: 'none',
        duration: 1600
      })
      return
    }

    let imageFilePath = ''

    try {
      imageFilePath = await this.captureWorksheetImage()
    } catch (error) {
      if (isCancelError(error)) {
        return
      }

      wx.showToast({
        title: error?.message || '拍照失败，请重试',
        icon: 'none',
        duration: 1800
      })
      return
    }

    if (!imageFilePath) {
      return
    }

    this.setData({
      showWorksheetDialog: false
    })

    await this.generateWorksheetReport({
      imageFilePath,
      worksheetStudentCode,
      worksheetStudentName
    })
  },

  captureWorksheetImage() {
    return new Promise((resolve, reject) => {
      const onSuccess = (tempFilePath, fileSize) => {
        if (!tempFilePath) {
          reject(new Error('未获取到答题卡照片'))
          return
        }

        if (Number(fileSize) > 15 * 1024 * 1024) {
          reject(new Error('答题卡照片过大，请压缩到 15MB 以内后重试'))
          return
        }

        resolve(tempFilePath)
      }

      if (typeof wx.chooseMedia === 'function') {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['camera'],
          camera: 'back',
          sizeType: ['compressed'],
          success: (res) => {
            const selectedFile = Array.isArray(res.tempFiles) ? res.tempFiles[0] : null
            onSuccess(selectedFile?.tempFilePath || '', selectedFile?.size || 0)
          },
          fail: reject
        })
        return
      }

      wx.chooseImage({
        count: 1,
        sourceType: ['camera'],
        sizeType: ['compressed'],
        success: (res) => {
          const tempFilePath = Array.isArray(res.tempFilePaths) ? res.tempFilePaths[0] : ''
          const selectedFile = Array.isArray(res.tempFiles) ? res.tempFiles[0] : null
          onSuccess(tempFilePath, selectedFile?.size || 0)
        },
        fail: reject
      })
    })
  },

  async generateWorksheetReport({ imageFilePath, worksheetStudentCode, worksheetStudentName }) {
    this.setData({
      worksheetTaskRunning: true
    })

    let currentLoadingTitle = '上传图片中...'
    const showTaskLoading = (title) => {
      const nextTitle = String(title || '').trim() || 'AI识别中...'

      if (nextTitle === currentLoadingTitle) {
        return
      }

      currentLoadingTitle = nextTitle
      wx.showLoading({
        title: currentLoadingTitle,
        mask: true
      })
    }

    wx.showLoading({
      title: currentLoadingTitle,
      mask: true
    })

    try {
      const hasLogin = await auth.checkAndAutoLogin(3000)
      if (!hasLogin) {
        throw new Error('登录失败，请稍后重试')
      }

      const token = auth.getToken()
      if (!token) {
        throw new Error('缺少用户登录状态，请重新进入页面后再试')
      }

      const result = await studyReportService.generateReport({
        token,
        filePath: imageFilePath,
        studentName: worksheetStudentName,
        studentCode: worksheetStudentCode,
        studyDate: buildStudyDateText(),
        deferPollingOnPending: true,
        onProgress: (payload) => {
          showTaskLoading(resolveStudyReportLoadingTitle(payload))
        }
      })

      if (result?.pending) {
        this.refreshPageState()

        this.pendingStudyReportPollingPromise = this.pollPendingStudyReportJob({
          recordId: Number(result.recordId || studyReportService.getPendingScanRecordId() || 0),
          token,
          showLoading: false,
          showSuccessToast: true
        }).finally(() => {
          this.pendingStudyReportPollingPromise = null
        })

        wx.showToast({
          title: '报告生成中，请稍后查看',
          icon: 'none',
          duration: 2200
        })
        return
      }

      this.applyGeneratedReportResult(result, {
        studentName: worksheetStudentName,
        studentCode: worksheetStudentCode
      })

      wx.showToast({
        title: '研学报告已生成',
        icon: 'success',
        duration: 1800
      })
    } catch (error) {
      this.refreshPageState()
      wx.showToast({
        title: error?.message || '研学报告生成失败',
        icon: 'none',
        duration: 2200
      })
    } finally {
      wx.hideLoading()
      if (!this.pendingStudyReportPollingPromise) {
        this.setData({
          worksheetTaskRunning: false
        })
      }
    }
  },

  prepareGeneratedPdfFile(pdfDescriptor) {
    if (!pdfDescriptor) {
      return Promise.reject(new Error('接口未返回 PDF 文件'))
    }

    const targetFilePath = buildGeneratedReportPreviewFilePath()

    if (pdfDescriptor.type === 'base64' && pdfDescriptor.base64) {
      return writeBase64FileToPath(pdfDescriptor.base64, targetFilePath)
        .catch(() => {
          throw new Error('PDF 文件写入失败')
        })
    }

    if (pdfDescriptor.type === 'url' && pdfDescriptor.url) {
      return requestRemoteFileToPath(pdfDescriptor.url, targetFilePath)
        .catch((requestError) => downloadRemoteFileToPath(pdfDescriptor.url, targetFilePath)
          .catch((downloadError) => {
            throw new Error(
              downloadError?.message
              || requestError?.message
              || 'PDF 文件下载失败'
            )
          }))
    }

    return Promise.reject(new Error('接口未返回可用的 PDF 文件'))
  },

  previewGeneratedPdfFile(filePath) {
    if (!filePath) {
      wx.showToast({
        title: '当前没有可预览的报告',
        icon: 'none',
        duration: 1800
      })
      return
    }

    wx.openDocument({
      filePath,
      fileType: 'pdf',
      showMenu: true,
      fail: () => {
        wx.showToast({
          title: 'PDF 预览失败',
          icon: 'none',
          duration: 1800
        })
      }
    })
  },

  getStudyReportPosterCanvasNode() {
    if (this.studyReportPosterCanvasPromise) {
      return this.studyReportPosterCanvasPromise
    }

    this.studyReportPosterCanvasPromise = new Promise((resolve, reject) => {
      const query = this.createSelectorQuery()
      query.select('#study-report-poster-canvas').fields({
        node: true,
        size: true
      }).exec((resultList) => {
        const canvasResult = Array.isArray(resultList) ? resultList[0] : null
        const canvasNode = canvasResult?.node || null

        if (!canvasNode) {
          this.studyReportPosterCanvasPromise = null
          reject(new Error('研学报告画布初始化失败'))
          return
        }

        const systemInfo = wx.getSystemInfoSync()
        const pixelRatio = Number(systemInfo?.pixelRatio) || 1
        const context2d = canvasNode.getContext('2d')

        canvasNode.width = POSTER_CANVAS_WIDTH * pixelRatio
        canvasNode.height = POSTER_CANVAS_HEIGHT * pixelRatio

        this.studyReportPosterCanvasInfo = {
          canvasNode,
          context2d,
          pixelRatio
        }

        resolve(this.studyReportPosterCanvasInfo)
      })
    })

    return this.studyReportPosterCanvasPromise
  },

  async generateStudyReportPosterTempFile(reportRenderCache) {
    const canvasInfo = await this.getStudyReportPosterCanvasNode()
    const canvasNode = canvasInfo?.canvasNode
    const context2d = canvasInfo?.context2d
    const pixelRatio = Number(canvasInfo?.pixelRatio) || 1
    const exportWidth = Math.round(POSTER_EXPORT_WIDTH * pixelRatio)
    const exportHeight = Math.round(POSTER_EXPORT_HEIGHT * pixelRatio)

    if (!canvasNode || !context2d) {
      throw new Error('研学报告画布初始化失败')
    }

    if (typeof context2d.setTransform === 'function') {
      context2d.setTransform(1, 0, 0, 1, 0, 0)
    }
    context2d.clearRect(0, 0, canvasNode.width, canvasNode.height)
    context2d.scale(pixelRatio, pixelRatio)

    renderStudyReportPoster(context2d, reportRenderCache)

    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: canvasNode,
        x: 0,
        y: 0,
        width: POSTER_CANVAS_WIDTH,
        height: POSTER_CANVAS_HEIGHT,
        destWidth: exportWidth,
        destHeight: exportHeight,
        fileType: 'png',
        quality: 1,
        success: (res) => {
          resolve(res.tempFilePath)
        },
        fail: (error) => {
          reject(new Error(error?.errMsg || '研学报告图片生成失败'))
        }
      }, this)
    })
  },

  savePosterImageToAlbum(filePath) {
    return new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: resolve,
        fail: reject
      })
    })
  },

  previewPosterImage(filePath) {
    const normalizedFilePath = String(filePath || '').trim()

    if (!normalizedFilePath) {
      return Promise.reject(new Error('当前没有可查看的研学报告'))
    }

    return new Promise((resolve, reject) => {
      wx.previewImage({
        current: normalizedFilePath,
        urls: [normalizedFilePath],
        showmenu: true,
        success: resolve,
        fail: (error) => reject(new Error(error?.errMsg || '报告预览失败'))
      })
    })
  },

  async ensureGeneratedReportPosterTempFile(reportRenderCache) {
    if (!reportRenderCache?.hasContent) {
      throw new Error('当前没有可查看的研学报告')
    }

    const posterCacheKey = buildReportPosterCacheKey(reportRenderCache)
    const cachedPosterPath = String(this.data.generatedReportPosterTempPath || '').trim()

    if (cachedPosterPath && this.data.generatedReportPosterCacheKey === posterCacheKey) {
      try {
        await accessFileSystemPath(cachedPosterPath)
        return cachedPosterPath
      } catch (error) {}
    }

    const tempFilePath = await this.generateStudyReportPosterTempFile(reportRenderCache)
    this.setData({
      generatedReportPosterTempPath: tempFilePath,
      generatedReportPosterCacheKey: posterCacheKey
    })

    return tempFilePath
  },

  async ensureGeneratedReportPdfFile() {
    const localPathCandidates = [
      String(this.data.generatedReportPdfSavedPath || '').trim(),
      String(this.data.generatedReportPdfTempPath || '').trim(),
      buildGeneratedReportSavedFilePath(),
      buildGeneratedReportPreviewFilePath()
    ].filter(Boolean)

    for (let index = 0; index < localPathCandidates.length; index += 1) {
      const candidatePath = localPathCandidates[index]

      try {
        await accessFileSystemPath(candidatePath)

        if (candidatePath !== this.data.generatedReportPdfTempPath || candidatePath !== this.data.generatedReportPdfSavedPath) {
          this.setData({
            generatedReportPdfTempPath: candidatePath,
            generatedReportPdfSavedPath: candidatePath === buildGeneratedReportSavedFilePath() ? candidatePath : ''
          })
        }

        return candidatePath
      } catch (error) {}
    }

    const remotePdfUrl = String(this.data.generatedReportRemotePdfUrl || studyReportService.getLatestPdfUrl() || '').trim()
    if (!remotePdfUrl) {
      throw new Error('当前没有可预览的报告')
    }

    const hasLogin = await auth.checkAndAutoLogin(3000)
    if (!hasLogin) {
      throw new Error('登录失败，请稍后重试')
    }

    wx.showLoading({
      title: '加载PDF中...',
      mask: true
    })

    try {
      const downloadedFilePath = await this.prepareGeneratedPdfFile({
        type: 'url',
        url: remotePdfUrl,
        fileName: this.data.generatedReportPdfTitle || GENERATED_REPORT_PDF_FILE_NAME
      })

      this.setData({
        generatedReportPdfTitle: GENERATED_REPORT_PDF_FILE_NAME,
        generatedReportPdfTempPath: downloadedFilePath
      })

      return downloadedFilePath
    } finally {
      wx.hideLoading()
    }
  },

  async onPreviewGeneratedReportTap() {
    if (this.data.reportPosterPreviewing) {
      return
    }

    const reportRenderCache = studyReportService.getLatestReportRenderCache()
    if (!reportRenderCache.hasContent) {
      wx.showToast({
        title: '当前没有可查看的研学报告',
        icon: 'none',
        duration: 1800
      })
      return
    }

    this.setData({
      reportPosterPreviewing: true
    })

    wx.showLoading({
      title: '加载报告中...',
      mask: true
    })

    try {
      const tempFilePath = await this.ensureGeneratedReportPosterTempFile(reportRenderCache)
      wx.hideLoading()
      await this.previewPosterImage(tempFilePath)
    } catch (error) {
      wx.hideLoading()
      wx.showToast({
        title: error?.message || '报告预览失败',
        icon: 'none',
        duration: 1800
      })
    } finally {
      this.setData({
        reportPosterPreviewing: false
      })
    }
  },

  async onSaveGeneratedReportTap() {
    if (!studyReportService.hasLatestReportRenderCache()) {
      wx.showToast({
        title: '当前没有可查看的研学报告',
        icon: 'none',
        duration: 1800
      })
      return
    }

    if (this.data.reportPosterSaving) {
      return
    }

    const reportRenderCache = studyReportService.getLatestReportRenderCache()
    if (!reportRenderCache.hasContent) {
      wx.showToast({
        title: '当前没有可保存的研学报告',
        icon: 'none',
        duration: 1800
      })
      return
    }

    this.setData({
      reportPosterSaving: true
    })

    wx.showLoading({
      title: '生成报告中...',
      mask: true
    })

    try {
      const tempFilePath = await this.ensureGeneratedReportPosterTempFile(reportRenderCache)
      await this.savePosterImageToAlbum(tempFilePath)

      wx.showToast({
        title: '报告已保存到相册',
        icon: 'success',
        duration: 1800
      })
    } catch (error) {
      const errorMessage = String(error?.errMsg || error?.message || '')

      if (/auth deny|auth denied|authorize no response/i.test(errorMessage)) {
        wx.showModal({
          title: '需要相册权限',
          content: '保存研学报告图片需要访问相册，请在设置中允许后重试。',
          confirmText: '去设置',
          success: (modalResult) => {
            if (modalResult.confirm) {
              wx.openSetting({
                fail: () => {}
              })
            }
          }
        })
      } else {
        wx.showToast({
          title: error?.message || '保存报告失败',
          icon: 'none',
          duration: 2000
        })
      }
    } finally {
      wx.hideLoading()
      this.setData({
        reportPosterSaving: false
      })
    }
  },

  onToggleCheckin(event) {
    if (!this.data.manualCollectEnabled) {
      wx.showToast({
        title: '正式模式下请以现场寻找和答题卡识别为准',
        icon: 'none',
        duration: 1600
      })
      return
    }

    const pointId = event.currentTarget?.dataset?.id

    if (!pointId) {
      return
    }

    const target = (this.data.secretList || []).find((item) => String(item.id) === String(pointId))

    if (!target) {
      return
    }

    const nextChecked = !target.collected
    updatePointCheckin(pointId, nextChecked)
    this.refreshPageState()

    wx.showToast({
      title: nextChecked ? '已测试标记为已收集' : '已取消测试标记',
      icon: 'none',
      duration: 1600
    })
  },

  onMapTap(event) {
    const mapPointId = event.currentTarget?.dataset?.mapId

    if (!mapPointId) {
      wx.showToast({
        title: '该暗号点暂未接入地图定位',
        icon: 'none',
        duration: 1600
      })
      return
    }

    navigateToPage(`${GUIDE_MAP_PAGE}?pointId=${mapPointId}`)
  },

  onMyPageTap() {
    navigateToPage('/pages/my-page/my-page')
  },

  onBackTap() {
    const pages = getCurrentPages()
    const previousRoute = pages.length > 1 ? pages[pages.length - 2].route : ''
    const delta = previousRoute === 'pages/my-page/my-page' ? 2 : 1

    wx.navigateBack({
      delta,
      fail: () => {
        wx.redirectTo({
          url: '/pages/index/index'
        })
      }
    })
  },

  onHomeTap() {
    wx.reLaunch({
      url: '/pages/index/index',
      fail: () => {
        wx.redirectTo({
          url: '/pages/index/index'
        })
      }
    })
  }
}))
