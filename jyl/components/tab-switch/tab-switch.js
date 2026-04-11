Component({
  properties: {
    currentTab: {
      type: String,
      value: 'badge'
    }
  },

  methods: {
    onTabTap(event) {
      const { tab } = event.currentTarget.dataset

      if (!tab || tab === this.properties.currentTab) {
        return
      }

      this.setData({
        currentTab: tab
      })

      this.triggerEvent('tabChange', {
        tab,
        tabName: tab === 'badge' ? '我的徽章' : '排行榜'
      })
    }
  }
})
