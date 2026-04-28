const auth = require('../../utils/auth')
const studyReportService = require('../../services/study-report-service')
const {
  POSTER_CANVAS_WIDTH,
  POSTER_CANVAS_HEIGHT,
  POSTER_EXPORT_WIDTH,
  POSTER_EXPORT_HEIGHT,
  renderStudyReportPoster
} = require('../../utils/study-report-poster')

const PAGE_STYLE = 'background: #e8edf3;'

function getLayoutMetrics() {
  try {
    const systemInfo = wx.getSystemInfoSync()
    const menuButton = typeof wx.getMenuButtonBoundingClientRect === 'function'
      ? wx.getMenuButtonBoundingClientRect()
      : null
    const statusBarHeight = systemInfo.statusBarHeight || 20
    const safeAreaBottom = systemInfo.safeArea
      ? Math.max(systemInfo.screenHeight - systemInfo.safeArea.bottom, 0)
      : 0

    if (!menuButton || !menuButton.height) {
      return {
        navBarHeight: statusBarHeight + 44,
        safeAreaBottom
      }
    }

    const navContentPaddingTop = Math.max(menuButton.top - statusBarHeight, 0)
    const navContentHeight = menuButton.height + navContentPaddingTop * 2

    return {
      navBarHeight: statusBarHeight + navContentHeight,
      safeAreaBottom
    }
  } catch (error) {
    return {
      navBarHeight: 84,
      safeAreaBottom: 0
    }
  }
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

function buildPosterPreviewCacheKey(reportRenderCache = {}) {
  return [
    Number(reportRenderCache?.recordId || 0),
    Number(reportRenderCache?.cachedAt || 0),
    String(reportRenderCache?.title || '').trim(),
    String(reportRenderCache?.studentCode || '').trim()
  ].join('::')
}

Page({
  data: {
    pageStyle: PAGE_STYLE,
    pageReady: false,
    navBarHeightStyle: '',
    reportRecordId: 0,
    posterPreviewCacheKey: '',
    reportTitle: '',
    reportSubtitle: '',
    reportMetaList: [],
    reportSectionList: [],
    posterPreviewPath: '',
    posterGenerating: false,
    posterErrorText: ''
  },

  onLoad() {
    const { navBarHeight, safeAreaBottom } = getLayoutMetrics()

    this.setData({
      navBarHeightStyle: `--nav-bar-height: ${navBarHeight}px; --page-safe-bottom: ${safeAreaBottom}px;`
    })

    this.refreshReportState()
  },

  onShow() {
    this.refreshReportState()
  },

  async refreshReportState() {
    let reportRenderCache = studyReportService.getLatestReportRenderCache()

    if (!reportRenderCache.hasContent) {
      const hasLogin = await auth.checkAndAutoLogin(2500).catch(() => false)

      if (hasLogin) {
        try {
          await studyReportService.getLatestReport({
            token: auth.getToken()
          })
        } catch (error) {
          if (Number(error?.statusCode) === 404) {
            studyReportService.persistEmptyLatestReport()
          }
        }

        reportRenderCache = studyReportService.getLatestReportRenderCache()
      }
    }

    if (!reportRenderCache.hasContent) {
      wx.showToast({
        title: '当前没有可查看的研学报告',
        icon: 'none',
        duration: 1800
      })

      setTimeout(() => {
        if (getCurrentPages().length > 1) {
          wx.navigateBack({
            delta: 1,
            fail: () => {
              wx.redirectTo({
                url: '/pages/my-page/my-page'
              })
            }
          })
          return
        }

        wx.redirectTo({
          url: '/pages/my-page/my-page'
        })
      }, 200)
      return
    }

    this.setData({
      pageReady: true,
      reportRecordId: reportRenderCache.recordId || 0,
      reportTitle: reportRenderCache.title,
      reportSubtitle: reportRenderCache.subtitle,
      reportMetaList: reportRenderCache.metaList,
      reportSectionList: reportRenderCache.sectionList
    })

    this.refreshPosterPreview(reportRenderCache)
  },

  getStudyReportPreviewCanvasNode() {
    if (this.studyReportPreviewCanvasPromise) {
      return this.studyReportPreviewCanvasPromise
    }

    this.studyReportPreviewCanvasPromise = new Promise((resolve, reject) => {
      const query = this.createSelectorQuery()
      query.select('#study-report-preview-canvas').fields({
        node: true,
        size: true
      }).exec((resultList) => {
        const canvasResult = Array.isArray(resultList) ? resultList[0] : null
        const canvasNode = canvasResult?.node || null

        if (!canvasNode) {
          this.studyReportPreviewCanvasPromise = null
          reject(new Error('研学报告预览初始化失败'))
          return
        }

        const systemInfo = wx.getSystemInfoSync()
        const pixelRatio = Number(systemInfo?.pixelRatio) || 1
        const context2d = canvasNode.getContext('2d')

        canvasNode.width = POSTER_CANVAS_WIDTH * pixelRatio
        canvasNode.height = POSTER_CANVAS_HEIGHT * pixelRatio

        this.studyReportPreviewCanvasInfo = {
          canvasNode,
          context2d,
          pixelRatio
        }

        resolve(this.studyReportPreviewCanvasInfo)
      })
    })

    return this.studyReportPreviewCanvasPromise
  },

  async generateStudyReportPosterPreviewTempFile(reportRenderCache) {
    const canvasInfo = await this.getStudyReportPreviewCanvasNode()
    const canvasNode = canvasInfo?.canvasNode
    const context2d = canvasInfo?.context2d
    const pixelRatio = Number(canvasInfo?.pixelRatio) || 1
    const exportWidth = Math.round(POSTER_EXPORT_WIDTH * pixelRatio)
    const exportHeight = Math.round(POSTER_EXPORT_HEIGHT * pixelRatio)

    if (!canvasNode || !context2d) {
      throw new Error('研学报告预览初始化失败')
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
        success: (result) => resolve(result.tempFilePath),
        fail: (error) => reject(new Error(error?.errMsg || '研学报告预览生成失败'))
      }, this)
    })
  },

  async refreshPosterPreview(reportRenderCache) {
    if (!reportRenderCache?.hasContent) {
      return
    }

    const previewCacheKey = buildPosterPreviewCacheKey(reportRenderCache)

    if (
      this.data.posterPreviewPath
      && this.data.posterPreviewCacheKey === previewCacheKey
    ) {
      return
    }

    const renderToken = Date.now()
    this.latestPosterRenderToken = renderToken

    this.setData({
      posterGenerating: true,
      posterErrorText: ''
    })

    try {
      const previewPath = await this.generateStudyReportPosterPreviewTempFile(reportRenderCache)
      if (this.latestPosterRenderToken !== renderToken) {
        return
      }

      this.setData({
        posterPreviewPath: previewPath,
        posterPreviewCacheKey: previewCacheKey,
        posterGenerating: false,
        posterErrorText: ''
      })
    } catch (error) {
      if (this.latestPosterRenderToken !== renderToken) {
        return
      }

      this.setData({
        posterPreviewPath: '',
        posterPreviewCacheKey: '',
        posterGenerating: false,
        posterErrorText: error?.message || '预览生成失败'
      })
    }
  },

  onBackTap() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({
        delta: 1
      })
      return
    }

    this.onHomeTap()
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
  },

  onOpenMyPage() {
    navigateToPage('/pages/my-page/my-page')
  },

  onOpenCollectionPage() {
    navigateToPage('/pages/check-in/check-in')
  }
})
