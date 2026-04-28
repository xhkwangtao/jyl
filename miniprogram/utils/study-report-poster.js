const POSTER_EXPORT_WIDTH = 1192
const POSTER_EXPORT_HEIGHT = 1680
const POSTER_CANVAS_WIDTH = POSTER_EXPORT_WIDTH
const POSTER_CANVAS_HEIGHT = POSTER_EXPORT_HEIGHT

const PAGE_WIDTH_MM = 210
const PAGE_HEIGHT_MM = 297
const CSS_PIXELS_PER_INCH = 96
const MILLIMETERS_PER_INCH = 25.4
const POINTS_PER_INCH = 72
const BODY_FONT_FAMILY = '"Songti SC", "Noto Serif CJK SC", "Noto Serif CJK", "STSong", serif'
const HEADING_FONT_FAMILY = '"PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'

function normalizeTextValue(value = '') {
  return String(value === undefined || value === null ? '' : value).trim()
}

function millimetersToCssPixels(valueMm = 0) {
  return Number(valueMm || 0) * CSS_PIXELS_PER_INCH / MILLIMETERS_PER_INCH
}

function pointsToCssPixels(valuePt = 0) {
  return Number(valuePt || 0) * CSS_PIXELS_PER_INCH / POINTS_PER_INCH
}

const PAGE_CSS_WIDTH = millimetersToCssPixels(PAGE_WIDTH_MM)
const PAGE_CSS_HEIGHT = millimetersToCssPixels(PAGE_HEIGHT_MM)
const SCALE_X = POSTER_EXPORT_WIDTH / PAGE_CSS_WIDTH
const SCALE_Y = POSTER_EXPORT_HEIGHT / PAGE_CSS_HEIGHT
const TEXT_SCALE = (SCALE_X + SCALE_Y) / 2

function pxFromMmX(valueMm = 0) {
  return millimetersToCssPixels(valueMm) * SCALE_X
}

function pxFromMmY(valueMm = 0) {
  return millimetersToCssPixels(valueMm) * SCALE_Y
}

function pxFromPt(valuePt = 0) {
  return pointsToCssPixels(valuePt) * TEXT_SCALE
}

