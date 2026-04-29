const AUDIO_TRIAL_STORAGE_KEY = 'map_audio_trial_state'
const AUDIO_FEATURE_KEY = 'map.audio.play'
const AUDIO_FREE_TRIAL_LIMIT = 3
const entitlementService = require('../services/entitlement-service')

function readStorageObject(key) {
  try {
    const value = wx.getStorageSync(key)
    return value && typeof value === 'object' ? value : {}
  } catch (error) {
    return {}
  }
}

function writeStorageObject(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (error) {
    // Ignore storage write failures in local mock flows.
  }
}

function normalizePointId(pointId) {
  return String(pointId || '').trim()
}

function normalizePointIdList(list) {
  const seen = new Set()

  return (Array.isArray(list) ? list : []).reduce((result, item) => {
    const pointId = normalizePointId(item)
    if (!pointId || seen.has(pointId)) {
      return result
    }

    seen.add(pointId)
    result.push(pointId)
    return result
  }, [])
}

function isFeaturePaid(featureKey = AUDIO_FEATURE_KEY) {
  return entitlementService.isFeatureAvailableSync(featureKey)
}

function setFeaturePaid(featureKey = AUDIO_FEATURE_KEY, paid = true) {
  const normalizedFeatureKey = String(featureKey || '').trim()
  if (!normalizedFeatureKey) {
    return false
  }

  const nextPaid = !!paid
  entitlementService.persistLocalFeatureAccess(normalizedFeatureKey, nextPaid)
  const requiredEntitlement = entitlementService.getFeatureRequiredEntitlement(normalizedFeatureKey)

  if (requiredEntitlement) {
    entitlementService.persistLocalEntitlementAccess(requiredEntitlement, nextPaid)
  }

  return entitlementService.isFeatureAvailableSync(normalizedFeatureKey)
}

function getAudioTrialState() {
  const trialState = readStorageObject(AUDIO_TRIAL_STORAGE_KEY)
  return {
    unlockedPointIds: normalizePointIdList(trialState.unlockedPointIds)
  }
}

function saveAudioTrialState(trialState = {}) {
  writeStorageObject(AUDIO_TRIAL_STORAGE_KEY, {
    unlockedPointIds: normalizePointIdList(trialState.unlockedPointIds)
  })
}

function resetAudioTrialState() {
  saveAudioTrialState({
    unlockedPointIds: []
  })
}

function getAudioAccessStatus(pointId = '') {
  const paid = isFeaturePaid(AUDIO_FEATURE_KEY)
  const trialState = getAudioTrialState()
  const normalizedPointId = normalizePointId(pointId)
  const usedCount = trialState.unlockedPointIds.length
  const remainingFreeCount = Math.max(0, AUDIO_FREE_TRIAL_LIMIT - usedCount)
  const pointUnlocked = normalizedPointId ? trialState.unlockedPointIds.includes(normalizedPointId) : false
  const requiresPayment = !paid && !pointUnlocked && remainingFreeCount <= 0

  return {
    featureKey: AUDIO_FEATURE_KEY,
    pointId: normalizedPointId,
    paid,
    freeLimit: AUDIO_FREE_TRIAL_LIMIT,
    usedCount,
    remainingFreeCount,
    pointUnlocked,
    requiresPayment,
    canAccess: paid || pointUnlocked || remainingFreeCount > 0
  }
}

function consumeAudioAccess(pointId = '') {
  const normalizedPointId = normalizePointId(pointId)
  const currentStatus = getAudioAccessStatus(normalizedPointId)

  if (!normalizedPointId) {
    return {
      ...currentStatus,
      granted: currentStatus.paid
    }
  }

  if (currentStatus.paid || currentStatus.pointUnlocked) {
    return {
      ...currentStatus,
      granted: true,
      consumedFreeSlot: false
    }
  }

  if (currentStatus.remainingFreeCount <= 0) {
    return {
      ...currentStatus,
      granted: false,
      consumedFreeSlot: false
    }
  }

  const nextUnlockedPointIds = normalizePointIdList([
    ...getAudioTrialState().unlockedPointIds,
    normalizedPointId
  ])

  saveAudioTrialState({
    unlockedPointIds: nextUnlockedPointIds
  })

  const nextStatus = getAudioAccessStatus(normalizedPointId)
  return {
    ...nextStatus,
    granted: true,
    consumedFreeSlot: true
  }
}

module.exports = {
  AUDIO_FEATURE_KEY,
  AUDIO_FREE_TRIAL_LIMIT,
  consumeAudioAccess,
  getAudioAccessStatus,
  getAudioTrialState,
  isFeaturePaid,
  resetAudioTrialState,
  setFeaturePaid
}
