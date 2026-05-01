const {
  PAID_FEATURE_KEYS
} = require('../services/entitlement-service')

const SCENIC_AUDIO_SUBSCRIBE_DESCRIPTION = '解锁景点讲解需要VIP权限'

function buildScenicAudioAccessOptions(options = {}) {
  return {
    featureKey: PAID_FEATURE_KEYS.VIP,
    featureName: '景点讲解',
    productName: '景点讲解权限',
    description: SCENIC_AUDIO_SUBSCRIBE_DESCRIPTION,
    ...options
  }
}

module.exports = {
  SCENIC_AUDIO_SUBSCRIBE_DESCRIPTION,
  buildScenicAudioAccessOptions
}
