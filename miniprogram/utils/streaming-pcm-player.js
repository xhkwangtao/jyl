class StreamingPcmPlayer {
  constructor() {
    this.audioContext = null
    this.history = []
    this.activeSources = new Set()
    this.nextStartTime = 0
  }

  appendChunk({ audioData, sampleRate = 16000, chunkIndex = 0 }) {
    if (!audioData) {
      return
    }
    this.ensureContext()

    const pcmBuffer = wx.base64ToArrayBuffer(audioData)
    const floatData = this.bufferToFloat32(pcmBuffer)
    const audioBuffer = this.audioContext.createBuffer(
      1,
      floatData.length,
      this.audioContext.sampleRate || sampleRate
    )
    audioBuffer.getChannelData(0).set(floatData)
    this.history.push({ audioData, sampleRate, chunkIndex })
    this.scheduleBuffer(audioBuffer)
  }

  replay(chunks = this.history) {
    this.stop(false)
    this.history = []
    for (const chunk of chunks) {
      this.appendChunk(chunk)
    }
  }

  markStreamEnded() {}

  stop(clearHistory = true) {
    for (const source of this.activeSources) {
      try {
        source.stop()
      } catch (error) {
        // Ignore stale source cleanup failures.
      }
    }
    this.activeSources.clear()
    this.nextStartTime = 0
    if (this.audioContext && typeof this.audioContext.close === 'function') {
      this.audioContext.close()
    }
    this.audioContext = null
    if (clearHistory) {
      this.history = []
    }
  }

  ensureContext() {
    if (this.audioContext) {
      return
    }
    if (!wx || typeof wx.createWebAudioContext !== 'function') {
      throw new Error('当前环境不支持流式语音播放')
    }
    this.audioContext = wx.createWebAudioContext()
  }

  bufferToFloat32(arrayBuffer) {
    const view = new DataView(arrayBuffer)
    const floatArray = new Float32Array(Math.floor(arrayBuffer.byteLength / 2))
    for (let index = 0; index < floatArray.length; index += 1) {
      floatArray[index] = view.getInt16(index * 2, true) / 32768
    }
    return floatArray
  }

  scheduleBuffer(audioBuffer) {
    const source = this.audioContext.createBufferSource()
    source.buffer = audioBuffer

    const gainNode = this.audioContext.createGain()
    source.connect(gainNode)
    gainNode.connect(this.audioContext.destination)

    const currentTime = this.audioContext.currentTime || 0
    if (!this.nextStartTime || this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.06
    }
    const startTime = this.nextStartTime
    this.nextStartTime = startTime + audioBuffer.duration

    source.onended = () => {
      this.activeSources.delete(source)
    }
    source.start(startTime)
    this.activeSources.add(source)
  }
}

module.exports = StreamingPcmPlayer
