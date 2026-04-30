Component({
  properties: {
    longitude: {
      type: Number,
      value: 116.491722
    },
    latitude: {
      type: Number,
      value: 40.491364
    },
    scale: {
      type: Number,
      value: 17
    },
    showLocation: {
      type: Boolean,
      value: false
    },
    enablePOI: {
      type: Boolean,
      value: false
    },
    markers: {
      type: Array,
      value: []
    },
    polyline: {
      type: Array,
      value: []
    },
    polygons: {
      type: Array,
      value: []
    },
    boundaryLimit: {
      type: Object,
      value: null
    },
    allowedZooms: {
      type: Array,
      value: []
    }
  },

  data: {
    loading: false,
    loadingText: '',
    minScale: 5,
    maxScale: 20
  },

  observers: {
    allowedZooms(allowedZooms) {
      this.syncScaleRange(allowedZooms)
    }
  },

  lifetimes: {
    attached() {
      this.syncScaleRange(this.properties.allowedZooms)
    },

    ready() {
      this.mapCtx = wx.createMapContext('map-core', this)
      this.triggerEvent('mapReady')
    }
  },

  methods: {
    getMapContext() {
      if (!this.mapCtx) {
        this.mapCtx = wx.createMapContext('map-core', this)
      }

      return this.mapCtx
    },

    syncScaleRange(allowedZooms) {
      const numericZooms = Array.isArray(allowedZooms)
        ? allowedZooms
          .map((zoom) => Number(zoom))
          .filter((zoom) => Number.isFinite(zoom))
          .sort((left, right) => left - right)
        : []

      const nextMinScale = numericZooms[0] || 5
      const nextMaxScale = numericZooms[numericZooms.length - 1] || 20

      if (nextMinScale === this.data.minScale && nextMaxScale === this.data.maxScale) {
        return
      }

      this.setData({
        minScale: nextMinScale,
        maxScale: nextMaxScale
      })
    },

    onRegionChange(event) {
      const detail = event.detail || {}
      const eventType = detail.type || event.type || ''
      const scale = typeof detail.scale === 'number' ? detail.scale : this.properties.scale

      if (eventType === 'end') {
        this.triggerEvent('scaleUpdate', { scale })
      }

      this.triggerEvent('regionChange', {
        ...detail,
        type: eventType,
        scale
      })
    },

    onMarkerTap(event) {
      this.triggerEvent('markerTap', {
        markerId: event?.detail?.markerId
      })
    },

    onCalloutTap(event) {
      this.triggerEvent('markerTap', {
        markerId: event?.detail?.markerId,
        fromCallout: true
      })
    },

    onMapTap(event) {
      this.triggerEvent('mapTap', event.detail || {})
    },

    onPOITap(event) {
      this.triggerEvent('poiTap', event.detail || {})
    }
  }
})
