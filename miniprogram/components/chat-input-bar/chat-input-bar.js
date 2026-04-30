function getRecorderBusyError(error = {}) {
  return String(error.errMsg || '').includes('is recording or paused')
}

function getRecorderNotStartedError(error = {}) {
  return String(error.errMsg || '').includes('recorder not start')
}

function getTouchPoint(event = {}) {
  if (Array.isArray(event.touches) && event.touches.length) {
    return event.touches[0]
  }

  if (Array.isArray(event.changedTouches) && event.changedTouches.length) {
    return event.changedTouches[0]
  }

  return null
}

Component({
  properties: {
    disabled: {
      type: Boolean,
      value: false
    },
    isGenerating: {
      type: Boolean,
      value: false,
      observer(newValue, oldValue) {
        if (oldValue === true && newValue === false) {
          this.setData({
            isFocused: true
          })
        }
      }
    }
  },

  data: {
    inputValue: '',
    isFocused: false,
    isSending: false,
    isVoiceMode: false,
    isRecording: false,
    recordingTime: 0
  },

  lifetimes: {
    attached() {
      this.initRecorderManager()
      this.recordingPending = false
      this._stopRequested = false
      this._discardNextRecorderStop = false
      this._recordingTimer = null
    },

    detached() {
      this.forceStopRecording({
        silent: true
      })
      this.clearRecordingTimer()
    }
  },

  methods: {
    initRecorderManager() {
      if (this.recorderManager || !wx || typeof wx.getRecorderManager !== 'function') {
        return
      }

      this.recorderManager = wx.getRecorderManager()

      if (typeof this.recorderManager.onStart === 'function') {
        this.recorderManager.onStart(() => {
          this.handleRecorderStart()
        })
      }

      if (typeof this.recorderManager.onStop === 'function') {
        this.recorderManager.onStop((result) => {
          this.handleRecorderStop(result || {})
        })
      }

      if (typeof this.recorderManager.onError === 'function') {
        this.recorderManager.onError((error) => {
          this.handleRecorderError(error || {})
        })
      }
    },

    onInput(event) {
      const value = event?.detail?.value || ''
      this.setData({
        inputValue: value
      })

      this.triggerEvent('input', {
        value,
        length: value.length
      })
    },

    onFocus(event = {}) {
      this.setData({
        isFocused: true
      })

      this.triggerEvent('focus', {
        keyboardHeight: event?.detail?.height || 0
      })
    },

    onBlur() {
      this.setData({
        isFocused: false
      })

      this.triggerEvent('blur', {
        value: this.data.inputValue
      })
    },

    setFocus() {
      this.setData({
        isFocused: true
      })
    },

    clearFocus() {
      this.setData({
        isFocused: false
      })
    },

    onSendTap() {
      if (this.properties.disabled || this.properties.isGenerating) {
        return
      }

      const message = this.data.inputValue.trim()
      if (!message || this.data.isSending) {
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

    onTextConfirm() {
      this.onSendTap()
    },

    onStopTap() {
      this.triggerEvent('stopGeneration')
    },

    onAddTap() {
      this.triggerEvent('add')
    },

    async onModeChange() {
      if (this.properties.isGenerating) {
        return
      }

      const currentMode = this.data.isVoiceMode
      if (!currentMode) {
        const hasPermission = await this.checkRecordingPermission()
        if (!hasPermission) {
          return
        }
      }

      if (typeof wx.vibrateShort === 'function') {
        wx.vibrateShort({
          type: 'light'
        })
      }

      if (currentMode) {
        this.forceStopRecording({
          silent: true
        })
      }

      this.setData({
        isVoiceMode: !currentMode
      })

      this.triggerEvent('modeChange', {
        isVoiceMode: !currentMode,
        hasRecordingPermission: !currentMode ? true : null
      })
    },

    getSetting() {
      return new Promise((resolve, reject) => {
        wx.getSetting({
          success: resolve,
          fail: reject
        })
      })
    },

    getPermissionDescription(permission) {
      if (permission === true) {
        return '已授权'
      }
      if (permission === false) {
        return '已拒绝'
      }
      return '未询问过'
    },

    authorize(scope) {
      return new Promise((resolve, reject) => {
        wx.authorize({
          scope,
          success: resolve,
          fail: reject
        })
      })
    },

    async requestRecordingPermission() {
      try {
        await this.authorize('scope.record')

        wx.showToast({
          title: '录音权限已获取',
          icon: 'success',
          duration: 1500
        })

        return true
      } catch (error) {
        wx.showModal({
          title: '需要录音权限',
          content: '语音聊天功能需要录音权限。点击"允许"即可开启语音功能。',
          confirmText: '重新申请',
          cancelText: '暂不开启',
          success: (result) => {
            if (!result.confirm) {
              return
            }

            wx.openSetting({
              success: (settingResult) => {
                if (settingResult?.authSetting?.['scope.record']) {
                  wx.showToast({
                    title: '权限已开启',
                    icon: 'success'
                  })
                }
              }
            })
          }
        })

        return false
      }
    },

    showPermissionDeniedDialog() {
      wx.showModal({
        title: '需要录音权限',
        content: '语音功能需要录音权限才能使用。请在设置中开启录音权限后重试。',
        confirmText: '去设置',
        cancelText: '取消',
        success: (result) => {
          if (!result.confirm) {
            return
          }

          wx.openSetting({
            success: (settingResult) => {
              if (settingResult?.authSetting?.['scope.record']) {
                wx.showToast({
                  title: '权限已开启，请重新切换到语音模式',
                  icon: 'success',
                  duration: 2000
                })
              }
            }
          })
        }
      })
    },

    async checkRecordingPermission() {
      try {
        const settings = await this.getSetting()
        const recordPermission = settings?.authSetting?.['scope.record']

        if (recordPermission === true) {
          return true
        }

        if (recordPermission === false) {
          this.showPermissionDeniedDialog()
          return false
        }

        return this.requestRecordingPermission()
      } catch (error) {
        return false
      }
    },

    onVoiceStart() {
      if (this.properties.disabled || this.properties.isGenerating) {
        return
      }

      wx.getSetting({
        success: (result) => {
          if (result?.authSetting?.['scope.record'] === false) {
            wx.showModal({
              title: '需要录音权限',
              content: '请在设置中开启录音权限以便发送语音消息',
              confirmText: '去设置',
              success: (modalResult) => {
                if (modalResult.confirm) {
                  wx.openSetting()
                }
              }
            })
            return
          }

          this.startRecording()
        },
        fail: () => {
          this.startRecording()
        }
      })
    },

    onVoiceEnd() {
      if (!this.data.isRecording && !this.recordingPending) {
        return
      }

      this.stopRecording()
    },

    onVoiceCancel() {
      this.forceStopRecording()
    },

    onVoiceMove(event = {}) {
      if (!this.data.isRecording && !this.recordingPending) {
        return
      }

      const touch = getTouchPoint(event)
      if (!touch || !wx || typeof wx.createSelectorQuery !== 'function') {
        return
      }

      const moveX = Number(touch.pageX ?? touch.clientX ?? 0)
      const moveY = Number(touch.pageY ?? touch.clientY ?? 0)
      const query = wx.createSelectorQuery().in(this)

      query.select('.voice-input-button').boundingClientRect()
      query.exec((result) => {
        const rect = result && result[0]
        if (!rect) {
          return
        }

        const isOutOfBounds = moveX < rect.left || moveX > rect.right || moveY < rect.top || moveY > rect.bottom
        if (isOutOfBounds) {
          this.forceStopRecording()
        }
      })
    },

    forceStopVoiceRecordingFromPage(options = {}) {
      if (options.discardResult === true) {
        this.forceStopRecording({
          silent: true
        })
        return
      }

      if (!this.data.isRecording && !this.recordingPending) {
        return
      }

      this.stopRecording()
    },

    startRecording() {
      if (this.data.isRecording || this.recordingPending) {
        return
      }

      this.initRecorderManager()
      if (!this.recorderManager || typeof this.recorderManager.start !== 'function') {
        wx.showToast({
          title: '当前环境不支持录音',
          icon: 'none',
          duration: 1600
        })
        return
      }

      this.recordingPending = true
      this._stopRequested = false
      this._discardNextRecorderStop = false
      this.clearRecordingTimer()

      this.setData({
        isRecording: true,
        recordingTime: 0
      })

      try {
        this.recorderManager.start({
          duration: 15000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 96000,
          format: 'mp3',
          frameSize: 50
        })
      } catch (error) {
        this.handleRecorderError(error)
        return
      }

      if (typeof wx.vibrateShort === 'function') {
        wx.vibrateShort({
          type: 'light'
        })
      }
    },

    stopRecording() {
      if (!this.data.isRecording && !this.recordingPending) {
        return
      }

      this._stopRequested = true

      if (this.recorderManager) {
        try {
          this.recorderManager.stop()
        } catch (error) {
          this.handleRecorderError(error)
          return
        }
      }

      this.setData({
        isRecording: false
      })
      this.recordingPending = false
      this.clearRecordingTimer()
    },

    forceStopRecording(options = {}) {
      this._stopRequested = true
      this._discardNextRecorderStop = true
      this.recordingPending = false
      this.setData({
        isRecording: false
      })
      this.clearRecordingTimer()

      if (this.recorderManager) {
        try {
          this.recorderManager.stop()
        } catch (error) {
          if (!options.silent) {
            this.handleRecorderError(error)
          }
        }
      }
    },

    handleRecorderStart() {
      if (!this.data.isRecording) {
        if (this.recorderManager) {
          try {
            this.recorderManager.stop()
          } catch (error) {
            this.handleRecorderError(error)
          }
        }

        if (!this._stopRequested) {
          this._discardNextRecorderStop = true
        }
        return
      }

      this.recordingPending = false
      this.startRecordingTimer()
    },

    handleRecorderStop(result = {}) {
      this.recordingPending = false
      this._stopRequested = false
      this.clearRecordingTimer()
      this.setData({
        isRecording: false
      })

      if (this._discardNextRecorderStop) {
        this._discardNextRecorderStop = false
        return
      }

      if (Number(result.duration || 0) < 1000) {
        wx.showToast({
          title: '录音时间太短',
          icon: 'none',
          duration: 2000
        })
        return
      }

      this.sendVoiceMessage(result)
    },

    handleRecorderError(error = {}) {
      this.recordingPending = false
      this._stopRequested = false
      this._discardNextRecorderStop = false
      this.clearRecordingTimer()
      this.setData({
        isRecording: false
      })

      if (getRecorderNotStartedError(error)) {
        return
      }

      if (getRecorderBusyError(error)) {
        this.forceStopRecording({
          silent: true
        })
        wx.showToast({
          title: '录音状态重置，请重新录制',
          icon: 'none',
          duration: 2000
        })
        return
      }

      wx.showToast({
        title: '录音失败，请重试',
        icon: 'none',
        duration: 1600
      })
    },

    startRecordingTimer() {
      this.clearRecordingTimer()
      this._recordingTimer = setInterval(() => {
        const nextTime = this.data.recordingTime + 1
        this.setData({
          recordingTime: nextTime
        })

        if (nextTime >= 15) {
          this.stopRecording()
        }
      }, 1000)
    },

    clearRecordingTimer() {
      if (this._recordingTimer) {
        clearInterval(this._recordingTimer)
        this._recordingTimer = null
      }
    },

    sendVoiceMessage(recordResult = {}) {
      const tempFilePath = recordResult.tempFilePath || ''
      if (!tempFilePath) {
        wx.showToast({
          title: '发送失败，请重试',
          icon: 'none',
          duration: 2000
        })
        return
      }

      const fileSystem = wx.getFileSystemManager ? wx.getFileSystemManager() : null
      if (!fileSystem || typeof fileSystem.readFile !== 'function') {
        wx.showToast({
          title: '发送失败，请重试',
          icon: 'none',
          duration: 2000
        })
        return
      }

      fileSystem.readFile({
        filePath: tempFilePath,
        encoding: 'base64',
        success: (fileResult) => {
          const audioData = String(fileResult?.data || '')
          if (!audioData) {
            wx.showToast({
              title: '发送失败，请重试',
              icon: 'none',
              duration: 2000
            })
            return
          }

          this.triggerEvent('voiceSend', {
            tempFilePath,
            duration: Math.max(1, Math.round((Number(recordResult.duration || 0) || 0) / 1000)),
            fileSize: Number(recordResult.fileSize || 0) || 0,
            audioData,
            audioFormat: 'mp3'
          })
        },
        fail: () => {
          wx.showToast({
            title: '发送失败，请重试',
            icon: 'none',
            duration: 2000
          })
        }
      })
    }
  }
})
