const assert = require('node:assert/strict')

const {
  buildUserVoiceMessage,
  buildAIVoicePlaceholderMessage,
  appendVoiceChunkToMessage,
  isVoiceMessage,
  updateVoiceTranscript,
  appendVoiceTranscript,
  formatVoiceDurationText
} = require('../../miniprogram/utils/ai-chat-voice-utils')

const tests = []

function test(name, run) {
  tests.push({ name, run })
}

function buildBase64ByteLength(byteLength) {
  return Buffer.alloc(byteLength, 1).toString('base64')
}

test('buildUserVoiceMessage creates a user voice message with transcript and duration metadata', () => {
  const message = buildUserVoiceMessage({
    id: 'user-voice-1',
    transcript: '这是语音转写',
    durationSeconds: 4
  })

  assert.deepEqual(message, {
    id: 'user-voice-1',
    type: 'user',
    message_type: 'voice',
    avatar: '/images/icons/user.svg',
    content: '这是语音转写',
    voice: {
      transcript: '这是语音转写',
      durationMs: 4000,
      status: 'completed'
    }
  })
})

test('buildAIVoicePlaceholderMessage creates a loading voice reply placeholder', () => {
  const message = buildAIVoicePlaceholderMessage({
    id: 'ai-voice-1',
    avatar: '/images/xiaojiu.png'
  })

  assert.deepEqual(message, {
    id: 'ai-voice-1',
    type: 'ai',
    message_type: 'voice',
    avatar: '/images/xiaojiu.png',
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
  })
})

test('appendVoiceChunkToMessage appends chunk metadata and accumulates duration', () => {
  const initialMessage = buildAIVoicePlaceholderMessage({
    id: 'ai-voice-2'
  })

  const nextMessage = appendVoiceChunkToMessage(initialMessage, {
    audioData: buildBase64ByteLength(3200),
    sampleRate: 16000,
    chunkIndex: 0
  })

  assert.equal(nextMessage.voiceChunks.length, 1)
  assert.equal(nextMessage.voiceChunks[0].sampleRate, 16000)
  assert.equal(nextMessage.voice.totalChunks, 1)
  assert.equal(nextMessage.voice.durationMs, 100)
  assert.equal(nextMessage.voice.status, 'loading')
})

test('isVoiceMessage recognizes voice message_type regardless of case', () => {
  assert.equal(isVoiceMessage({ message_type: 'voice' }), true)
  assert.equal(isVoiceMessage({ message_type: 'VOICE' }), true)
  assert.equal(isVoiceMessage({ message_type: 'text' }), false)
  assert.equal(isVoiceMessage(null), false)
})

test('updateVoiceTranscript replaces transcript and content for voice messages only', () => {
  const message = buildUserVoiceMessage({
    id: 'user-voice-2',
    transcript: '',
    durationSeconds: 2
  })

  const nextMessage = updateVoiceTranscript(message, '新的转写')

  assert.equal(nextMessage.content, '新的转写')
  assert.equal(nextMessage.voice.transcript, '新的转写')

  const textMessage = {
    id: 'text-1',
    type: 'user',
    message_type: 'text',
    content: '原始文本'
  }
  assert.deepEqual(updateVoiceTranscript(textMessage, '不会覆盖'), textMessage)
})

test('appendVoiceTranscript appends subtitle chunks to existing transcript', () => {
  const message = buildAIVoicePlaceholderMessage({
    id: 'ai-voice-3'
  })

  const withFirstChunk = appendVoiceTranscript(message, '第一句')
  const withSecondChunk = appendVoiceTranscript(withFirstChunk, '第二句')

  assert.equal(withSecondChunk.content, '第一句第二句')
  assert.equal(withSecondChunk.voice.transcript, '第一句第二句')
})

test('formatVoiceDurationText rounds milliseconds up to readable seconds', () => {
  assert.equal(formatVoiceDurationText(0), '0秒')
  assert.equal(formatVoiceDurationText(1), '1秒')
  assert.equal(formatVoiceDurationText(999), '1秒')
  assert.equal(formatVoiceDurationText(1001), '2秒')
})

module.exports = tests
