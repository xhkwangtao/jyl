Component({
  properties: {
    visible: {
      type: Boolean,
      value: true
    },
    defaultFilter: {
      type: String,
      value: 'all'
    }
  },

  data: {
    selectedFilter: 'all',
    allSpotsText: '全部景点',
    photoSpotText: '网红拍照',
    explorationText: '探索任务',
    facilityText: '公共设施',
    filterTypes: {
      all: {
        name: '全部景点'
      },
      photo_spot: {
        name: '网红拍照'
      },
      exploration: {
        name: '探索任务'
      },
      facility: {
        name: '公共设施'
      }
    }
  },

  lifetimes: {
    attached() {
      this.setData({
        selectedFilter: this.properties.defaultFilter || 'all'
      })
    },

    ready() {
      setTimeout(() => {
        this.triggerFilterEvent(this.data.selectedFilter || 'all')
      }, 60)
    }
  },

  observers: {
    defaultFilter(newValue) {
      if (!newValue || newValue === this.data.selectedFilter) {
        return
      }

      this.setData({
        selectedFilter: newValue
      })
      this.triggerFilterEvent(newValue)
    }
  },

  methods: {
    onFilterTap(event) {
      const filterType = event?.currentTarget?.dataset?.filter || 'all'
      if (filterType === this.data.selectedFilter) {
        return
      }

      this.setData({
        selectedFilter: filterType
      })

      this.triggerFilterEvent(filterType)
    },

    triggerFilterEvent(filterType) {
      const filterConfig = this.data.filterTypes[filterType]
      if (!filterConfig) {
        return
      }

      this.triggerEvent('filterChange', {
        filterType,
        filterName: filterConfig.name,
        showAll: filterType === 'all'
      })
    }
  }
})
