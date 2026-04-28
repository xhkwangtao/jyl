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

function buildClientRequestId() {
  return `jyl-study-report-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function buildPdfFileName(studentName, studentCode) {
  const normalizeText = (value, fallbackValue) => {
    const rawText = String(value || '').trim().replace(/[\\/:*?"<>|]/g, '-')
    return rawText || fallbackValue
  }

  const safeName = normalizeText(studentName, '学员')
  const safeCode = normalizeText(studentCode, '未编号')
  return `${safeName}-${safeCode}-九眼楼研学报告.pdf`
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
  return pathParts[pathParts.length - 1] || '九眼楼研学报告.pdf'
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

function isPersistentLocalFile(filePath = '') {
  const normalizedPath = String(filePath || '').trim()
  return !!normalizedPath && normalizedPath.startsWith(`${wx.env.USER_DATA_PATH}/`)
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
    generatedReportPdfTitle: '',
    generatedReportPdfTempPath: '',
    generatedReportPdfSavedPath: '',
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
      visibleCount: visibleSecretList.length,
      sectionCaption: buildSectionCaption(currentFilter, collectionState.collectedCount, collectionState.pendingCount)
    }, () => {
      this.notifyEntryTarget(targetSecret)
    })
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

    wx.showLoading({
      title: 'AI识别中...',
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
        scene: 'qrcode:study-report',
        clientRequestId: buildClientRequestId()
      })

      const pdfTempFilePath = await this.prepareGeneratedPdfFile(
        result?.pdfDescriptor,
        buildPdfFileName(worksheetStudentName, worksheetStudentCode)
      )

      const warningText = Array.isArray(result?.payload?.warnings) && result.payload.warnings.length
        ? result.payload.warnings.join('；')
        : ''
      const generatedReportGeneratedAtText = formatDateTimeText(result?.payload?.generated_at || '')
      const generatedReportPdfTitle = String(result?.pdfDescriptor?.fileName || '').trim()
        || buildPdfFileName(worksheetStudentName, worksheetStudentCode)

      this.setData({
        generatedReportReady: true,
        generatedReportStudentName: worksheetStudentName,
        generatedReportStudentCode: worksheetStudentCode,
        generatedReportPdfTitle: generatedReportPdfTitle || normalizePdfTitle(pdfTempFilePath),
        generatedReportPdfTempPath: pdfTempFilePath,
        generatedReportPdfSavedPath: isPersistentLocalFile(pdfTempFilePath) ? pdfTempFilePath : '',
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

  prepareGeneratedPdfFile(pdfDescriptor, fallbackFileName) {
    if (!pdfDescriptor) {
      return Promise.reject(new Error('接口未返回 PDF 文件'))
    }

    if (pdfDescriptor.type === 'base64' && pdfDescriptor.base64) {
      return new Promise((resolve, reject) => {
        const fileSystemManager = wx.getFileSystemManager()
        const targetFilePath = `${wx.env.USER_DATA_PATH}/${fallbackFileName || pdfDescriptor.fileName || `study-report-${Date.now()}.pdf`}`

        fileSystemManager.writeFile({
          filePath: targetFilePath,
          data: pdfDescriptor.base64,
          encoding: 'base64',
          success: () => resolve(targetFilePath),
          fail: () => reject(new Error('PDF 文件写入失败'))
        })
      })
    }

    if (pdfDescriptor.type === 'url' && pdfDescriptor.url) {
      return new Promise((resolve, reject) => {
        wx.downloadFile({
          url: pdfDescriptor.url,
          success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
              resolve(res.tempFilePath)
              return
            }

            reject(new Error('PDF 文件下载失败'))
          },
          fail: () => {
            reject(new Error('PDF 文件下载失败'))
          }
        })
      })
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

  onPreviewGeneratedReportTap() {
    this.previewGeneratedPdfFile(this.data.generatedReportPdfTempPath)
  },

  onSaveGeneratedReportTap() {
    const tempFilePath = String(this.data.generatedReportPdfTempPath || '').trim()

    if (!tempFilePath) {
      wx.showToast({
        title: '当前没有可保存的报告',
        icon: 'none',
        duration: 1800
      })
      return
    }

    if (this.data.generatedReportPdfSavedPath) {
      wx.showToast({
        title: '报告已保存到本地',
        icon: 'success',
        duration: 1600
      })
      return
    }

    wx.saveFile({
      tempFilePath,
      success: (res) => {
        this.setData({
          generatedReportPdfSavedPath: res.savedFilePath || ''
        })

        wx.showToast({
          title: '报告已保存',
          icon: 'success',
          duration: 1600
        })
      },
      fail: () => {
        wx.showToast({
          title: 'PDF 保存失败',
          icon: 'none',
          duration: 1800
        })
      }
    })
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
