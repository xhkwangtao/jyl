const auth = require('../../utils/auth')
const {
  updatePointCheckin
} = require('../../utils/checkin')
const {
  ENABLE_MANUAL_SECRET_COLLECTION_FOR_TESTING
} = require('../../config/feature-flags')
const {
  SECRET_FILTER_OPTIONS,
  buildSecretCollectionState,
  filterSecretList
} = require('../../utils/secret-collection')
const {
  GUIDE_MAP_PAGE
} = require('../../utils/guide-routes')
const studyReportService = require('../../services/study-report-service')

const GENERATED_REPORT_PDF_FILE_NAME = '研学报告.pdf'
const GENERATED_REPORT_PREVIEW_DIR_NAME = 'study-report-preview'

const RULE_LIST = [
  {
    indexText: '01',
    title: '到景点现场扫码',
    desc: '学生到达布置了二维码的景点后，扫描对应二维码即可记录一枚暗号图案。'
  },
  {
    indexText: '02',
    title: '收集全部暗号',
    desc: '每个二维码对应一枚暗号图案，只有把全部图案收齐，研学任务才算完成。'
  },
  {
    indexText: '03',
    title: '解锁研学报告',
    desc: '暗号图案全部解锁后，当前设备上的研学报告会进入可查看状态。'
  }
]

function buildSectionCaption(currentFilter, collectedCount, pendingCount) {
  if (currentFilter === 'checked') {
    return `当前展示 ${collectedCount} 枚已收集的暗号图案`
  }

  if (currentFilter === 'unchecked') {
    return `当前展示 ${pendingCount} 枚待收集的暗号图案`
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
    return `学员 ${normalizedStudentName} · 编号 ${normalizedStudentCode}`
  }

  if (normalizedStudentName) {
    return `学员 ${normalizedStudentName}`
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
  hasCachedPdf = false,
  hasRequested = false
} = {}) {
  if (hasCachedPdf) {
    return '答题卡已扫描，研学报告 PDF 已缓存，可前往“我的档案”查看。'
  }

  if (hasRequested) {
    return '答题卡已提交，请勿重复扫描；稍后可在“我的档案”查看研学报告。'
  }

  return '填写学员信息后拍摄答题卡，系统将自动识别并生成研学报告 PDF。'
}

