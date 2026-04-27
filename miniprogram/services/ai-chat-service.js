const request = require('../utils/request')

const AI_CHAT_STREAM_URL = '/client/ai-agent/chat/stream'
const AI_VOICE_CHAT_STREAM_URL = '/client/ai-agent/voice-chat/stream'

function safeDecodeUtf8(arrayBuffer, decoder) {
  if (!arrayBuffer) {
    return ''
  }

  if (decoder && typeof decoder.decode === 'function') {
    return decoder.decode(arrayBuffer, { stream: true })
  }

  const bytes = new Uint8Array(arrayBuffer)
  let text = ''
  for (let index = 0; index < bytes.length; index += 1) {
    text += String.fromCharCode(bytes[index])
  }

  try {
    return decodeURIComponent(escape(text))
  } catch (error) {
    return text
  }
}

function createSSEParser(onEvent) {
  let buffer = ''

  return {
    push(text = '') {
      buffer += text

      while (buffer.includes('\n\n')) {
        const splitIndex = buffer.indexOf('\n\n')
        const rawBlock = buffer.slice(0, splitIndex)
        buffer = buffer.slice(splitIndex + 2)

        if (!rawBlock.trim()) {
          continue
        }

        const lines = rawBlock.split('\n')
        let eventName = ''
        const dataLines = []

        lines.forEach((line) => {
          if (line.startsWith('event: ')) {
            eventName = line.slice(7).trim()
            return
          }

          if (line.startsWith('data: ')) {
            dataLines.push(line.slice(6))
          }
        })

        if (!dataLines.length) {
          continue
        }

        try {
          onEvent(eventName, JSON.parse(dataLines.join('\n')))
        } catch (error) {
          // Ignore malformed event payloads so one bad block does not break the stream.
        }
      }
    },
    flush() {
      if (buffer.trim()) {
        this.push('\n\n')
      }
    }
  }
}

function normalizeMetricText(textValue, value, unit) {
  const preferredText = String(textValue || '').trim()
  if (preferredText) {
    return preferredText
  }

  const normalizedValue = String(value || '').trim()
  if (!normalizedValue) {
    return ''
  }

  return /[^\d.\s]/.test(normalizedValue) ? normalizedValue : `${normalizedValue} ${unit}`
}

function normalizeDurationText(textValue, value) {
  const preferredText = String(textValue || '').trim()
  if (preferredText) {
    return preferredText
  }

  const normalizedValue = String(value || '').trim()
  if (!normalizedValue) {
    return ''
  }

  return /[^\d.\s]/.test(normalizedValue) ? normalizedValue : `${normalizedValue}秒`
}

function extractRoutePointNames(rawRouteCard = {}, routeData = {}) {
  const preferredPoints = Array.isArray(rawRouteCard.pointNamesPreview) && rawRouteCard.pointNamesPreview.length
    ? rawRouteCard.pointNamesPreview
    : Array.isArray(rawRouteCard.pointNames) && rawRouteCard.pointNames.length
      ? rawRouteCard.pointNames
      : Array.isArray(routeData.pois) && routeData.pois.length
        ? routeData.pois
        : Array.isArray(routeData.points) && routeData.points.length
          ? routeData.points
          : []

  return preferredPoints
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim()
      }

      if (item && typeof item === 'object') {
        return String(item.name || item.title || item.id || '').trim()
      }

      return ''
    })
    .filter(Boolean)
}

