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

function getAudioUrl(point) {
  return String(point?.audioUrl || point?.audioGuideUrl || point?.audioSrc || '').trim()
}

function getAudioDuration(point, fallbackValue = 180) {
  const duration = Number(point?.audioDurationSeconds || point?.durationSeconds || point?.duration)
  return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : fallbackValue
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
      this.ensureAudioContext()
      this.syncPoint(this.properties.currentPoi)
    },

    detached() {
      this.destroyAudioContext()
      this.clearAvatarTimer()
    }
  },

  methods: {
    ensureAudioContext() {
      if (this.audioContext || typeof wx === 'undefined' || typeof wx.createInnerAudioContext !== 'function') {
        return this.audioContext || null
      }

      const audioContext = wx.createInnerAudioContext()
      audioContext.onPlay(() => {
        this.markPlaybackStarted()
      })
      audioContext.onPause(() => {
        this.markPlaybackStopped(false)
        this.triggerEvent('audioPause', {
          poi: this.properties.currentPoi
        })
      })
      audioContext.onStop(() => {
        this.markPlaybackStopped(false)
      })
      audioContext.onEnded(() => {
        this.markPlaybackStopped(false, {
          progress: 100,
          currentTime: this.data.totalTime
        })
        this.triggerEvent('audioEnded', {
          poi: this.properties.currentPoi
        })
      })
      audioContext.onTimeUpdate(() => {
        const currentTime = Math.max(0, Math.round(Number(audioContext.currentTime) || 0))
        const totalTime = Math.max(1, Math.round(Number(audioContext.duration) || this.data.totalTime || 180))
        const progress = Math.min(100, Math.round((currentTime / totalTime) * 100))

        this.setData({
          currentTime,
          totalTime,
          audioProgress: progress
        })
        this.triggerEvent('audioTimeUpdate', {
          currentTime,
          totalTime,
          progress
        })
      })
      audioContext.onError((error) => {
        this.markPlaybackStopped(false)
        this.triggerEvent('audioError', {
          poi: this.properties.currentPoi,
          error
        })
      })
      this.audioContext = audioContext

      return this.audioContext
    },

    destroyAudioContext() {
      if (!this.audioContext) {
        return
      }

      if (typeof this.audioContext.stop === 'function') {
        this.audioContext.stop()
      }
      if (typeof this.audioContext.destroy === 'function') {
        this.audioContext.destroy()
      }
      this.audioContext = null
    },

    syncPoint(point) {
      const statusText = point?.name ? `我正在听${point.name}` : '点击地图点位开始导览'
      const audioDuration = getAudioDuration(point, 180)

      if (this.audioContext && typeof this.audioContext.stop === 'function') {
        this.audioContext.stop()
      }
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
        totalTime: audioDuration
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

      const audioUrl = getAudioUrl(this.properties.currentPoi)
      if (!audioUrl) {
        this.triggerEvent('audioError', {
          poi: this.properties.currentPoi,
          error: new Error('missing audio url')
        })
        return
      }

      const audioContext = this.ensureAudioContext()
      if (!audioContext || typeof audioContext.play !== 'function') {
        this.triggerEvent('audioError', {
          poi: this.properties.currentPoi,
          error: new Error('audio context unavailable')
        })
        return
      }

      if (audioContext.src !== audioUrl) {
        audioContext.src = audioUrl
      }
      audioContext.play()
    },

    markPlaybackStarted() {
      this.setData({
        isPlaying: true,
        animationState: 'talking'
      })
      this.startAvatarTimer()
      this.triggerEvent('audioPlay', {
        poi: this.properties.currentPoi
      })
      this.triggerPlayStateChange()
    },

    pauseAudio() {
      if (!this.data.isPlaying) {
        return
      }

      if (this.audioContext && typeof this.audioContext.pause === 'function') {
        this.audioContext.pause()
        return
      }

      this.markPlaybackStopped(false)
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
      if (this.audioContext) {
        this.audioContext.muted = !!muted
      }
      this.setData({
        isMuted: !!muted
      })
      this.triggerPlayStateChange()
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

    markPlaybackStopped(triggerStopEvent, playbackState = {}) {
      this.clearAvatarTimer()

      this.setData({
        isPlaying: false,
        animationState: this.properties.currentPoi ? 'breathing' : 'idle',
        avatarFrameIndex: GUIDE_AVATAR_SPRITE.idleFrameIndex,
        avatarSpriteStyle: buildAvatarSpriteStyle(GUIDE_AVATAR_SPRITE.idleFrameIndex),
        ...(typeof playbackState.currentTime === 'number' ? { currentTime: playbackState.currentTime } : {}),
        ...(typeof playbackState.progress === 'number' ? { audioProgress: playbackState.progress } : {})
      })
      this.triggerPlayStateChange()

      if (triggerStopEvent) {
        this.triggerEvent('audioStop', {
          poi: this.properties.currentPoi
        })
      }
    },

    stopPlayback(triggerStopEvent) {
      if (this.audioContext && typeof this.audioContext.stop === 'function') {
        this.audioContext.stop()
      }
      this.markPlaybackStopped(triggerStopEvent)
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
