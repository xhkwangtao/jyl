const auth = require('../../utils/auth')
const studyReportService = require('../../services/study-report-service')
const {
  withPageAnalytics
} = require('../../utils/with-page-analytics')

const PAGE_STYLE = 'background: #eef3f5;'

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

function normalizeCardCode(value = '') {
  return String(value || '').replace(/\D+/g, '').slice(0, 3)
}

function buildStudyDateText() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function buildGroupDisplayName(group = {}) {
  const groupName = String(group.group_name || '').trim()
  const schoolName = String(group.school_name || '').trim()

  if (schoolName && groupName) {
    return `${schoolName} · ${groupName}`
  }

  return groupName || schoolName || '未命名研学团'
}

function buildGroupMetaText(group = {}) {
  const segmentList = []
  const visitDate = String(group.visit_date || '').trim()
  const status = String(group.status || '').trim()

  if (visitDate) {
    segmentList.push(`研学日期 ${visitDate}`)
  }

  if (status) {
    segmentList.push(`状态 ${status}`)
  }

  return segmentList.join(' · ')
}

function buildStudentReportStatusText(student = {}) {
  const reportStatus = String(student.report_status || '').trim().toLowerCase()

  switch (reportStatus) {
    case 'generated':
      return '报告已生成'
    case 'processing':
      return '报告生成中'
    case 'queued':
      return '任务排队中'
    case 'failed':
      return '报告生成失败'
    default:
      return '未开始生成'
  }
}

function buildStudentTimeText(student = {}) {
  const segmentList = []
  const scannedAt = String(student.scanned_at || '').trim()
  const reportGeneratedAt = String(student.report_generated_at || '').trim()

  if (scannedAt) {
    segmentList.push(`扫码时间 ${scannedAt}`)
  }

  if (reportGeneratedAt) {
    segmentList.push(`生成时间 ${reportGeneratedAt}`)
  }

  return segmentList.join(' · ')
}

function buildTaskStatusPresentation(payload = {}) {
  const status = String(payload?.status || '').trim().toLowerCase()

  if (status === 'generated') {
    return {
      tone: 'success',
      text: '研学报告已生成',
      hint: '可以直接进入预览页查看当前学生的研学报告。'
    }
  }

  if (status === 'processing') {
    return {
      tone: 'running',
      text: 'AI 正在识别答题卡',
      hint: '请稍候，系统正在生成当前学生的研学报告。'
    }
  }

  if (status === 'queued') {
    return {
      tone: 'running',
      text: '任务已提交，正在排队',
      hint: '答题卡图片已经上传成功，后台正在等待处理。'
    }
  }

  if (status === 'failed') {
    return {
      tone: 'error',
      text: '研学报告生成失败',
      hint: String(payload?.last_error || '').trim() || '请重新拍摄答题卡后再试一次。'
    }
  }

  return {
    tone: 'idle',
    text: '',
    hint: ''
  }
}

function buildStudentStatusToneByReportStatus(reportStatus = '') {
  switch (String(reportStatus || '').trim().toLowerCase()) {
    case 'generated':
      return 'success'
    case 'processing':
    case 'queued':
      return 'running'
    case 'failed':
      return 'error'
    default:
      return 'idle'
  }
}

function buildStudentListItem(student = {}, previousItem = null) {
  const classText = String(student?.class_name || '').trim()
  const timeText = buildStudentTimeText(student)
  const defaultStatusText = buildStudentReportStatusText(student)
  const defaultStatusTone = buildStudentStatusToneByReportStatus(student?.report_status)
  const isTaskRunning = previousItem?.isTaskRunning === true
  const uiTaskText = String(previousItem?.uiTaskText || '').trim() || defaultStatusText
  const uiTaskTone = String(previousItem?.uiTaskTone || '').trim() || defaultStatusTone
  const uiHintText = String(previousItem?.uiHintText || '').trim()

  return {
    ...student,
    classText,
    timeText,
    uiTaskText,
    uiTaskTone,
    uiHintText,
    isTaskRunning,
    actionText: isTaskRunning ? '处理中...' : '扫描答题卡'
  }
}

function sortStudentList(studentList = []) {
  return studentList.slice().sort((left, right) => {
    const leftCode = Number(String(left?.card_code || '').trim())
    const rightCode = Number(String(right?.card_code || '').trim())

    if (Number.isFinite(leftCode) && Number.isFinite(rightCode) && leftCode !== rightCode) {
      return leftCode - rightCode
    }

    return String(left?.card_code || '').localeCompare(String(right?.card_code || ''))
  })
}