function buildRouteCard(rawRouteCard = {}) {
  const routeData = rawRouteCard.routeData && typeof rawRouteCard.routeData === 'object'
    ? rawRouteCard.routeData
    : {}
  const routePointNames = extractRoutePointNames(rawRouteCard, routeData)
  const pointCount = Number(rawRouteCard.pointCount || rawRouteCard.attractions) || routePointNames.length
  const previewCount = Math.min(routePointNames.length, 6)
  const remainingPointCountValue = Number(rawRouteCard.remainingPointCount)
  const remainingPointCount = Number.isFinite(remainingPointCountValue)
    ? Math.max(remainingPointCountValue, 0)
    : Math.max(pointCount - previewCount, 0)

  return {
    title: rawRouteCard.title || '智能路线规划',
    name: rawRouteCard.name || rawRouteCard.title || '推荐路线',
    description: rawRouteCard.description || '',
    durationText: normalizeMetricText(rawRouteCard.durationText, rawRouteCard.duration, '小时'),
    distanceText: normalizeMetricText(rawRouteCard.distanceText, rawRouteCard.distance, '公里'),
    pointCount,
    pointNamesPreview: routePointNames.slice(0, previewCount),
    remainingPointCount,
    routeData
  }
}

function buildImageGroup(rawImageGroup = {}) {
  const images = Array.isArray(rawImageGroup.images)
    ? rawImageGroup.images
      .map((item) => ({
        url: item?.url || item?.imageUrl || '',
        caption: item?.caption || item?.description || ''
      }))
      .filter((item) => item.url)
    : []

  return {
    title: rawImageGroup.title || '',
    description: rawImageGroup.description || '',
    images
  }
}

function buildSingleImageGroup(rawImage = {}) {
  const imageUrl = rawImage.imageUrl || rawImage.url || ''

  return {
    title: rawImage.title || '',
    description: rawImage.description || '',
    images: imageUrl
      ? [{
          url: imageUrl,
          caption: rawImage.description || rawImage.title || ''
        }]
      : []
  }
}

function buildVideoCard(rawVideoCard = {}) {
  const videoUrl = rawVideoCard.videoUrl || rawVideoCard.url || rawVideoCard.src || ''
  const coverUrl = rawVideoCard.coverUrl || rawVideoCard.poster || rawVideoCard.imageUrl || ''
  const durationText = normalizeDurationText(rawVideoCard.durationText, rawVideoCard.duration)

  return {
    title: rawVideoCard.title || rawVideoCard.name || '景区视频',
    description: rawVideoCard.description || rawVideoCard.caption || '',
    videoUrl,
    coverUrl,
    durationText
  }
}

