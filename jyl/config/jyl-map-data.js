// Map data entered manually for Jiuyanlou scenic spots.
// Coordinates are rendered exactly as provided by the user.

const JYL_SOURCE_FILE = '手动景点坐标'

const JYL_MARKER_POINTS = [
  {
    id: 203,
    key: 'ticket-gate',
    name: '景区入口/检票口',
    description: '游客进入景区的入口位置',
    latitude: 40.49231,
    longitude: 116.49825,
    iconPath: '/images/poi/icons/entrance.png'
  },
  {
    id: 204,
    key: 'trail-start',
    name: '生态步道起点',
    description: '步道起始位置',
    latitude: 40.4936,
    longitude: 116.4991,
    iconPath: '/images/poi/icons/scenic-spot.png'
  },
  {
    id: 202,
    key: 'huoyanshan-camp-site',
    name: '火焰山营盘遗址',
    description: '屯兵城堡',
    latitude: 40.49553,
    longitude: 116.50182,
    iconPath: '/images/poi/icons/relic.png'
  },
  {
    id: 201,
    key: 'jiuyanlou-main-tower',
    name: '九眼楼主楼',
    description: '核心敌楼',
    latitude: 40.496851,
    longitude: 116.503344,
    iconPath: '/images/poi/icons/watchtower.png'
  }
]

const JYL_MAP_META = {
  sourceFile: JYL_SOURCE_FILE,
  coordinateSystem: '按输入坐标直接渲染',
  markerCount: JYL_MARKER_POINTS.length,
  navigationText: '景点导览',
  routePreviewText: '名称已显示',
  note: '地图默认聚焦九眼楼景区。点击景点名称卡片可切换焦点，如需前往可直接打开系统地图。',
  summaryCopy: '入口、步道、营盘遗址和九眼楼主楼位置已整理成导览图，适合游客快速查看景点分布。'
}

module.exports = {
  JYL_SOURCE_FILE,
  JYL_MARKER_POINTS,
  JYL_MAP_META
}
