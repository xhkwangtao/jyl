Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    popupData: {
      type: Object,
      value: null
    }
  },

  data: {
    currentPopupData: null,
    buttonItems: [],
    buttonLayoutClass: ''
  },

  observers: {
    visible(visible) {
      if (visible) {
        this.syncPopupData(this.properties.popupData)
      }
    },

    popupData(popupData) {
      this.syncPopupData(popupData)
    }
  },

  methods: {
    syncPopupData(popupData) {
      if (!popupData) {
        this.setData({
          currentPopupData: null,
          buttonItems: [],
          buttonLayoutClass: ''
        })
        return
      }

      const buttonItems = []
      const primaryAction = String(popupData.primaryActionType || '').trim()
      const secondaryAction = String(popupData.secondaryActionType || '').trim()

      if (popupData.primaryActionText) {
        buttonItems.push({
          text: popupData.primaryActionText || '查看详情',
          action: primaryAction || 'noop',
          fullWidth: !popupData.showSecondaryAction
        })
      }

      if (popupData.showSecondaryAction && popupData.secondaryActionText) {
        buttonItems.push({
          text: popupData.secondaryActionText || '继续',
          action: secondaryAction || 'noop',
          fullWidth: false
        })
      }

      this.setData({
        currentPopupData: {
          ...popupData,
          coverImage: popupData.coverImage || popupData.markerIconPath || '/images/poi/icons/scenic-spot.png',
          hasAudio: !!popupData.showAudioAction,
          audioPlaying: !!popupData.audioPlaying
        },
        buttonItems,
        buttonLayoutClass: buttonItems.length === 1 ? 'single-button' : (buttonItems.length > 1 ? 'double-button' : '')
      })
    },

    emitButtonAction(action) {
      if (!action || action === 'noop') {
        return
      }

      this.triggerEvent('button-action', {
        action,
        popupData: this.data.currentPopupData || this.properties.popupData || null
      })
    },

    handleClosePopup() {
      this.triggerEvent('close')
    },

    handleButtonAction(event) {
      this.emitButtonAction(event?.currentTarget?.dataset?.action || '')
    },

    handleAudioAction() {
      this.emitButtonAction(this.data.currentPopupData?.audioActionType || this.properties.popupData?.audioActionType || '')
    }
  }
})