Page({
  data: {
    pageTitle: '暗号收集',
    navFadeHeight: 50,
    navBackground: 'rgba(255,255,255,0)',
    navTheme: 'dark',
    filterOptions: SECRET_FILTER_OPTIONS,
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
    scanTip: '填写学员信息后拍摄答题卡，系统将自动识别并生成研学报告 PDF。',
    manualCollectEnabled: ENABLE_MANUAL_SECRET_COLLECTION_FOR_TESTING,
    manualCollectTip: ENABLE_MANUAL_SECRET_COLLECTION_FOR_TESTING
      ? '当前为测试模式，列表中的“测试标记”按钮仅用于功能联调；正式使用时仍以现场收集和答题卡识别为准。'
      : '正式模式下请通过现场收集与答题卡拍照生成报告，学生不能手动标记暗号。',
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
    generatedReportWarningText: ''
  },

  onLoad(options = {}) {
    this.entryMapPointId = normalizeOptionValue(options.mapPointId)
    this.entrySecretId = normalizeOptionValue(options.secretId)
    this.entryTargetHintShown = false
    this.refreshPageState()
  },

  onShow() {
    this.refreshPageState()
  },

  noop() {},

  getWorksheetEntryState() {
    const hasCachedPdf = studyReportService.hasLatestPdfUrl()
    const hasRequested = studyReportService.hasScanRequestRecord()

    return {
      hasCachedPdf,
      hasRequested,
      blocked: hasCachedPdf || hasRequested
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
    const visibleSecretList = filterSecretList(collectionState.secretList, currentFilter)
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

    this.setData({
      ...collectionState,
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

  buildGeneratedReportCardState() {
    const cachedPdfUrl = studyReportService.getLatestPdfUrl()
    const generatedReportPdfTempPath = String(this.data.generatedReportPdfTempPath || '').trim()
    const generatedReportPdfSavedPath = String(this.data.generatedReportPdfSavedPath || '').trim()
    const generatedReportStudentName = String(this.data.generatedReportStudentName || '').trim()
    const generatedReportStudentCode = String(this.data.generatedReportStudentCode || '').trim()
    const generatedReportPdfTitle = String(this.data.generatedReportPdfTitle || '').trim()
      || normalizePdfTitle(generatedReportPdfSavedPath)
      || normalizePdfTitle(generatedReportPdfTempPath)
      || GENERATED_REPORT_PDF_FILE_NAME
    const generatedReportReady = !!(cachedPdfUrl || generatedReportPdfTempPath || generatedReportPdfSavedPath)

    if (!generatedReportReady) {
      return {
        generatedReportReady: false,
        generatedReportDescText: '',
        generatedReportRemotePdfUrl: '',
        generatedReportPdfTitle: '',
        generatedReportPdfSavedPath: '',
        generatedReportPdfTempPath: '',
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
        title: '已经扫描过答题卡',
        icon: 'none',
        duration: 1800
      })
      return
    }

    this.setData({
      showWorksheetDialog: true
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
        onProgress: (payload) => {
          showTaskLoading(resolveStudyReportLoadingTitle(payload))
        }
      })

      const pdfTempFilePath = await this.prepareGeneratedPdfFile(result?.pdfDescriptor)

      const warningText = Array.isArray(result?.payload?.warnings) && result.payload.warnings.length
        ? result.payload.warnings.join('；')
        : ''
      const generatedReportGeneratedAtText = formatDateTimeText(result?.payload?.generated_at || '')
      const generatedReportPdfTitle = buildPdfFileName(worksheetStudentName, worksheetStudentCode)

      this.setData({
        generatedReportReady: true,
        generatedReportStudentName: worksheetStudentName,
        generatedReportStudentCode: worksheetStudentCode,
        generatedReportDescText: buildGeneratedReportDescText(worksheetStudentName, worksheetStudentCode),
        generatedReportPdfTitle: generatedReportPdfTitle || normalizePdfTitle(pdfTempFilePath),
        generatedReportPdfTempPath: pdfTempFilePath,
        generatedReportPdfSavedPath: '',
        generatedReportRemotePdfUrl: studyReportService.getLatestPdfUrl(),
        generatedReportGeneratedAtText,
        generatedReportWarningText: warningText
      })

      this.refreshPageState()

      wx.showToast({
        title: '研学报告已生成',
        icon: 'success',
        duration: 1800
      })

      this.previewGeneratedPdfFile(pdfTempFilePath)
    } catch (error) {
      this.refreshPageState()
      wx.showToast({
        title: error?.message || '研学报告生成失败',
        icon: 'none',
        duration: 2200
      })
    } finally {
      wx.hideLoading()
      this.setData({
        worksheetTaskRunning: false
      })
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
    try {
      const filePath = await this.ensureGeneratedReportPdfFile()
      this.previewGeneratedPdfFile(filePath)
    } catch (error) {
      wx.showToast({
        title: error?.message || 'PDF 预览失败',
        icon: 'none',
        duration: 1800
      })
    }
  },

  async onSaveGeneratedReportTap() {
    let tempFilePath = ''

    try {
      const existingSavedPath = String(this.data.generatedReportPdfSavedPath || '').trim()
      if (existingSavedPath) {
        try {
          await accessFileSystemPath(existingSavedPath)
          wx.showToast({
            title: '报告已保存到本地',
            icon: 'success',
            duration: 1600
          })
          return
        } catch (error) {
          this.setData({
            generatedReportPdfSavedPath: ''
          })
        }
      }

      tempFilePath = await this.ensureGeneratedReportPdfFile()
    } catch (error) {
      wx.showToast({
        title: error?.message || '当前没有可保存的报告',
        icon: 'none',
        duration: 1800
      })
      return
    }

    const savedFilePath = buildGeneratedReportSavedFilePath()

    try {
      if (tempFilePath === savedFilePath) {
        this.setData({
          generatedReportPdfTitle: GENERATED_REPORT_PDF_FILE_NAME,
          generatedReportPdfSavedPath: savedFilePath
        })

        wx.showToast({
          title: '报告已保存到本地',
          icon: 'success',
          duration: 1600
        })
        return
      }

      const finalFilePath = await copyLocalFileToPath(tempFilePath, savedFilePath)
      this.setData({
        generatedReportPdfTitle: GENERATED_REPORT_PDF_FILE_NAME,
        generatedReportPdfTempPath: finalFilePath,
        generatedReportPdfSavedPath: finalFilePath
      })

      wx.showToast({
        title: '报告已保存',
        icon: 'success',
        duration: 1600
      })
    } catch (error) {
      wx.showToast({
        title: 'PDF 保存失败',
        icon: 'none',
        duration: 1800
      })
    }
  },

  onToggleCheckin(event) {
    if (!this.data.manualCollectEnabled) {
      wx.showToast({
        title: '正式模式下仅支持扫码收集',
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
})
