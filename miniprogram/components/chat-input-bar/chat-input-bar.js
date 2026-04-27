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
    detached() {
      this.clearRecordTimer()
    }
  },

  methods: {
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

      this.triggerEvent('voiceSend', {
        duration
      })
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
    }
  }
})
