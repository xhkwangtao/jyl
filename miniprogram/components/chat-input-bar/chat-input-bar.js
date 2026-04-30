const RECORD_PERMISSION_SCOPE = 'scope.record'
const RECORD_PERMISSION_TOAST_TITLE = '麦克风权限已开启，请重新按住说话'
const RECORD_PERMISSION_MODAL_TITLE = '需要麦克风权限'
const RECORD_PERMISSION_MODAL_CONTENT = '语音提问需要使用麦克风，请在设置中允许后重试。'

function isPermissionDeniedError(error) {
  const errorMessage = String(error?.errMsg || error?.message || '').trim()
  return /auth deny|auth denied|authorize no response|permission/i.test(errorMessage)
}

Component({
  properties: {
    disabled: {
      type: Boolean,
      value: false
    },
    isGenerating: {
      type: Boolean,
      value: false
    }
  },

  data: {
    inputValue: '',
    isFocused: false,
    isVoiceMode: false,
    isRecording: false,
    recordingTime: 0,
    isSending: false
  },

  lifetimes: {
    attached() {
      this.initRecorderManager()
    },

    detached() {
      this.clearRecordTimer()
      this.teardownRecorderManager()
    }
  },

  methods: {
    initRecorderManager() {
      if (this._recorderManager || !wx || typeof wx.getRecorderManager !== 'function') {
        return
      }

      this._recorderManager = wx.getRecorderManager()
      if (this._recorderManager && typeof this._recorderManager.onStop === 'function') {
        this._recorderManager.onStop((result) => {
          this.handleRecorderStop(result || {})
        })
      }
      if (this._recorderManager && typeof this._recorderManager.onError === 'function') {
        this._recorderManager.onError((error) => {
          this.handleRecorderError(error || {})
        })
      }
    },

    teardownRecorderManager() {
      this._recorderManager = null
    },

    getRecordPermissionState() {
      if (!wx || typeof wx.getSetting !== 'function') {
        return Promise.resolve(true)
      }

      return new Promise((resolve) => {
        wx.getSetting({
          success: ({ authSetting = {} }) => {
            resolve(!!authSetting[RECORD_PERMISSION_SCOPE])
          },
          fail: () => {
            resolve(true)
          }
        })
      })
    },

    requestRecordPermission() {
      if (!wx || typeof wx.authorize !== 'function') {
        return Promise.resolve({
          granted: false
        })
      }

      return new Promise((resolve) => {
        wx.authorize({
          scope: RECORD_PERMISSION_SCOPE,
          success: () => {
            resolve({
              granted: true
            })
          },
          fail: (error) => {
            resolve({
              granted: false,
              error
            })
          }
        })
      })
    },

    promptRecordPermissionSetting() {
      if (!wx || typeof wx.showModal !== 'function') {
        return
      }

      wx.showModal({
        title: RECORD_PERMISSION_MODAL_TITLE,
        content: RECORD_PERMISSION_MODAL_CONTENT,
        confirmText: '去设置',
        success: (modalResult) => {
          if (!modalResult.confirm || !wx || typeof wx.openSetting !== 'function') {
            return
          }

          wx.openSetting({
            fail: () => {}
          })
        }
      })
    },

    async ensureRecordPermission() {
      const hasPermission = await this.getRecordPermissionState()
      if (hasPermission) {
        return true
      }

      const permissionResult = await this.requestRecordPermission()
      if (permissionResult.granted) {
        if (wx && typeof wx.showToast === 'function') {
          wx.showToast({
            title: RECORD_PERMISSION_TOAST_TITLE,
            icon: 'none',
            duration: 1800
          })
        }
        return false
      }

      this.promptRecordPermissionSetting()
      return false
    },

    startVoiceRecording() {
      this.initRecorderManager()
      if (!this._recorderManager || typeof this._recorderManager.start !== 'function') {
        if (wx && typeof wx.showToast === 'function') {
          wx.showToast({
            title: '当前环境不支持录音',
            icon: 'none',
            duration: 1600
          })
        }
        return
      }

      this.clearRecordTimer()
      this.setData({
        isRecording: true,
        recordingTime: 0
      })

      if (typeof wx.vibrateShort === 'function') {
        wx.vibrateShort({
          type: 'light'
        })
      }

      try {
        this._recorderManager.start({
          duration: 60000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'mp3'
        })
      } catch (error) {
        this.handleRecorderError(error)
        return
      }

      this._recordTimer = setInterval(() => {
        this.setData({
          recordingTime: this.data.recordingTime + 1
        })
      }, 1000)
    },

    onInput(event) {
      this.setData({
        inputValue: event.detail.value || ''
      })
    },

    onFocus() {
      this.setData({
        isFocused: true
      })
    },

    onBlur() {
      this.setData({
        isFocused: false
      })
    },

    onModeChange() {
      if (this.properties.isGenerating) {
        return
      }

      if (typeof wx.vibrateShort === 'function') {
        wx.vibrateShort({
          type: 'light'
        })
      }

      this.clearRecordTimer()
      this.setData({
        isVoiceMode: !this.data.isVoiceMode,
        isRecording: false,
        recordingTime: 0
      })
    },

    onTextConfirm() {
      this.onSendTap()
    },

    onSendTap() {
      if (this.properties.disabled || this.properties.isGenerating) {
        return
      }

      const message = this.data.inputValue.trim()

      if (!message) {
        return
      }

      if (this.data.isSending) {
        return
      }

      if (typeof wx.vibrateShort === 'function') {
        wx.vibrateShort({
          type: 'light'
        })
      }

      this.setData({
        isSending: true
      })

      this.triggerEvent('send', {
        message
      })

      this.setData({
        inputValue: ''
      })

      setTimeout(() => {
        this.setData({
          isSending: false
        })
      }, 260)
    },

    onStopTap() {
      this.triggerEvent('stopGeneration')
    },

    onAddTap() {
      this.triggerEvent('add')
    },

    async onVoiceStart() {
      if (this.properties.disabled || this.properties.isGenerating) {
        return
      }

      const hasPermission = await this.ensureRecordPermission()
      if (!hasPermission) {
        return
      }

      this.startVoiceRecording()
    },

    onVoiceMove() {
      return false
    },

    onVoiceEnd() {
      if (!this.data.isRecording) {
        return
      }

      const duration = Math.max(this.data.recordingTime, 1)

      this.clearRecordTimer()
      this.setData({
        isRecording: false,
        recordingTime: 0
      })

      this._pendingVoiceDuration = duration
      if (this._recorderManager && typeof this._recorderManager.stop === 'function') {
        this._recorderManager.stop()
      }
    },

    onVoiceCancel() {
      this.clearRecordTimer()
      this.setData({
        isRecording: false,
        recordingTime: 0
      })
    },

    clearRecordTimer() {
      if (this._recordTimer) {
        clearInterval(this._recordTimer)
        this._recordTimer = null
      }
    },

    handleRecorderStop(result = {}) {
      const tempFilePath = result.tempFilePath || ''
      const duration = Math.max(
        Math.round((Number(result.duration) || 0) / 1000),
        this._pendingVoiceDuration || 1
      )
      this._pendingVoiceDuration = 0

      if (!tempFilePath) {
        this.handleRecorderError()
        return
      }

      const fileSystem = wx && typeof wx.getFileSystemManager === 'function'
        ? wx.getFileSystemManager()
        : null

      if (!fileSystem || typeof fileSystem.readFile !== 'function') {
        this.handleRecorderError()
        return
      }

      fileSystem.readFile({
        filePath: tempFilePath,
        encoding: 'base64',
        success: (fileResult) => {
          const audioData = fileResult && fileResult.data ? String(fileResult.data) : ''
          if (!audioData) {
            this.handleRecorderError()
            return
          }

          this.triggerEvent('voiceSend', {
            duration,
            audioData,
            audioFormat: 'mp3'
          })
        },
        fail: () => {
          this.handleRecorderError()
        }
      })
    },

    handleRecorderError(error = {}) {
      this.clearRecordTimer()
      this._pendingVoiceDuration = 0
      this.setData({
        isRecording: false,
        recordingTime: 0
      })

      if (isPermissionDeniedError(error)) {
        this.promptRecordPermissionSetting()
        return
      }

      if (wx && typeof wx.showToast === 'function') {
        wx.showToast({
          title: '录音失败，请重试',
          icon: 'none',
          duration: 1600
        })
      }
    }
  }
})