function roundCanvasValue(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function resolveParagraphText(paragraph) {
  if (paragraph && typeof paragraph === 'object') {
    return normalizeTextValue(paragraph.text)
  }

  return normalizeTextValue(paragraph)
}

function paragraphIsStrong(section = {}, paragraph, paragraphIndex = 0) {
  if (paragraph && typeof paragraph === 'object' && paragraph.strong !== undefined) {
    return !!paragraph.strong
  }

  return section?.key === 'cipher' && paragraphIndex === 0
}

function buildFont(weight, fontSizePx, fontFamily) {
  return `${weight} ${roundCanvasValue(fontSizePx)}px ${fontFamily}`
}

function measureTextWidth(ctx, text, letterSpacing = 0) {
  const normalizedText = normalizeTextValue(text)
  if (!normalizedText) {
    return 0
  }

  const characterList = Array.from(normalizedText)
  const baseWidth = ctx.measureText(normalizedText).width

  if (!letterSpacing || characterList.length <= 1) {
    return baseWidth
  }

  return baseWidth + letterSpacing * (characterList.length - 1)
}

function wrapText(ctx, text, maxWidth, letterSpacing = 0) {
  const normalizedText = normalizeTextValue(text)
  if (!normalizedText) {
    return []
  }

  const lineList = []
  let currentLine = ''

  Array.from(normalizedText).forEach((character) => {
    const nextLine = `${currentLine}${character}`
    const nextWidth = measureTextWidth(ctx, nextLine, letterSpacing)

    if (currentLine && nextWidth > maxWidth) {
      lineList.push(currentLine)
      currentLine = character
      return
    }

    currentLine = nextLine
  })

  if (currentLine) {
    lineList.push(currentLine)
  }

  return lineList
}

function drawSingleLine(ctx, text, x, y, align, letterSpacing = 0) {
  const normalizedText = normalizeTextValue(text)
  if (!normalizedText) {
    return
  }

  if (!letterSpacing) {
    ctx.fillText(normalizedText, x, y)
    return
  }

  const totalWidth = measureTextWidth(ctx, normalizedText, letterSpacing)
  let drawX = x

  if (align === 'center') {
    drawX = x - totalWidth / 2
  } else if (align === 'right') {
    drawX = x - totalWidth
  }

  Array.from(normalizedText).forEach((character, characterIndex, characterList) => {
    ctx.fillText(character, drawX, y)
    drawX += ctx.measureText(character).width
    if (characterIndex < characterList.length - 1) {
      drawX += letterSpacing
    }
  })
}

function drawTextBlock(ctx, {
  text,
  x,
  y,
  maxWidth,
  lineHeight,
  font,
  color,
  align = 'left',
  letterSpacing = 0
} = {}) {
  const normalizedText = normalizeTextValue(text)
  if (!normalizedText) {
    return y
  }

  ctx.save()
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'top'

  const lineList = wrapText(ctx, normalizedText, maxWidth, letterSpacing)
  let currentY = y

  lineList.forEach((line) => {
    drawSingleLine(ctx, line, x, currentY, align, letterSpacing)
    currentY += lineHeight
  })

  ctx.restore()
  return currentY
}

function renderMetaBlock(ctx, reportRenderCache, leftEdge, startY) {
  const metaFontSize = pxFromPt(10.5)
  const lineHeight = metaFontSize * 1.45
  const font = buildFont(400, metaFontSize, BODY_FONT_FAMILY)
  let currentY = startY

  ;(reportRenderCache.metaList || []).forEach((metaItem) => {
    const metaText = `${normalizeTextValue(metaItem?.label)}： ${normalizeTextValue(metaItem?.value)}`
    currentY = drawTextBlock(ctx, {
      text: metaText,
      x: leftEdge,
      y: currentY,
      maxWidth: pxFromMmX(80),
      lineHeight,
      font,
      color: '#444444'
    })
  })

  return currentY
}

function renderHeroBlock(ctx, reportRenderCache, centerX, startY) {
  const titleFontSize = pxFromPt(26)
  const subtitleFontSize = pxFromPt(20)
  const titleLineHeight = titleFontSize * 1.2
  const subtitleLineHeight = subtitleFontSize * 1.15
  const titleLetterSpacing = titleFontSize * 0.02

  let currentY = drawTextBlock(ctx, {
    text: reportRenderCache.title,
    x: centerX,
    y: startY,
    maxWidth: pxFromMmX(160),
    lineHeight: titleLineHeight,
    font: buildFont(800, titleFontSize, HEADING_FONT_FAMILY),
    color: '#000000',
    align: 'center',
    letterSpacing: titleLetterSpacing
  })

  currentY += pxFromMmY(4)
  currentY = drawTextBlock(ctx, {
    text: reportRenderCache.subtitle,
    x: centerX,
    y: currentY,
    maxWidth: pxFromMmX(120),
    lineHeight: subtitleLineHeight,
    font: buildFont(400, subtitleFontSize, HEADING_FONT_FAMILY),
    color: '#111111',
    align: 'center'
  })

  return currentY
}

function renderContentSection(ctx, section, leftEdge, bodyWidth, startY) {
  const sectionTitleFontSize = pxFromPt(10.8)
  const bodyFontSize = pxFromPt(10.15)
  const titleLineHeight = sectionTitleFontSize * 1.25
  const bodyLineHeight = bodyFontSize * 1.47

  let currentY = startY

  if (normalizeTextValue(section?.title)) {
    currentY = drawTextBlock(ctx, {
      text: section.title,
      x: leftEdge,
      y: currentY,
      maxWidth: bodyWidth,
      lineHeight: titleLineHeight,
      font: buildFont(800, sectionTitleFontSize, HEADING_FONT_FAMILY),
      color: '#111111'
    })
    currentY += pxFromMmY(0.8)
  }

  ;(Array.isArray(section?.paragraphs) ? section.paragraphs : []).forEach((paragraph, paragraphIndex) => {
    const paragraphText = resolveParagraphText(paragraph)
    const isStrong = paragraphIsStrong(section, paragraph, paragraphIndex)

    currentY = drawTextBlock(ctx, {
      text: paragraphText,
      x: leftEdge,
      y: currentY,
      maxWidth: bodyWidth,
      lineHeight: bodyLineHeight,
      font: buildFont(isStrong ? 700 : 400, bodyFontSize, BODY_FONT_FAMILY),
      color: isStrong ? '#222222' : '#555555'
    })
  })

  return currentY
}

function renderAwardSection(ctx, section, centerX, startY) {
  const bodyFontSize = pxFromPt(10.15)
  const awardFontSize = pxFromPt(10.8)
  const bodyLineHeight = bodyFontSize * 1.5
  const awardLineHeight = awardFontSize * 1.25
  const maxWidth = pxFromMmX(136)
  let currentY = startY

  ;(Array.isArray(section?.paragraphs) ? section.paragraphs : []).forEach((paragraph) => {
    const paragraphText = resolveParagraphText(paragraph)
    currentY = drawTextBlock(ctx, {
      text: paragraphText,
      x: centerX,
      y: currentY,
      maxWidth,
      lineHeight: bodyLineHeight,
      font: buildFont(400, bodyFontSize, BODY_FONT_FAMILY),
      color: '#333333',
      align: 'center'
    })
  })

  const highlightText = normalizeTextValue((section?.highlightLines || [])[0])
  if (highlightText) {
    currentY += pxFromMmY(1)
    currentY = drawTextBlock(ctx, {
      text: highlightText,
      x: centerX,
      y: currentY,
      maxWidth,
      lineHeight: awardLineHeight,
      font: buildFont(800, awardFontSize, HEADING_FONT_FAMILY),
      color: '#000000',
      align: 'center'
    })
  }

  return currentY
}

function renderStudyReportPoster(ctx, reportRenderCache = {}) {
  if (!ctx || !reportRenderCache || !reportRenderCache.hasContent) {
    return
  }

  const leftEdge = pxFromMmX(24)
  const rightEdge = POSTER_EXPORT_WIDTH - pxFromMmX(24)
  const bodyWidth = rightEdge - leftEdge
  const centerX = POSTER_EXPORT_WIDTH / 2

  ctx.clearRect(0, 0, POSTER_EXPORT_WIDTH, POSTER_EXPORT_HEIGHT)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, POSTER_EXPORT_WIDTH, POSTER_EXPORT_HEIGHT)

  let currentY = pxFromMmY(28)
  currentY = renderMetaBlock(ctx, reportRenderCache, leftEdge, currentY)
  currentY += pxFromMmY(15)
  currentY = renderHeroBlock(ctx, reportRenderCache, centerX, currentY)

  ;(reportRenderCache.sectionList || []).forEach((section, sectionIndex) => {
    if (section?.key === 'overall') {
      currentY += pxFromMmY(10)
    } else if (section?.key === 'badge') {
      currentY += pxFromMmY(8.2)
    } else if (section?.key === 'final') {
      currentY += pxFromMmY(8.6)
    } else if (sectionIndex > 0) {
      currentY += pxFromMmY(5.1)
    }

    if (section?.key === 'badge') {
      currentY = renderAwardSection(ctx, section, centerX, currentY)
      return
    }

    currentY = renderContentSection(ctx, section, leftEdge, bodyWidth, currentY)
  })
}

module.exports = {
  POSTER_CANVAS_WIDTH,
  POSTER_CANVAS_HEIGHT,
  POSTER_EXPORT_WIDTH,
  POSTER_EXPORT_HEIGHT,
  renderStudyReportPoster
}
