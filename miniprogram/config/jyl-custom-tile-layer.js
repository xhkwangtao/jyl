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
            minX: 53971,
            maxX: 53979,
            minY: 24689,
            maxY: 24698
        },
        17: {
            minX: 107942,
            maxX: 107959,
            minY: 49378,
            maxY: 49396
        },
        18: {
            minX: 215885,
            maxX: 215918,
            minY: 98757,
            maxY: 98793
        },
        19: {
            minX: 431770,
            maxX: 431836,
            minY: 197515,
            maxY: 197587
        }
    },

    // 当前这批 QGIS 瓦片是标准 XYZ + WGS84。
    coordinateSystem: 'wgs84',
    tileScheme: 'xyz',
    tileFormat: 'png',

    minZoom: 16,
    maxZoom: 19,
    allowedZooms: [16, 17, 18, 19],
    boundaryLimitInset: {
        north: 0,
        south: 0.00012,
        east: 0.00012,
        west: 0.00012
    },

    opacity: 0.96,
    zIndex: 1
}

module.exports = {
    JYL_CUSTOM_TILE_LAYER_CONFIG,
    JYL_GROUND_TILE_OVERLAY_CONFIG
}
