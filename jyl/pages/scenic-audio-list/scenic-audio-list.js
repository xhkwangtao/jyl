function buildAudioGroups() {
  return [
    {
      id: 'group-1',
      title: '长城积木',
      summaryDuration: '约 05:24',
      cover: '/images/poi-detail/1.png',
      expanded: true,
      items: [
        {
          id: 'group-1-item-1',
          title: '长城积木',
          duration: '02:48',
          rawDuration: 168,
          cover: '/images/poi-detail/1.png',
          playing: false
        },
        {
          id: 'group-1-item-2',
          title: '砖石结构',
          duration: '02:36',
          rawDuration: 156,
          cover: '/images/poi-detail/1.png',
          playing: false
        }
      ]
    },
    {
      id: 'group-2',
      title: '二道边',
      summaryDuration: '约 04:16',
      cover: '/images/poi-detail/1.png',
      expanded: false,
      items: [
        {
          id: 'group-2-item-1',
          title: '二道边故事',
          duration: '02:04',
          rawDuration: 124,
          cover: '/images/poi-detail/1.png',
          playing: false
        },
        {
          id: 'group-2-item-2',
          title: '关隘防御',
          duration: '02:12',
          rawDuration: 132,
          cover: '/images/poi-detail/1.png',
          playing: false
        }
      ]
    }
  ]
}

function buildFlatAudios() {
  return [
    {
      id: 'flat-1',
      title: '烽火台信号',
      duration: '01:42',
      rawDuration: 102,
      cover: '/images/poi-detail/1.png',
      playing: false
    },
    {
      id: 'flat-2',
      title: '守城日常',
      duration: '01:58',
      rawDuration: 118,
      cover: '/images/poi-detail/1.png',
      playing: false
    }
  ]
}

Page({
  data: {
    pageTitle: '景点讲解详情',
    locationText: '全部景点',
    navFadeHeight: 50,
    navOpacity: 0,
    navBackground: 'rgba(255,255,255,0)',
    navTheme: 'dark',
    audioGroups: buildAudioGroups(),
    flatAudios: buildFlatAudios(),
    audioTitle: '长城积木 · 讲解',
    audioCover: '/images/poi-detail/1.png',
    audioPlaying: false,
    audioDurationSeconds: 168,
    audioCurrentSeconds: 0,
    audioDurationDisplay: '02:48',
    audioCurrentDisplay: '00:00',
    audioProgressPercent: 0,
    currentPlayingId: 'group-1-item-1'
  },

  onLoad(options = {}) {
    const poiName = options.poiName || options.name || '全部景点'

    this.setData({
      locationText: poiName
    })

    this.updateAudioDisplays(0)
    this.syncPlayingFlag(this.data.currentPlayingId)
  },

  onPageScroll({ scrollTop = 0 }) {
    const max = this.data.navFadeHeight || 50
    const ratio = Math.min(Math.max(scrollTop / max, 0), 1)
    const nextOpacity = Number(ratio.toFixed(2))
    const nextBackground = `rgba(255,255,255,${nextOpacity})`

    this.setData({
      navOpacity: nextOpacity,
      navBackground: nextBackground,
      navTheme: 'dark'
    })
  },

  onBackTap() {
    wx.navigateBack({
      delta: 1,
      fail: () => {
        wx.redirectTo({
          url: '/pages/index/index'
        })
      }
    })
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

  onGroupToggle(event) {
    const { index } = event.currentTarget.dataset
    const groups = this.data.audioGroups || []
    const current = groups[index]

    if (!current) {
      return
    }

    this.setData({
      [`audioGroups[${index}].expanded`]: !current.expanded
    })
  },

  onSubAudioPlay(event) {
    const { groupIndex, itemIndex } = event.currentTarget.dataset
    const groups = this.data.audioGroups || []
    const group = groups[groupIndex]
    const child = group && group.items ? group.items[itemIndex] : null

    if (!child) {
      return
    }

    this.setTrackAndPlay(child)
  },

  onFlatAudioPlay(event) {
    const { id } = event.currentTarget.dataset
    const item = (this.data.flatAudios || []).find((audio) => audio.id === id)

    if (!item) {
      return
    }

    this.setTrackAndPlay(item)
  },

  setTrackAndPlay(track = {}) {
    const duration = track.rawDuration || this.data.audioDurationSeconds || 1

    this.setData(
      {
        currentPlayingId: track.id || '',
        audioTitle: `${track.title || '讲解音频'} · 讲解`,
        audioCover: track.cover || '/images/poi-detail/1.png',
        audioPlaying: true,
        audioDurationSeconds: duration,
        audioCurrentSeconds: 0,
        audioCurrentDisplay: '00:00',
        audioProgressPercent: 0
      },
      () => {
        this.updateAudioDisplays(0)
        this.syncPlayingFlag(track.id || '')
      }
    )
  },

  toggleAudioPlay() {
    const nextPlaying = !this.data.audioPlaying

    if (!this.data.currentPlayingId) {
      const first = this.data.audioGroups?.[0]?.items?.[0] || this.data.flatAudios?.[0]

      if (first) {
        this.setTrackAndPlay(first)
      }

      return
    }

    this.setData({
      audioPlaying: nextPlaying
    })

    this.syncPlayingFlag(this.data.currentPlayingId)
  },

  onSliderChanging(event) {
    const value = event.detail.value || 0
    const newSeconds = (value / 100) * (this.data.audioDurationSeconds || 1)

    this.updateAudioDisplays(newSeconds)
  },

  onSliderChange(event) {
    const value = event.detail.value || 0
    const newSeconds = (value / 100) * (this.data.audioDurationSeconds || 1)

    if (this.data.currentPlayingId) {
      this.setData({
        audioPlaying: true
      })
    }

    this.updateAudioDisplays(newSeconds)
    this.syncPlayingFlag(this.data.currentPlayingId)
  },

  syncPlayingFlag(playingId = '') {
    const groups = (this.data.audioGroups || []).map((group) => ({
      ...group,
      items: (group.items || []).map((item) => ({
        ...item,
        playing: Boolean(playingId) && item.id === playingId
      }))
    }))
    const flats = (this.data.flatAudios || []).map((item) => ({
      ...item,
      playing: Boolean(playingId) && item.id === playingId
    }))

    this.setData({
      audioGroups: groups,
      flatAudios: flats
    })
  },

  updateAudioDisplays(seconds) {
    const duration = this.data.audioDurationSeconds || 1
    const safeSeconds = Math.min(Math.max(seconds, 0), duration)
    const percent = (safeSeconds / duration) * 100

    this.setData({
      audioCurrentSeconds: safeSeconds,
      audioCurrentDisplay: this.formatSeconds(safeSeconds),
      audioDurationDisplay: this.formatSeconds(duration),
      audioProgressPercent: percent
    })
  },

  formatSeconds(seconds = 0) {
    const safe = Math.max(0, Math.floor(seconds))
    const mins = Math.floor(safe / 60)
    const secs = safe % 60

    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
})