function normalizeSSEPayload(eventName, payload) {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  if (payload.route_planning_card) {
    return [{
      type: 'route-card',
      routeCard: buildRouteCard(payload.route_planning_card)
    }]
  }

  if (payload.imageScroll) {
    return [{
      type: 'image-group',
      imageGroup: buildImageGroup(payload.imageScroll)
    }]
  }

  if (payload.imageGroup) {
    return [{
      type: 'image-group',
      imageGroup: buildImageGroup(payload.imageGroup)
    }]
  }

  if (payload.image_display) {
    return [{
      type: 'image-group',
      imageGroup: buildSingleImageGroup(payload.image_display)
    }]
  }

  if (payload.videoCard) {
    return [{
      type: 'video-card',
      videoCard: buildVideoCard(payload.videoCard)
    }]
  }

  if (payload.video_display) {
    return [{
      type: 'video-card',
      videoCard: buildVideoCard(payload.video_display)
    }]
  }

  if (payload.component === 'route_planning_card' && payload.data) {
    return [{
      type: 'route-card',
      routeCard: buildRouteCard(payload.data)
    }]
  }

  if ((payload.component === 'imageScroll' || payload.component === 'image_scroll') && payload.data) {
    return [{
      type: 'image-group',
      imageGroup: buildImageGroup(payload.data)
    }]
  }

  if (payload.component === 'imageGroup' && payload.data) {
    return [{
      type: 'image-group',
      imageGroup: buildImageGroup(payload.data)
    }]
  }

  if (payload.component === 'image_display' && payload.data) {
    return [{
      type: 'image-group',
      imageGroup: buildSingleImageGroup(payload.data)
    }]
  }

  if (payload.component === 'video_display' && payload.data) {
    return [{
      type: 'video-card',
      videoCard: buildVideoCard(payload.data)
    }]
  }

  if (payload.type === 'component' && payload.component === 'video_display' && payload.content) {
    return [{
      type: 'video-card',
      videoCard: buildVideoCard(payload.content)
    }]
  }

  if ((eventName === 'image-group' || payload.type === 'image-group') && (payload.imageGroup || payload.data || payload.content)) {
    return [{
      type: 'image-group',
      imageGroup: buildImageGroup(payload.imageGroup || payload.data || payload.content)
    }]
  }

  if ((eventName === 'video-card' || payload.type === 'video-card') && (payload.videoCard || payload.data || payload.content || payload.videoUrl || payload.url)) {
    return [{
      type: 'video-card',
      videoCard: buildVideoCard(payload.videoCard || payload.data || payload.content || payload)
    }]
  }

  if (eventName === 'start' || payload.type === 'start') {
    return [{
      type: 'start',
      sessionId: payload.session_id || payload.sessionId || ''
    }]
  }

  if (eventName === 'state' || payload.type === 'state') {
    return [{
      type: 'state',
      state: payload.state || '',
      message: payload.message || ''
    }]
  }

  if (eventName === 'transcription' || payload.type === 'transcription') {
    return [{
      type: 'transcription',
      text: payload.text || payload.content || ''
    }]
  }

  if (eventName === 'audio_chunk' || payload.type === 'audio_chunk') {
    return [{
      type: 'audio_chunk',
      audioData: payload.audio_data || payload.audioData || '',
      sampleRate: payload.sample_rate || payload.sampleRate || 16000,
      chunkIndex: payload.chunk_index || payload.chunkIndex || 0,
      format: payload.format || 'pcm_s16le'
    }]
  }

  if (eventName === 'text' || payload.type === 'text') {
    return [{
      type: 'text',
      content: payload.content || ''
    }]
  }

  if (eventName === 'error' || payload.type === 'error') {
    return [{
      type: 'error',
      code: payload.code || 'stream_error',
      message: payload.message || '请求失败'
    }]
  }

  if (eventName === 'done' || payload.type === 'done') {
    return [{
      type: 'done',
      message: payload.message || 'complete'
    }]
  }

  return []
}

class AIChatService {
  createStream(url, payload, handlers = {}) {
    const decoder = typeof TextDecoder !== 'undefined'
      ? new TextDecoder('utf-8')
      : null
    const parser = createSSEParser((eventName, eventPayload) => {
      normalizeSSEPayload(eventName, eventPayload).forEach((event) => {
        if (typeof handlers.onEvent === 'function') {
          handlers.onEvent(event)
        }
      })
    })

    return request.stream({
      url,
      method: 'POST',
      data: payload,
      onChunk: (arrayBuffer) => {
        parser.push(safeDecodeUtf8(arrayBuffer, decoder))
      },
      onComplete: () => {
        parser.flush()
        if (typeof handlers.onComplete === 'function') {
          handlers.onComplete()
        }
      },
      onError: (error) => {
        if (typeof handlers.onError === 'function') {
          handlers.onError(error)
        }
      }
    })
  }

  streamChat({ message, sessionId, scene = 'guide', onEvent, onComplete, onError }) {
    return this.createStream(
      AI_CHAT_STREAM_URL,
      {
        message,
        session_id: sessionId,
        scene
      },
      { onEvent, onComplete, onError }
    )
  }

  streamVoiceChat({
    message,
    audioData,
    audioFormat = 'wav',
    sessionId,
    outputMode = 'text',
    onEvent,
    onComplete,
    onError
  }) {
    const data = {
      audio_data: audioData,
      audio_format: audioFormat,
      session_id: sessionId,
      output_mode: outputMode
    }
    if (message) {
      data.message = message
    }

    return this.createStream(
      AI_VOICE_CHAT_STREAM_URL,
      data,
      { onEvent, onComplete, onError }
    )
  }
}

module.exports = new AIChatService()
