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

  lifetimes: {
    ready() {
      this.mapCtx = wx.createMapContext('map-core', this)
      this.triggerEvent('mapReady', this.mapCtx)
    }
  },

  methods: {
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