Page(withPageAnalytics('/pages/staff-study-report/staff-study-report', {
  data: {
    pageStyle: PAGE_STYLE,
    pageTitle: '工作人员答题卡',
    pageReady: false,
    navBarHeightStyle: '',
    groupLoading: false,
    groupList: [],
    selectedGroupIndex: 0,
    selectedGroupId: 0,
    selectedGroupName: '',
    selectedGroupMetaText: '',
    selectedGroupStudentCount: 0,
    selectedGroupScannedCount: 0,
    selectedGroupGeneratedCount: 0,
    studentListLoading: false,
    studentList: [],
    cardCode: '',
    studentLookupLoading: false,
    currentStudent: null,
    currentStudentClassText: '',
    currentStudentTimeText: '',
    currentStudentReportStatusText: '',
    taskRunning: false,
    taskStatusTone: 'idle',
    taskStatusText: '',
    taskHintText: ''
  },

  onLoad() {
    const { navBarHeight, safeAreaBottom } = getLayoutMetrics()

    this.setData({
      navBarHeightStyle: `--nav-bar-height: ${navBarHeight}px; --page-safe-bottom: ${safeAreaBottom}px;`
    })

    this.initializePage()
  },

  onReady() {
    this.permissionGuard = this.selectComponent('#permissionGuard')
  },

  async initializePage() {
    const hasLogin = await auth.checkAndAutoLogin(2500).catch(() => false)

    if (!hasLogin) {
      wx.showToast({
        title: '登录失败，请重试',
        icon: 'none'
      })
      return
    }

    const permissionGuard = this.getPermissionGuard()
    if (permissionGuard) {
      const staffAccessResult = await permissionGuard.ensureStaffUser({
        redirectUrl: '/pages/check-in/check-in',
        redirectDelayMs: 200,
        showLoginToast: true
      })

      if (!staffAccessResult.allowed) {
        return
      }
    } else {
      try {
        await auth.syncCurrentUserProfile()
      } catch (error) {}

      if (!this.isStaffUser()) {
        wx.showToast({
          title: '当前账号不是工作人员',
          icon: 'none',
          duration: 1800
        })

        setTimeout(() => {
          wx.redirectTo({
            url: '/pages/check-in/check-in'
          })
        }, 200)
        return
      }
    }

    await this.loadActiveStudyGroups()

    this.setData({
      pageReady: true
    })
  },

  isStaffUser() {
    const permissionGuard = this.getPermissionGuard()
    if (permissionGuard) {
      return permissionGuard.isStaffUser()
    }

    const currentUserProfile = auth.getCachedCurrentUserProfile()
    const userInfo = auth.getUserInfo() || {}
    const userType = String(
      currentUserProfile?.user_type
      || userInfo?.user_type
      || ''
    ).trim().toLowerCase()

    return userType === 'staff'
  },

  getPermissionGuard() {
    if (this.permissionGuard) {
      return this.permissionGuard
    }

    this.permissionGuard = this.selectComponent('#permissionGuard')
    return this.permissionGuard || null
  },

  async loadActiveStudyGroups(preferredGroupId = 0) {
    if (this.data.groupLoading) {
      return
    }

    this.setData({
      groupLoading: true
    })

    try {
      const result = await studyReportService.listActiveStudyGroups({
        token: auth.getToken()
      })
      const groupList = (result.items || []).map((group) => ({
        ...group,
        displayName: buildGroupDisplayName(group)
      }))

      let selectedGroupIndex = 0

      if (preferredGroupId > 0) {
        const matchedIndex = groupList.findIndex((group) => Number(group.id) === Number(preferredGroupId))
        if (matchedIndex >= 0) {
          selectedGroupIndex = matchedIndex
        }
      }

      const selectedGroup = groupList[selectedGroupIndex] || null

      this.setData({
        groupList,
        selectedGroupIndex,
        selectedGroupId: Number(selectedGroup?.id || 0) || 0,
        selectedGroupName: selectedGroup?.displayName || '',
        selectedGroupMetaText: buildGroupMetaText(selectedGroup || {}),
        selectedGroupStudentCount: Number(selectedGroup?.student_count || 0) || 0,
        selectedGroupScannedCount: Number(selectedGroup?.scanned_count || 0) || 0,
        selectedGroupGeneratedCount: Number(selectedGroup?.generated_count || 0) || 0
      })

      if (selectedGroup?.id) {
        await this.loadStudyGroupStudents(selectedGroup.id)
      } else {
        this.setData({
          studentList: []
        })
      }
    } catch (error) {
      wx.showToast({
        title: error?.message || '研学团查询失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        groupLoading: false
      })
    }
  },

  resetStudentState() {
    this.setData({
      currentStudent: null,
      currentStudentClassText: '',
      currentStudentTimeText: '',
      currentStudentReportStatusText: '',
      taskRunning: false,
      taskStatusTone: 'idle',
      taskStatusText: '',
      taskHintText: ''
    })
  },

  findStudentByCardCode(cardCode = '') {
    const normalizedCardCode = String(cardCode || '').trim()

    if (!normalizedCardCode) {
      return null
    }

    return (this.data.studentList || []).find((item) => String(item?.card_code || '').trim() === normalizedCardCode) || null
  },

  updateStudentListItem(cardCode = '', updater = {}) {
    const normalizedCardCode = String(cardCode || '').trim()

    if (!normalizedCardCode) {
      return null
    }

    let matchedStudent = null
    const nextStudentList = (this.data.studentList || []).map((item) => {
      if (String(item?.card_code || '').trim() !== normalizedCardCode) {
        return item
      }

      const patch = typeof updater === 'function' ? updater(item) : updater
      const nextItem = {
        ...item,
        ...(patch && typeof patch === 'object' ? patch : {})
      }

      if (!nextItem.actionText) {
        nextItem.actionText = nextItem.isTaskRunning ? '处理中...' : '扫描答题卡'
      }

      matchedStudent = nextItem
      return nextItem
    })

    const nextData = {
      studentList: nextStudentList
    }

    if (this.data.currentStudent && String(this.data.currentStudent.card_code || '').trim() === normalizedCardCode && matchedStudent) {
      nextData.currentStudent = matchedStudent
      nextData.currentStudentClassText = matchedStudent.classText || '未配置班级信息'
      nextData.currentStudentTimeText = matchedStudent.timeText || ''
      nextData.currentStudentReportStatusText = buildStudentReportStatusText(matchedStudent)
    }

    this.setData(nextData)
    return matchedStudent
  },

  setCurrentStudent(student = null) {
    if (!student) {
      this.resetStudentState()
      return
    }

    this.setData({
      currentStudent: student,
      currentStudentClassText: student.classText || String(student?.class_name || '').trim() || '未配置班级信息',
      currentStudentTimeText: student.timeText || buildStudentTimeText(student),
      currentStudentReportStatusText: buildStudentReportStatusText(student)
    })
  },

  async loadStudyGroupStudents(groupId = 0) {
    const normalizedGroupId = Number(groupId || this.data.selectedGroupId || 0) || 0

    if (!normalizedGroupId) {
      this.setData({
        studentList: [],
        studentListLoading: false
      })
      return
    }

    this.setData({
      studentListLoading: true
    })

    try {
      const result = await studyReportService.listStudyGroupStudents({
        token: auth.getToken(),
        groupId: normalizedGroupId,
        limit: Math.min(Math.max(Number(this.data.selectedGroupStudentCount || 200) || 200, 200), 500)
      })
      const previousItemMap = (this.data.studentList || []).reduce((accumulator, item) => {
        accumulator[String(item?.card_code || '').trim()] = item
        return accumulator
      }, {})
      const studentList = sortStudentList(
        (result.items || []).map((student) => buildStudentListItem(
          student,
          previousItemMap[String(student?.card_code || '').trim()] || null
        ))
      )
      const currentStudentCardCode = String(this.data.currentStudent?.card_code || '').trim()
      const nextCurrentStudent = currentStudentCardCode
        ? studentList.find((item) => String(item?.card_code || '').trim() === currentStudentCardCode) || null
        : null

      this.setData({
        studentList,
        currentStudent: nextCurrentStudent,
        currentStudentClassText: nextCurrentStudent ? (nextCurrentStudent.classText || '未配置班级信息') : '',
        currentStudentTimeText: nextCurrentStudent ? (nextCurrentStudent.timeText || '') : '',
        currentStudentReportStatusText: nextCurrentStudent ? buildStudentReportStatusText(nextCurrentStudent) : ''
      })
    } catch (error) {
      wx.showToast({
        title: error?.message || '学生列表查询失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        studentListLoading: false
      })
    }
  },

  onGroupChange(event) {
    const selectedGroupIndex = Number(event?.detail?.value || 0) || 0
    const selectedGroup = this.data.groupList[selectedGroupIndex] || null

    this.resetStudentState()
    this.setData({
      selectedGroupIndex,
      selectedGroupId: Number(selectedGroup?.id || 0) || 0,
      selectedGroupName: selectedGroup?.displayName || '',
      selectedGroupMetaText: buildGroupMetaText(selectedGroup || {}),
      selectedGroupStudentCount: Number(selectedGroup?.student_count || 0) || 0,
      selectedGroupScannedCount: Number(selectedGroup?.scanned_count || 0) || 0,
      selectedGroupGeneratedCount: Number(selectedGroup?.generated_count || 0) || 0
    })

    this.loadStudyGroupStudents(selectedGroup?.id || 0)
  },

  onCardCodeInput(event) {
    this.setData({
      cardCode: normalizeCardCode(event?.detail?.value || '')
    })
  },

  async onLookupStudentTap() {
    if (this.data.studentLookupLoading) {
      return
    }

    if (!this.data.selectedGroupId) {
      wx.showToast({
        title: '请先选择研学团',
        icon: 'none'
      })
      return
    }

    if (!this.data.cardCode) {
      wx.showToast({
        title: '请输入答题卡编号',
        icon: 'none'
      })
      return
    }

    this.setData({
      studentLookupLoading: true
    })

    try {
      const student = await studyReportService.getStudyGroupStudentByCardCode({
        token: auth.getToken(),
        groupId: this.data.selectedGroupId,
        cardCode: this.data.cardCode
      })
      const matchedStudent = this.findStudentByCardCode(student.card_code)
      const resolvedStudent = matchedStudent || buildStudentListItem(student)

      this.setCurrentStudent(resolvedStudent)
      await this.refreshStudentReportJobStatus(student.card_code)
    } catch (error) {
      this.resetStudentState()
      wx.showToast({
        title: error?.message || '学生信息查询失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        studentLookupLoading: false
      })
    }
  },

  async refreshStudentReportJobStatus(cardCode = '') {
    const currentStudent = this.data.currentStudent
    const targetCardCode = String(cardCode || currentStudent?.card_code || '').trim()

    if (!targetCardCode || !this.data.selectedGroupId) {
      return
    }

    try {
      const payload = await studyReportService.getStudyGroupStudentReportJob({
        token: auth.getToken(),
        groupId: this.data.selectedGroupId,
        cardCode: targetCardCode
      })
      this.applyTaskPayload(payload, {
        cardCode: targetCardCode
      })
    } catch (error) {
      if (Number(error?.statusCode) === 404) {
        const currentStudentFromList = this.findStudentByCardCode(targetCardCode) || currentStudent
        this.updateStudentListItem(targetCardCode, {
          report_status: 'not_started',
          uiTaskTone: 'idle',
          uiTaskText: '当前学生还没有提交过答题卡',
          uiHintText: '请拍摄答题卡后提交研学报告任务。',
          isTaskRunning: false,
          actionText: '扫描答题卡'
        })

        if (currentStudentFromList) {
          this.setCurrentStudent({
            ...currentStudentFromList,
            report_status: 'not_started'
          })
        }

        this.setData({
          taskStatusTone: 'idle',
          taskStatusText: '当前学生还没有提交过答题卡',
          taskHintText: '请拍摄答题卡后提交研学报告任务。'
        })
        return
      }

      wx.showToast({
        title: error?.message || '任务状态查询失败',
        icon: 'none'
      })
    }
  },

  applyTaskPayload(payload = {}, options = {}) {
    const targetCardCode = String(
      options.cardCode
      || this.data.currentStudent?.card_code
      || ''
    ).trim()
    const currentStudent = this.findStudentByCardCode(targetCardCode) || this.data.currentStudent || {}
    const statusPresentation = buildTaskStatusPresentation(payload)
    const nextReportStatus = String(payload?.status || currentStudent?.report_status || '').trim().toLowerCase()
    const nextStatusTone = statusPresentation.tone || buildStudentStatusToneByReportStatus(nextReportStatus)
    const nextStatusText = statusPresentation.text || buildStudentReportStatusText({
      ...currentStudent,
      report_status: nextReportStatus
    })
    const nextIsTaskRunning = nextReportStatus === 'queued' || nextReportStatus === 'processing'

    if (targetCardCode) {
      this.updateStudentListItem(targetCardCode, {
        report_status: nextReportStatus || currentStudent?.report_status,
        scan_status: nextReportStatus ? 'scanned' : currentStudent?.scan_status,
        uiTaskTone: nextStatusTone,
        uiTaskText: nextStatusText,
        uiHintText: statusPresentation.hint || '',
        isTaskRunning: nextIsTaskRunning,
        actionText: nextIsTaskRunning ? '处理中...' : '扫描答题卡'
      })
    }

    this.setData({
      taskStatusTone: statusPresentation.tone,
      taskStatusText: statusPresentation.text,
      taskHintText: statusPresentation.hint,
      currentStudentReportStatusText: buildStudentReportStatusText({
        ...currentStudent,
        report_status: payload?.status || currentStudent?.report_status
      })
    })
  },

  onRefreshStudentStatusTap() {
    this.refreshStudentReportJobStatus()
  },

  onStudentScanTap(event) {
    const cardCode = String(event?.currentTarget?.dataset?.cardCode || '').trim()
    const student = this.findStudentByCardCode(cardCode)

    if (!student || student.isTaskRunning) {
      return
    }

    this.setCurrentStudent(student)
    this.openStudentCapture(student)
  },

  onCaptureWorksheetTap() {
    if (this.data.taskRunning) {
      return
    }

    if (!this.data.currentStudent || !this.data.selectedGroupId) {
      wx.showToast({
        title: '请先查询学生',
        icon: 'none'
      })
      return
    }

    this.openStudentCapture(this.data.currentStudent)
  },

  openStudentCapture(student = null) {
    const resolvedStudent = student || this.data.currentStudent

    if (!resolvedStudent || !this.data.selectedGroupId) {
      return
    }

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera'],
      success: (result = {}) => {
        const filePath = Array.isArray(result.tempFilePaths) ? result.tempFilePaths[0] : ''
        if (!filePath) {
          return
        }

        this.startGenerateStudyGroupStudentReport(filePath, resolvedStudent)
      }
    })
  },

  async startGenerateStudyGroupStudentReport(filePath, targetStudent = null) {
    const currentStudent = targetStudent || this.data.currentStudent

    if (!currentStudent || !filePath) {
      return
    }

    this.setCurrentStudent(currentStudent)
    this.setData({
      taskRunning: true,
      taskStatusTone: 'running',
      taskStatusText: '正在上传答题卡',
      taskHintText: '请稍候，系统正在提交并生成当前学生的研学报告。'
    })
    this.updateStudentListItem(currentStudent.card_code, {
      uiTaskTone: 'running',
      uiTaskText: '正在上传答题卡',
      uiHintText: '请稍候，系统正在提交并生成当前学生的研学报告。',
      isTaskRunning: true,
      actionText: '处理中...'
    })

    try {
      const result = await studyReportService.generateStudyGroupStudentReport({
        token: auth.getToken(),
        groupId: this.data.selectedGroupId,
        cardCode: currentStudent.card_code,
        filePath,
        studyDate: buildStudyDateText(),
        onProgress: (payload) => {
          if (payload?.phase === 'uploading') {
            this.updateStudentListItem(currentStudent.card_code, {
              uiTaskTone: 'running',
              uiTaskText: '正在上传答题卡',
              uiHintText: '图片上传完成后会自动提交识别任务。',
              isTaskRunning: true,
              actionText: '处理中...'
            })
            this.setData({
              taskStatusTone: 'running',
              taskStatusText: '正在上传答题卡',
              taskHintText: '图片上传完成后会自动提交识别任务。'
            })
            return
          }

          if (payload?.phase === 'submitting') {
            this.updateStudentListItem(currentStudent.card_code, {
              uiTaskTone: 'running',
              uiTaskText: '正在提交识别任务',
              uiHintText: '后台已收到答题卡图片，正在创建报告任务。',
              isTaskRunning: true,
              actionText: '处理中...'
            })
            this.setData({
              taskStatusTone: 'running',
              taskStatusText: '正在提交识别任务',
              taskHintText: '后台已收到答题卡图片，正在创建报告任务。'
            })
            return
          }

          this.applyTaskPayload(payload, {
            cardCode: currentStudent.card_code
          })
        }
      })

      this.applyTaskPayload(result.payload || {}, {
        cardCode: currentStudent.card_code
      })
      await this.loadActiveStudyGroups(this.data.selectedGroupId)

      wx.showToast({
        title: '报告生成成功',
        icon: 'success'
      })
    } catch (error) {
      this.updateStudentListItem(currentStudent.card_code, {
        report_status: 'failed',
        uiTaskTone: 'error',
        uiTaskText: '研学报告生成失败',
        uiHintText: error?.message || '请重新拍摄答题卡后再试一次。',
        isTaskRunning: false,
        actionText: '扫描答题卡'
      })
      this.setData({
        taskStatusTone: 'error',
        taskStatusText: '研学报告生成失败',
        taskHintText: error?.message || '请重新拍摄答题卡后再试一次。'
      })

      wx.showToast({
        title: error?.message || '研学报告生成失败',
        icon: 'none',
        duration: 2200
      })
    } finally {
      this.setData({
        taskRunning: false
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

    wx.redirectTo({
      url: '/pages/index/index'
    })
  },

  onHomeTap() {
    wx.reLaunch({
      url: '/pages/index/index'
    })
  }
}))
