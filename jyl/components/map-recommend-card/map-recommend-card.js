Component({
  data: {
    recommendationTitle: '路线推荐',
    recommendationSubtitle: '智能规划最优游览路线',
    startRouteText: '开启AI地图'
  },

  methods: {
    onMapPreviewTap() {
      this.triggerEvent('maptap')
    },

    onStartRoute() {
      this.triggerEvent('startroute')
    }
  }
})
