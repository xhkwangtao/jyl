const assert = require('node:assert/strict')

const StreamingPcmPlayer = require('../../miniprogram/utils/streaming-pcm-player')

const tests = []

function test(name, run) {
  tests.push({ name, run })
}

function int16ArrayToBase64(values = []) {
  const int16Array = new Int16Array(values)
  return Buffer.from(int16Array.buffer).toString('base64')
}

function createAudioContextHarness(sampleRate = 48000) {
  const createBufferCalls = []
  const startCalls = []
  const sourceNodes = []

  const audioContext = {
    sampleRate,
    currentTime: 1,
    destination: {},
    createBuffer(channels, length, bufferSampleRate) {
      createBufferCalls.push({
        channels,
        length,
        sampleRate: bufferSampleRate
      })

      return {
        duration: length / bufferSampleRate,
        getChannelData() {
          return new Float32Array(length)
        }
      }
    },
    createBufferSource() {
      const source = {
        buffer: null,
        onended: null,
        connect() {},
        start(startTime) {
          startCalls.push(startTime)
        },
        stop() {}
      }
      sourceNodes.push(source)
      return source
    },
    createGain() {
      return {
        connect() {}
      }
    },
    close() {}
  }

  return {
    audioContext,
    createBufferCalls,
    startCalls,
    sourceNodes
  }
}

test('appendChunk uses the chunk sample rate instead of the audio context sample rate', () => {
  const previousWx = global.wx
  const contextHarness = createAudioContextHarness(48000)

  global.wx = {
    createWebAudioContext() {
      return contextHarness.audioContext
    },
    base64ToArrayBuffer(base64) {
      const buffer = Buffer.from(base64, 'base64')
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    }
  }

  try {
    const player = new StreamingPcmPlayer()

    player.appendChunk({
      audioData: int16ArrayToBase64([0, 32767, -32768, 1024]),
      sampleRate: 16000,
      chunkIndex: 0
    })

    assert.equal(contextHarness.createBufferCalls.length, 1)
    assert.equal(contextHarness.createBufferCalls[0].sampleRate, 16000)
  } finally {
    if (previousWx === undefined) {
      delete global.wx
    } else {
      global.wx = previousWx
    }
  }
})

module.exports = tests
