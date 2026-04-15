Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    routes: {
      type: Array,
      value: []
    },
    selectedRouteId: {
      type: String,
      value: ''
    }
  },

  data: {
    internalSelectedRouteId: '',
    isPlanning: false,
    planningProgress: 0
  },

  observers: {
    visible(visible) {
      if (visible) {
        this.syncSelectedRoute()
        return
      }

      this.resetPlanningState()
    },
    routes() {
      if (!this.data.isPlanning) {
        this.syncSelectedRoute()
      }
    },
    selectedRouteId() {
      if (!this.data.isPlanning) {
        this.syncSelectedRoute()
      }
    }
  },

  lifetimes: {
    detached() {
      this.clearPlanningTimer()
    }
  },

  methods: {
    syncSelectedRoute() {
      const fallbackRouteId = this.properties.selectedRouteId || this.properties.routes?.[0]?.id || ''

      this.setData({
        internalSelectedRouteId: fallbackRouteId
      })
    },

    resetPlanningState() {
      this.clearPlanningTimer()
      this.setData({
        isPlanning: false,
        planningProgress: 0
      })
    },

    clearPlanningTimer() {
      if (this.planningTimer) {
        clearInterval(this.planningTimer)
        this.planningTimer = null
      }
    },

    noop() {},

    onClose() {
      this.resetPlanningState()
      this.triggerEvent('close')
    },

    onRouteCardTap(event) {
      if (this.data.isPlanning) {
        return
      }

      const routeId = event?.currentTarget?.dataset?.routeId
      if (!routeId) {
        return
      }

      this.setData({
        internalSelectedRouteId: routeId
      })
    },

    onRouteButtonTap(event) {
      const routeId = event?.currentTarget?.dataset?.routeId || this.data.internalSelectedRouteId
      if (!routeId || this.data.isPlanning) {
        return
      }

      this.startPlanning(routeId)
    },

    onOpenAIChat() {
      if (this.data.isPlanning) {
        return
      }

      const routeId = this.data.internalSelectedRouteId || this.properties.selectedRouteId || ''
      const route = this.properties.routes.find((item) => item.id === routeId) || null
      const message = route
        ? `我想详细了解一下${route.name}，包括适合人群、游览节奏和沿途点位亮点。`
        : '我想了解更多关于游览路线的详情。'

      this.triggerEvent('openAIChat', {
        context: 'route_planning',
        routeId,
        route,
        message
      })
    },

    startPlanning(routeId) {
      let progress = 0

      this.clearPlanningTimer()
      this.setData({
        internalSelectedRouteId: routeId,
        isPlanning: true,
        planningProgress: 0
      })

      this.planningTimer = setInterval(() => {
        if (progress < 40) {
          progress += 24
        } else if (progress < 75) {
          progress += 14
        } else {
          progress += 12
        }

        progress = Math.min(progress, 100)

        this.setData({
          planningProgress: progress
        })

        if (progress < 100) {
          return
        }

        this.clearPlanningTimer()
        this.setData({
          isPlanning: false
        })

        const route = this.properties.routes.find((item) => item.id === routeId) || null
        this.triggerEvent('routeSelected', {
          routeId,
          route
        })
      }, 120)
    }
  }
})
