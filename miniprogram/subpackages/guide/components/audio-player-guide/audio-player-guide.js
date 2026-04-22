const GUIDE_AVATAR_SPRITE = {
  imagePath: '/subpackages/guide/images/audio-guide/guide-avatar-talking-sprite.png',
  frameCount: 20,
  columns: 5,
  rows: 4,
  frameInterval: 150,
  idleFrameIndex: 0
}

function clampFrameIndex(frameIndex) {
  const maxIndex = Math.max(0, GUIDE_AVATAR_SPRITE.frameCount - 1)
  const safeIndex = Number.isFinite(frameIndex) ? Math.round(frameIndex) : GUIDE_AVATAR_SPRITE.idleFrameIndex
  return Math.min(Math.max(0, safeIndex), maxIndex)
}

function buildAvatarSpriteStyle(frameIndex) {
  const safeFrameIndex = clampFrameIndex(frameIndex)
  const column = safeFrameIndex % GUIDE_AVATAR_SPRITE.columns
  const row = Math.floor(safeFrameIndex / GUIDE_AVATAR_SPRITE.columns)
  const translateX = -(column * (100 / GUIDE_AVATAR_SPRITE.columns))
  const translateY = -(row * (100 / GUIDE_AVATAR_SPRITE.rows))

  return [
    `width:${GUIDE_AVATAR_SPRITE.columns * 100}%`,
    `height:${GUIDE_AVATAR_SPRITE.rows * 100}%`,
    `transform:translate3d(${translateX.toFixed(4)}%, ${translateY.toFixed(4)}%, 0)`
  ].join(';')
}

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
    avatarSpritePath: GUIDE_AVATAR_SPRITE.imagePath,
    avatarFrameIndex: GUIDE_AVATAR_SPRITE.idleFrameIndex,
    avatarSpriteStyle: buildAvatarSpriteStyle(GUIDE_AVATAR_SPRITE.idleFrameIndex),
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
      this.clearAvatarTimer()
    }
  },

  methods: {
    syncPoint(point) {
      const statusText = point?.name ? `我正在听${point.name}` : '点击地图点位开始导览'

      this.clearProgressTimer()
      this.clearAvatarTimer()
      this.setData({
        statusText,
        avatarFrameIndex: GUIDE_AVATAR_SPRITE.idleFrameIndex,
        avatarSpriteStyle: buildAvatarSpriteStyle(GUIDE_AVATAR_SPRITE.idleFrameIndex),
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
      this.startAvatarTimer()
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

    startAvatarTimer() {
      this.clearAvatarTimer()

      let nextFrameIndex = (clampFrameIndex(this.data.avatarFrameIndex) + 1) % GUIDE_AVATAR_SPRITE.frameCount
      this.setAvatarFrame(nextFrameIndex)
      nextFrameIndex = (nextFrameIndex + 1) % GUIDE_AVATAR_SPRITE.frameCount

      this.avatarTimer = setInterval(() => {
        this.setAvatarFrame(nextFrameIndex)
        nextFrameIndex = (nextFrameIndex + 1) % GUIDE_AVATAR_SPRITE.frameCount
      }, GUIDE_AVATAR_SPRITE.frameInterval)
    },

    clearAvatarTimer() {
      if (this.avatarTimer) {
        clearInterval(this.avatarTimer)
        this.avatarTimer = null
      }
    },

    setAvatarFrame(frameIndex) {
      const safeFrameIndex = clampFrameIndex(frameIndex)
      this.setData({
        avatarFrameIndex: safeFrameIndex,
        avatarSpriteStyle: buildAvatarSpriteStyle(safeFrameIndex)
      })
    },

    stopPlayback(triggerStopEvent) {
      this.clearProgressTimer()
      this.clearAvatarTimer()

      this.setData({
        isPlaying: false,
        animationState: this.properties.currentPoi ? 'breathing' : 'idle',
        avatarFrameIndex: GUIDE_AVATAR_SPRITE.idleFrameIndex,
        avatarSpriteStyle: buildAvatarSpriteStyle(GUIDE_AVATAR_SPRITE.idleFrameIndex)
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
