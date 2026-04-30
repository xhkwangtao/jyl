const assert = require('node:assert/strict')

const tests = []
const serviceModulePath = require.resolve('../../miniprogram/services/ai-chat-service.js')
const requestModulePath = require.resolve('../../miniprogram/utils/request.js')

function test(name, run) {
  tests.push({ name, run })
}

function loadServiceWithRequestMock(requestMock) {
  const originalRequestModule = require.cache[requestModulePath]
  const originalServiceModule = require.cache[serviceModulePath]

  require.cache[requestModulePath] = {
    id: requestModulePath,
    filename: requestModulePath,
    loaded: true,
    exports: requestMock
  }

  delete require.cache[serviceModulePath]
  const service = require(serviceModulePath)

  return {
    service,
    restore() {
      delete require.cache[serviceModulePath]

      if (originalRequestModule) {
        require.cache[requestModulePath] = originalRequestModule
      } else {
        delete require.cache[requestModulePath]
      }

      if (originalServiceModule) {
        require.cache[serviceModulePath] = originalServiceModule
      }
    }
  }
}

test('streamVoiceChat maps legacy voice output mode to client-supported both mode', () => {
  let capturedOptions = null

  const { service, restore } = loadServiceWithRequestMock({
    stream(options = {}) {
      capturedOptions = options
      return { abort() {} }
    }
  })

  try {
    service.streamVoiceChat({
      audioData: 'base64-audio',
      audioFormat: 'mp3',
      outputMode: 'voice'
    })

    assert.ok(capturedOptions, 'expected request.stream to be called')
    assert.equal(capturedOptions.url, '/client/ai-agent/voice-chat/stream')
    assert.equal(capturedOptions.data.audio_data, 'base64-audio')
    assert.equal(capturedOptions.data.audio_format, 'mp3')
    assert.equal(capturedOptions.data.output_mode, 'both')
  } finally {
    restore()
  }
})

module.exports = tests
