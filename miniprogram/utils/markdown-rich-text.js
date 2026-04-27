function createTextNode(text) {
  return {
    type: 'text',
    text
  }
}

function createParagraph(children, marginBottom = 8) {
  return {
    name: 'p',
    attrs: {
      style: `margin: 0 0 ${marginBottom}px; line-height: 1.7; color: #333333; font-size: 14px; white-space: pre-wrap;`
    },
    children
  }
}

function createHeading(text, level) {
  const styles = {
    1: 'margin: 0 0 10px; line-height: 1.35; color: #16222c; font-size: 18px; font-weight: 700;',
    2: 'margin: 0 0 10px; line-height: 1.35; color: #16222c; font-size: 16px; font-weight: 700;',
    3: 'margin: 0 0 8px; line-height: 1.4; color: #16222c; font-size: 15px; font-weight: 700;'
  }

  return {
    name: `h${Math.min(Math.max(level, 1), 3)}`,
    attrs: {
      style: styles[level] || styles[3]
    },
    children: parseInline(text)
  }
}

function createList(listType) {
  const marginStyle = listType === 'ul'
    ? 'margin: 0 0 10px 24px;'
    : 'margin: 0 0 10px;'

  return {
    name: 'div',
    attrs: {
      'data-list-type': listType,
      style: `${marginStyle} color: #333333;`
    },
    children: []
  }
}

function createListItem(text, marker) {
  return {
    name: 'div',
    attrs: {
      style: 'display: flex; align-items: flex-start; margin: 0 0 6px; line-height: 1.7; font-size: 14px;'
    },
    children: [
      {
        name: 'span',
        attrs: {
          style: 'display: inline-block; width: 24px; flex-shrink: 0; color: #58636c;'
        },
        children: [createTextNode(marker)]
      },
      {
        name: 'span',
        attrs: {
          style: 'display: inline; flex: 1; white-space: pre-wrap;'
        },
        children: parseInline(text)
      }
    ]
  }
}

function createBlockquote(text) {
  return {
    name: 'blockquote',
    attrs: {
      style: 'margin: 0 0 10px; padding: 8px 10px; border-left: 3px solid #d5dce2; background: #f7fafc; color: #58636c;'
    },
    children: [{
      name: 'p',
      attrs: {
        style: 'margin: 0; line-height: 1.7; color: #58636c; font-size: 14px; white-space: pre-wrap;'
      },
      children: parseInline(text)
    }]
  }
}

function createCodeBlock(code) {
  return {
    name: 'pre',
    attrs: {
      style: 'margin: 0 0 10px; padding: 10px 12px; background: #f5f7fa; border-radius: 8px; color: #1f2933; font-size: 13px; line-height: 1.6; white-space: pre-wrap;'
    },
    children: [{
      name: 'code',
      attrs: {
        style: 'font-family: Menlo, Monaco, Consolas, monospace;'
      },
      children: [createTextNode(code)]
    }]
  }
}

function createHorizontalRule() {
  return {
    name: 'div',
    attrs: {
      style: 'margin: 8px 0 12px; border-top: 1px solid #e5e7eb;'
    },
    children: []
  }
}

function applyPattern(nodes, pattern, builder) {
  const nextNodes = []

  nodes.forEach((node) => {
    if (node.type !== 'text') {
      nextNodes.push(node)
      return
    }

    const text = node.text
    let cursor = 0
    let match = pattern.exec(text)

    while (match) {
      if (match.index > cursor) {
        nextNodes.push(createTextNode(text.slice(cursor, match.index)))
      }

      nextNodes.push(builder(match))
      cursor = match.index + match[0].length
      match = pattern.exec(text)
    }

    if (cursor < text.length) {
      nextNodes.push(createTextNode(text.slice(cursor)))
    }

    pattern.lastIndex = 0
  })

  return nextNodes
}

