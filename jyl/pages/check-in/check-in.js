const {
  JYL_MARKER_POINTS
} = require('../../config/jyl-map-data')
const {
  getCheckinRecords,
  updatePointCheckin
} = require('../../utils/checkin')

const FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '已打卡', value: 'checked' },
  { label: '未打卡', value: 'unchecked' }
]

function getPointMeta(point) {
  return {
    themeTag: point.themeTag || '导览',
    themeTone: point.themeTone || 'teal',
    shortHint: point.shortHint || point.description || '等待探索'
  }
}

function formatOrderText(index) {
  return String(index + 1).padStart(2, '0')
}

function formatSequenceText(index) {
  return `第 ${String(index + 1).padStart(2, '0')} 站`
}

function formatCheckinTime(timestamp) {
  const safeTimestamp = Number(timestamp)

  if (!Number.isFinite(safeTimestamp) || safeTimestamp <= 0) {
    return '未打卡，可随时手动标记'
  }

  const date = new Date(safeTimestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `已于 ${month}-${day} ${hours}:${minutes} 完成打卡`
}

function buildSpotList(records) {
  return JYL_MARKER_POINTS.map((point, index) => {
    const meta = getPointMeta(point)
    const checkedAt = records[String(point.id)] || null
    const checked = Boolean(checkedAt)

    return {
      id: point.id,
      key: point.key,
      name: point.name,
      description: point.description,
      orderText: point.orderText || formatOrderText(index),
      sequenceText: point.sequenceText || formatSequenceText(index),
      themeTag: meta.themeTag,
      themeTone: meta.themeTone,
      shortHint: meta.shortHint,
      checked,
      checkedAt,
      statusText: checked ? '已打卡' : '未打卡',
      actionText: checked ? '取消打卡' : '标记打卡',
      timeText: checked ? formatCheckinTime(checkedAt) : '未打卡，可随时手动标记'
    }
  })
}

function filterSpotList(list, currentFilter) {
  if (currentFilter === 'checked') {
    return list.filter((item) => item.checked)
  }

  if (currentFilter === 'unchecked') {
    return list.filter((item) => !item.checked)
  }

  return list
}

function buildHeroCopy(totalCount, checkedCount) {
  if (checkedCount <= 0) {
    return {
      heroTitle: `点亮九眼楼 ${totalCount} 个导览点`,
      heroDesc: '公开导览点已整理完成。到达现场后可逐个记录你的游览进度，状态会保存在当前设备。'
    }
  }

  if (checkedCount >= totalCount) {
    return {
      heroTitle: '全部导览点已完成打卡',
      heroDesc: '九眼楼景区的公开导览点都已点亮，可以继续回看路线和个人游览记录。'
    }
  }

  return {
    heroTitle: `还差 ${totalCount - checkedCount} 个导览点完成`,
    heroDesc: '已打卡导览点和未打卡导览点会明确区分，方便你按游览顺序继续推进。'
  }
}

function buildSectionCaption(currentFilter, checkedCount, uncheckedCount) {
  if (currentFilter === 'checked') {
    return `当前展示 ${checkedCount} 个已完成打卡的导览点`
  }

  if (currentFilter === 'unchecked') {
    return `当前展示 ${uncheckedCount} 个尚未打卡的导览点`
  }

  return '全部导览点均来自当前九眼楼地图公开点位'
}

Page({
  data: {
    pageTitle: '导览点打卡',
    navFadeHeight: 50,
    navBackground: 'rgba(255,255,255,0)',
    navTheme: 'dark',
    filterOptions: FILTER_OPTIONS,
    currentFilter: 'all',
    heroTitle: '',
    heroDesc: '',
    totalCount: JYL_MARKER_POINTS.length,
    checkedCount: 0,
    uncheckedCount: JYL_MARKER_POINTS.length,
    progressPercent: 0,
    progressPercentText: '0%',
    sectionCaption: '',
    visibleCount: JYL_MARKER_POINTS.length,
    scenicList: [],
    visibleScenicList: []
  },

  onLoad() {
    this.refreshPageState()
  },

  onShow() {
    this.refreshPageState()
  },

  onPageScroll({ scrollTop = 0 }) {
    const max = this.data.navFadeHeight || 50
    const ratio = Math.min(Math.max(scrollTop / max, 0), 1)
    const nextOpacity = Number(ratio.toFixed(2))

    this.setData({
      navBackground: `rgba(255,255,255,${nextOpacity})`,
      navTheme: 'dark'
    })
  },

  refreshPageState() {
    const records = getCheckinRecords()
    const scenicList = buildSpotList(records)
    const checkedCount = scenicList.filter((item) => item.checked).length
    const totalCount = scenicList.length
    const uncheckedCount = Math.max(totalCount - checkedCount, 0)
    const progressPercent = totalCount ? Math.round((checkedCount / totalCount) * 100) : 0
    const currentFilter = this.data.currentFilter || 'all'
    const visibleScenicList = filterSpotList(scenicList, currentFilter)
    const heroCopy = buildHeroCopy(totalCount, checkedCount)

    this.setData({
      ...heroCopy,
      scenicList,
      visibleScenicList,
      totalCount,
      checkedCount,
      uncheckedCount,
      progressPercent,
      progressPercentText: `${progressPercent}%`,
      sectionCaption: buildSectionCaption(currentFilter, checkedCount, uncheckedCount),
      visibleCount: visibleScenicList.length
    })
  },

  onFilterTap(event) {
    const nextFilter = event.currentTarget?.dataset?.value || 'all'

    if (nextFilter === this.data.currentFilter) {
      return
    }

    this.setData({
      currentFilter: nextFilter
    }, () => {
      this.refreshPageState()
    })
  },

  onToggleCheckin(event) {
    const pointId = event.currentTarget?.dataset?.id

    if (!pointId) {
      return
    }

    const target = (this.data.scenicList || []).find((item) => String(item.id) === String(pointId))

    if (!target) {
      return
    }

    const nextChecked = !target.checked
    updatePointCheckin(pointId, nextChecked)
    this.refreshPageState()

    wx.showToast({
      title: nextChecked ? '已标记打卡' : '已取消打卡',
      icon: 'none',
      duration: 1600
    })
  },

  onMapTap(event) {
    const pointId = event.currentTarget?.dataset?.id

    if (!pointId) {
      return
    }

    wx.navigateTo({
      url: `/pages/map/map?pointId=${pointId}`,
      fail: () => {
        wx.redirectTo({
          url: `/pages/map/map?pointId=${pointId}`
        })
      }
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
  }
})
