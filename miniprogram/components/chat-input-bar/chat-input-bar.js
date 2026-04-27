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
        this._recorderManager.onError(() => {
          this.handleRecorderError()
        })
      }
    },

    teardownRecorderManager() {
      this._recorderManager = null
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

    onVoiceStart() {
      if (this.properties.disabled || this.properties.isGenerating) {
        return
      }

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

      this._recorderManager.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: 'mp3'
      })

      this._recordTimer = setInterval(() => {
        this.setData({
          recordingTime: this.data.recordingTime + 1
        })
      }, 1000)
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

    handleRecorderError() {
      this.clearRecordTimer()
      this._pendingVoiceDuration = 0
      this.setData({
        isRecording: false,
        recordingTime: 0
      })
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