function parseInline(text) {
  let nodes = [createTextNode(String(text || ''))]

  nodes = applyPattern(nodes, /!\[([^\]]*)\]\(([^)]+)\)/g, (match) => ({
    name: 'img',
    attrs: {
      src: match[2],
      alt: match[1] || '',
      style: 'display: block; max-width: 100%; width: 100%; border-radius: 8px; margin: 8px 0;'
    }
  }))
  nodes = applyPattern(nodes, /\*\*(.+?)\*\*/g, (match) => ({
    name: 'strong',
    attrs: { style: 'font-weight: 700;' },
    children: [createTextNode(match[1])]
  }))
  nodes = applyPattern(nodes, /__(.+?)__/g, (match) => ({
    name: 'strong',
    attrs: { style: 'font-weight: 700;' },
    children: [createTextNode(match[1])]
  }))
  nodes = applyPattern(nodes, /~~(.+?)~~/g, (match) => ({
    name: 'span',
    attrs: { style: 'text-decoration: line-through;' },
    children: [createTextNode(match[1])]
  }))
  nodes = applyPattern(nodes, /`([^`]+)`/g, (match) => ({
    name: 'code',
    attrs: {
      style: 'padding: 1px 4px; background: #f3f4f6; border-radius: 4px; font-family: Menlo, Monaco, Consolas, monospace; font-size: 13px;'
    },
    children: [createTextNode(match[1])]
  }))
  nodes = applyPattern(nodes, /\[([^\]]+)\]\(([^)]+)\)/g, (match) => ({
    name: 'a',
    attrs: {
      href: match[2],
      style: 'color: #0f7f78; text-decoration: underline;'
    },
    children: [createTextNode(match[1])]
  }))
  nodes = applyPattern(nodes, /(^|[^\*])\*([^*\n]+)\*(?!\*)/g, (match) => {
    const prefix = match[1] || ''
    return {
      name: 'fragment',
      children: [
        prefix ? createTextNode(prefix) : null,
        {
          name: 'em',
          attrs: { style: 'font-style: italic;' },
          children: [createTextNode(match[2])]
        }
      ].filter(Boolean)
    }
  }).flatMap((node) => {
    if (node.name === 'fragment') {
      return node.children
    }
    return node
  })
  nodes = applyPattern(nodes, /(^|[^_])_([^_\n]+)_(?!_)/g, (match) => {
    const prefix = match[1] || ''
    return {
      name: 'fragment',
      children: [
        prefix ? createTextNode(prefix) : null,
        {
          name: 'em',
          attrs: { style: 'font-style: italic;' },
          children: [createTextNode(match[2])]
        }
      ].filter(Boolean)
    }
  }).flatMap((node) => {
    if (node.name === 'fragment') {
      return node.children
    }
    return node
  })

  return nodes
}

function hasMarkdownSyntax(text) {
  return /(^\s*#{1,6}\s)|(^\s*[-*+]\s)|(^\s*\d+\.)|(```)|(\*\*.+?\*\*)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(^\s*>\s?)/m.test(String(text || ''))
}

function render(markdown) {
  const content = String(markdown || '')
  if (!content) {
    return []
  }

  if (!hasMarkdownSyntax(content)) {
    return [createParagraph([createTextNode(content)], 8)]
  }

  const lines = content.split('\n')
  const nodes = []
  let currentList = null
  let currentListType = ''
  let orderedListNextNumber = 1
  let codeFence = false
  const codeLines = []

  const closeCurrentList = () => {
    currentList = null
    currentListType = ''
  }

  lines.forEach((line, index) => {
    const trimmedLine = line.trim()

    if (trimmedLine.startsWith('```')) {
      if (!codeFence) {
        codeFence = true
        closeCurrentList()
        return
      }

      codeFence = false
      nodes.push(createCodeBlock(codeLines.join('\n')))
      codeLines.length = 0
      return
    }

    if (codeFence) {
      codeLines.push(line)
      return
    }

    if (!trimmedLine) {
      return
    }

    const headingMatch = line.match(/^\s*(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      closeCurrentList()
      orderedListNextNumber = 1
      nodes.push(createHeading(headingMatch[2], headingMatch[1].length))
      return
    }

    const orderedMatch = line.match(/^\s*(\d+)\.\s*(.+)$/)
    if (orderedMatch) {
      if (!currentList || currentListType !== 'ol') {
        currentList = createList('ol')
        currentListType = 'ol'
        nodes.push(currentList)
      }
      const rawNumber = Number(orderedMatch[1])
      const markerNumber = Number.isFinite(rawNumber) && rawNumber > 1
        ? rawNumber
        : orderedListNextNumber

      currentList.children.push(createListItem(orderedMatch[2], `${markerNumber}.`))
      orderedListNextNumber = markerNumber + 1
      return
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/)
    if (unorderedMatch) {
      if (!currentList || currentListType !== 'ul') {
        currentList = createList('ul')
        currentListType = 'ul'
        nodes.push(currentList)
      }
      currentList.children.push(createListItem(unorderedMatch[1], '•'))
      return
    }

    if (/^---+$/.test(trimmedLine) || /^\*\*\*+$/.test(trimmedLine)) {
      closeCurrentList()
      orderedListNextNumber = 1
      nodes.push(createHorizontalRule())
      return
    }

    const quoteMatch = line.match(/^\s*>\s?(.*)$/)
    if (quoteMatch) {
      closeCurrentList()
      orderedListNextNumber = 1
      nodes.push(createBlockquote(quoteMatch[1]))
      return
    }

    closeCurrentList()
    orderedListNextNumber = 1
    nodes.push(createParagraph(parseInline(line), index === lines.length - 1 ? 0 : 8))
  })

  if (codeFence && codeLines.length) {
    nodes.push(createCodeBlock(codeLines.join('\n')))
  }

  return nodes
}

module.exports = {
  render
}
