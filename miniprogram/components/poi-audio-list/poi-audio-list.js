const DEFAULT_COVER = '/images/poi/icons/scenic-spot.png'

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    poiList: {
      type: Array,
      value: []
    },
    currentPoi: {
      type: Object,
      value: null
    }
  },

  data: {
    preparedPoiList: [],
    currentPoiId: ''
  },

  observers: {
    poiList(list) {
      this.preparePoiList(list)
    },
    currentPoi(point) {
      this.setData({
        currentPoiId: this.getPoiId(point)
      })
    }
  },

  lifetimes: {
    attached() {
      this.preparePoiList(this.properties.poiList)
      this.setData({
        currentPoiId: this.getPoiId(this.properties.currentPoi)
      })
    }
  },

  methods: {
    getPoiId(point) {
      if (!point) {
        return ''
      }

      return String(point.id || point.poiId || point.key || '')
    },

    preparePoiList(list) {
      const preparedPoiList = (Array.isArray(list) ? list : []).map((point) => ({
        ...point,
        id: this.getPoiId(point),
        displayName: point.displayName || point.name || '导览点',
        subtitle: point.subtitle || point.themeTag || point.sequenceText || '导览点',
        coverImage: point.coverImage || point.iconPath || DEFAULT_COVER
      }))

      this.setData({
        preparedPoiList
      })
    },

    handleClose() {
      this.triggerEvent('close')
    },

    handleSelect(event) {
      const index = Number(event?.currentTarget?.dataset?.index)
      const poi = this.data.preparedPoiList[index]
      if (!poi) {
        return
      }

      this.triggerEvent('select', {
        id: poi.id,
        poi
      })
    }
  }
})
