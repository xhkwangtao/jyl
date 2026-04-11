const CHECKIN_STORAGE_KEY = 'jyl_checkin_records'

function normalizeCheckinRecords(records) {
  if (!records || typeof records !== 'object') {
    return {}
  }

  if (Array.isArray(records)) {
    return records.reduce((accumulator, item) => {
      if (item === null || item === undefined || item === '') {
        return accumulator
      }

      accumulator[String(item)] = Date.now()
      return accumulator
    }, {})
  }

  return Object.keys(records).reduce((accumulator, key) => {
    const value = records[key]

    if (!key || value === null || value === undefined || value === false) {
      return accumulator
    }

    const timestamp = Number(value)
    accumulator[String(key)] = Number.isFinite(timestamp) && timestamp > 0
      ? timestamp
      : Date.now()

    return accumulator
  }, {})
}

function getCheckinRecords() {
  try {
    const records = wx.getStorageSync(CHECKIN_STORAGE_KEY)
    return normalizeCheckinRecords(records)
  } catch (error) {
    return {}
  }
}

function saveCheckinRecords(records) {
  const normalizedRecords = normalizeCheckinRecords(records)

  try {
    wx.setStorageSync(CHECKIN_STORAGE_KEY, normalizedRecords)
  } catch (error) {
    return normalizedRecords
  }

  return normalizedRecords
}

function updatePointCheckin(pointId, checked, checkedAt = Date.now()) {
  const nextRecords = getCheckinRecords()
  const pointKey = String(pointId || '')

  if (!pointKey) {
    return nextRecords
  }

  if (checked) {
    nextRecords[pointKey] = checkedAt
  } else {
    delete nextRecords[pointKey]
  }

  return saveCheckinRecords(nextRecords)
}

function isPointChecked(pointId, records = getCheckinRecords()) {
  return Boolean(records[String(pointId || '')])
}

module.exports = {
  CHECKIN_STORAGE_KEY,
  getCheckinRecords,
  saveCheckinRecords,
  updatePointCheckin,
  isPointChecked
}
