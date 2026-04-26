const JYL_REMOTE_TILE_BASE_URL = 'https://jyl-cdn.flexai.cc/map/tiles/'

const JYL_CUSTOM_TILE_LAYER_CONFIG = {
    // addTileLayer 在当前联调机型上不可用，先关闭这条试验链路。
    enabled: false,
    sourceType: 'remote',
    remoteSourceUrlFormat: '',
    downloadZipUrl: '',
    packageZipPath: '',
    version: 'disabled',
    minZoom: 16,
    maxZoom: 19,
    localCacheDirName: 'jyl-custom-tiles',
    localSourceUrlFormat: '{root}/{z}/{x}/{y}.png',
    showDebugToast: false
}

const JYL_GROUND_TILE_OVERLAY_CONFIG = {
    // 黄崖关可用的方案：使用 addGroundOverlay 动态拼瓦片。
    enabled: true,

    // 服务器瓦片模式。
    // 只要把 QGIS 导出的目录结构上传到这个前缀下即可：
    // {baseUrl}/{z}/{x}/{y}.png
    packageRoots: [],
    zoomBaseUrlMap: null,
    urlTemplate: `${JYL_REMOTE_TILE_BASE_URL}{z}/{x}/{y}.png`,
    baseUrl: JYL_REMOTE_TILE_BASE_URL,
    tileCoverageByZoom: {
        16: {
            minX: 53973,
            maxX: 53976,
            minY: 24693,
            maxY: 24695
        },
        17: {
            minX: 107946,
            maxX: 107953,
            minY: 49387,
            maxY: 49391
        },
        18: {
            minX: 215893,
            maxX: 215906,
            minY: 98774,
            maxY: 98783
        },
        19: {
            minX: 431787,
            maxX: 431812,
            minY: 197548,
            maxY: 197567
        }
    },

    // 当前这批 QGIS 瓦片是标准 XYZ + WGS84。
    coordinateSystem: 'wgs84',
    tileScheme: 'xyz',
    tileFormat: 'png',

    minZoom: 16,
    maxZoom: 19,
    allowedZooms: [16, 17, 18, 19],

    opacity: 0.96,
    zIndex: 1
}

module.exports = {
    JYL_CUSTOM_TILE_LAYER_CONFIG,
    JYL_GROUND_TILE_OVERLAY_CONFIG
}
