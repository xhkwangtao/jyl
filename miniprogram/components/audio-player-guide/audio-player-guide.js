const DEFAULT_AVATAR = '/images/ai-assistant-xiaoying.png'

Component({
  properties: {
    visible: {
      type: Boolean,
      value: true
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
    isPlaying: false,
    audioProgress: 0,
    currentTime: 0,
    totalTime: 180
  },

  observers: {
    currentPoi(point) {
      this.syncPoint(point)
    },
    visible(isVisible) {
      if (!isVisible) {
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
        audioProgress: 0,
        currentTime: 0,
        totalTime: 180
      })
    },

    togglePlay() {
      if (this.data.isPlaying) {
        this.stopPlayback(true)
        this.triggerEvent('audioPause', {
          poi: this.properties.currentPoi
        })
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

      if (triggerStopEvent) {
        this.triggerEvent('audioStop', {
          poi: this.properties.currentPoi
        })
      }
    },

    closePlayer() {
      this.stopPlayback(true)
      this.triggerEvent('close')
    },

    formatTime(value) {
      const safeValue = Number.isFinite(value) ? value : 0
      const minutes = `${Math.floor(safeValue / 60)}`.padStart(2, '0')
      const seconds = `${safeValue % 60}`.padStart(2, '0')
      return `${minutes}:${seconds}`
    }
  }
})
