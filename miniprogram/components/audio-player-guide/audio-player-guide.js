const DEFAULT_AVATAR = '/images/ai-assistant-xiaoying.png'

Component({
  properties: {
    visible: {
      type: Boolean,
      value: true
    },
    keepPlayingWhenHidden: {
      type: Boolean,
      value: false
    },
    currentPoi: {
      type: Object,
      value: null
    },
    userScore: {
      type: Number,
      value: 85
    },
    userRankPercent: {
      type: Number,
      value: 75
    },
    showProgress: {
      type: Boolean,
      value: true
    }
  },

  data: {
    avatarImages: {
      currentFrame: DEFAULT_AVATAR
    },
    animationState: 'idle',
    statusText: '点击地图点位开始导览',
    scoreLabel: '积分：',
    rankTextPrefix: '您已超过 ',
    rankTextSuffix: '% 的用户',
    chatButtonText: '问 AI',
    isPlaying: false,
    isMuted: false,
    audioProgress: 0,
    currentTime: 0,
    totalTime: 180
  },

  observers: {
    currentPoi(point) {
      this.syncPoint(point)
    },
    visible(isVisible) {
      if (!isVisible && !this.properties.keepPlayingWhenHidden) {
        this.stopPlayback(false)
      }
    }
  },

  lifetimes: {
    attached() {
      this.syncPoint(this.properties.currentPoi)
    },

    detached() {
      this.clearProgressTimer()
    }
  },

  methods: {
    syncPoint(point) {
      const statusText = point?.name ? `我正在听${point.name}` : '点击地图点位开始导览'

      this.clearProgressTimer()
      this.setData({
        statusText,
        avatarImages: {
          currentFrame: DEFAULT_AVATAR
        },
        animationState: point ? 'breathing' : 'idle',
        isPlaying: false,
        isMuted: false,
        audioProgress: 0,
        currentTime: 0,
        totalTime: 180
      })
      this.triggerPlayStateChange()
    },

    togglePlay() {
      if (this.data.isPlaying) {
        this.stopPlayback(true)
        this.triggerEvent('audioPause', {
          poi: this.properties.currentPoi
        })
        return
      }

      this.triggerEvent('requestPlay', {
        poi: this.properties.currentPoi
      })
    },

    playAudio() {
      if (this.data.isPlaying) {
        return
      }

      this.setData({
        isPlaying: true,
        animationState: 'talking'
      })
      this.startProgressTimer()
      this.triggerEvent('audioPlay', {
        poi: this.properties.currentPoi
      })
      this.triggerPlayStateChange()
    },

    pauseAudio() {
      if (!this.data.isPlaying) {
        return
      }

      this.stopPlayback(false)
      this.triggerEvent('audioPause', {
        poi: this.properties.currentPoi
      })
    },

    getPlayStatus() {
      return {
        currentPoi: this.properties.currentPoi,
        isPlaying: this.data.isPlaying,
        isMuted: this.data.isMuted,
        currentTime: this.data.currentTime,
        totalTime: this.data.totalTime,
        progress: this.data.audioProgress
      }
    },

    stopAudio() {
      this.stopPlayback(true)
    },

    setMuted(muted) {
      this.setData({
        isMuted: !!muted
      })
      this.triggerPlayStateChange()
    },

    startProgressTimer() {
      this.clearProgressTimer()

      this.progressTimer = setInterval(() => {
        const nextTime = Math.min(this.data.currentTime + 1, this.data.totalTime)
        const audioProgress = this.data.totalTime
          ? Math.round((nextTime / this.data.totalTime) * 100)
          : 0

        this.setData({
          currentTime: nextTime,
          audioProgress
        })

        this.triggerEvent('audioTimeUpdate', {
          currentTime: nextTime,
          totalTime: this.data.totalTime,
          progress: audioProgress
        })

        if (nextTime >= this.data.totalTime) {
          this.stopPlayback(false)
          this.triggerEvent('audioEnded', {
            poi: this.properties.currentPoi
          })
        }
      }, 1000)
    },

    clearProgressTimer() {
      if (this.progressTimer) {
        clearInterval(this.progressTimer)
        this.progressTimer = null
      }
    },

    stopPlayback(triggerStopEvent) {
      this.clearProgressTimer()

      this.setData({
        isPlaying: false,
        animationState: this.properties.currentPoi ? 'breathing' : 'idle'
      })
      this.triggerPlayStateChange()

      if (triggerStopEvent) {
        this.triggerEvent('audioStop', {
          poi: this.properties.currentPoi
        })
      }
    },

    closePlayer() {
      if (this.properties.keepPlayingWhenHidden) {
        this.triggerEvent('close', {
          preservePlayback: this.data.isPlaying
        })
        return
      }

      this.stopPlayback(true)
      this.triggerEvent('close', {
        preservePlayback: false
      })
    },

    formatTime(value) {
      const safeValue = Number.isFinite(value) ? value : 0
      const minutes = `${Math.floor(safeValue / 60)}`.padStart(2, '0')
      const seconds = `${safeValue % 60}`.padStart(2, '0')
      return `${minutes}:${seconds}`
    },

    openAIChat() {
      const point = this.properties.currentPoi
      const poiName = point?.name || point?.displayName || ''
      this.triggerEvent('openAIChat', {
        poiId: point?.id || point?.markerId || '',
        poiName,
        message: poiName
          ? `我想了解${poiName}的讲解重点和游览建议。`
          : '我想了解当前景点的讲解重点和游览建议。'
      })
    },

    triggerPlayStateChange() {
      this.triggerEvent('playStateChange', this.getPlayStatus())
    }
  }
})
