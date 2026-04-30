function normalizeDurationMs(durationSeconds = 0) {
  const normalizedSeconds = Number(durationSeconds)
  if (!Number.isFinite(normalizedSeconds) || normalizedSeconds <= 0) {
    return 0
  }
  return Math.round(normalizedSeconds * 1000)
}

function calcBase64Bytes(base64 = '') {
  const normalized = String(base64 || '').trim()
  if (!normalized) {
    return 0
  }

  const paddingMatch = normalized.match(/=+$/)
  const paddingLength = paddingMatch ? paddingMatch[0].length : 0
  return Math.max(0, Math.floor(normalized.length * 3 / 4) - paddingLength)
}

function calcVoiceChunkDurationMs(audioData = '', sampleRate = 16000) {
  const normalizedSampleRate = Number(sampleRate)
  if (!audioData || !Number.isFinite(normalizedSampleRate) || normalizedSampleRate <= 0) {
    return 0
  }

  const byteLength = calcBase64Bytes(audioData)
  if (!byteLength) {
    return 0
  }

  return Math.round(byteLength / 2 / normalizedSampleRate * 1000)
}

function isVoiceMessage(message) {
  return String(message?.message_type || '').trim().toLowerCase() === 'voice'
}

function updateVoiceTranscript(message = {}, transcript = '') {
  if (!isVoiceMessage(message)) {
    return message
  }

  const normalizedTranscript = String(transcript || '')
  return {
    ...message,
    content: normalizedTranscript,
    voice: {
      ...(message.voice || {}),
      transcript: normalizedTranscript
    }
  }
}

function appendVoiceTranscript(message = {}, transcriptChunk = '') {
  if (!isVoiceMessage(message)) {
    return message
  }

  const normalizedChunk = String(transcriptChunk || '')
  if (!normalizedChunk) {
    return message
  }

  const currentTranscript = String(message?.voice?.transcript || '')
  return updateVoiceTranscript(message, `${currentTranscript}${normalizedChunk}`)
}

function formatVoiceDurationText(durationMs = 0) {
  const normalizedDuration = Number(durationMs)
  if (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0) {
    return '0秒'
  }

  return `${Math.max(1, Math.ceil(normalizedDuration / 1000))}秒`
}

function buildUserVoiceMessage({
  id,
  transcript = '',
  durationSeconds = 0,
  avatar = '/images/icons/user.svg'
} = {}) {
  const normalizedTranscript = String(transcript || '')

  return {
    id: String(id || ''),
    type: 'user',
    message_type: 'voice',
    avatar,
    content: normalizedTranscript,
    voice: {
      transcript: normalizedTranscript,
      durationMs: normalizeDurationMs(durationSeconds),
      status: 'completed'
    }
  }
}

function buildAIVoicePlaceholderMessage({
  id,
  avatar = '/images/xiaojiu.png'
} = {}) {
  return {
    id: String(id || ''),
    type: 'ai',
    message_type: 'voice',
    avatar,
    content: '',
    segments: [],
    voiceChunks: [],
    voice: {
      transcript: '',
      durationMs: 0,
      totalChunks: 0,
      playedChunks: 0,
      status: 'loading',
      isLive: true
    }
  }
}

function appendVoiceChunkToMessage(message = {}, chunk = {}) {
  const audioData = String(chunk.audioData || '').trim()
  if (!audioData) {
    return message
  }

  const sampleRate = Number(chunk.sampleRate || 16000) || 16000
  const chunkIndex = Number(chunk.chunkIndex || 0) || 0
  const voiceChunks = Array.isArray(message.voiceChunks) ? message.voiceChunks.slice() : []
  voiceChunks.push({
    audioData,
    sampleRate,
    chunkIndex
  })

  const durationMs = calcVoiceChunkDurationMs(audioData, sampleRate)
  const currentVoice = message.voice && typeof message.voice === 'object'
    ? message.voice
    : {}

  return {
    ...message,
    voiceChunks,
    voice: {
      transcript: currentVoice.transcript || '',
      durationMs: (Number(currentVoice.durationMs || 0) || 0) + durationMs,
      totalChunks: voiceChunks.length,
      playedChunks: Number(currentVoice.playedChunks || 0) || 0,
      status: currentVoice.status || 'loading',
      isLive: currentVoice.isLive !== false
    }
  }
}

module.exports = {
  buildUserVoiceMessage,
  buildAIVoicePlaceholderMessage,
  appendVoiceChunkToMessage,
  calcVoiceChunkDurationMs,
  isVoiceMessage,
  updateVoiceTranscript,
  appendVoiceTranscript,
  formatVoiceDurationText
}
