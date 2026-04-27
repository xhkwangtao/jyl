const request = require('../utils/request')
const localMapData = require('../config/jyl-map-data.js')
const {
  buildPublishedMapRuntimeData
} = require('../utils/map-runtime-adapter')

const MAP_RUNTIME_API_URL = 'http://127.0.0.1:8000/api/v1/client/content/map-runtime'

class MapRuntimeService {
  async getPublishedMapRuntimeData() {
    try {
      const runtimePayload = await request.get(MAP_RUNTIME_API_URL)

      if (!runtimePayload || typeof runtimePayload !== 'object') {
        return localMapData
      }

      return buildPublishedMapRuntimeData(localMapData, runtimePayload)
    } catch (error) {
      console.warn('map runtime request failed:', error?.message || error)
      return localMapData
    }
  }
}

module.exports = new MapRuntimeService()
