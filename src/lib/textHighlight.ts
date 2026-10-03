import DOMPurify from 'dompurify'

const normalizeCharacter = (char: string) => char.toLocaleLowerCase('tr-TR')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[\u00ad\u200b]/g, '')

export const normalizeHighlightText = (text: string) => Array.from(text, normalizeCharacter)
  .join('').replace(/\s+/g, ' ').trim()

export const readerHighlightTerms = (params: URLSearchParams, visibleText: string): string[] => {
  const quote = params.get('highlight')
  if (quote) return [quote]
  const query = params.get('q') || ''
  // Older notifications used q for the entire sentence, including commas.
  if (query && normalizeHighlightText(visibleText).includes(normalizeHighlightText(query))) return [query]
  return query.split(',').map(term => term.trim()).filter(Boolean)
}

// Search visible text across inline glossary spans without editing HTML attributes.
export const highlightHtml = (html: string, keywords: string[], colorForIndex: (index: number) => string): string => {
  const root = document.createElement('div')
  root.innerHTML = DOMPurify.sanitize(html)
  if (!keywords.some(keyword => keyword.trim())) return root.innerHTML
  type Position = { node: Text; offset: number }
  const positions: Array<Position | null> = []
  let normalized = ''
  const append = (character: string, position: Position | null) => {
    for (const char of normalizeCharacter(character)) {
      if (/\s/.test(char)) {
        if (normalized.endsWith(' ')) continue
        normalized += ' '
      } else normalized += char
      positions.push(position)
    }
  }
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text
      for (let offset = 0; offset < text.length; offset++) append(text.data[offset], { node: text, offset })
      return
    }
    const element = node as Element
    const block = /^(P|DIV|SECTION|ASIDE|BLOCKQUOTE|BR|H[1-6]|LI)$/.test(element.tagName)
    if (block) append(' ', null)
    for (const child of Array.from(node.childNodes)) visit(child)
    if (block) append(' ', null)
  }
  visit(root)
  const ranges = new Map<Text, Array<{ start: number; end: number; color: string }>>()
  const occupied = new Set<number>()
  keywords.forEach((keyword, keywordIndex) => {
    const needle = normalizeHighlightText(keyword)
    if (!needle) return
    let start = normalized.indexOf(needle)
    while (start !== -1) {
      const end = start + needle.length
      if (!Array.from({ length: end - start }, (_, offset) => start + offset).some(index => occupied.has(index))) {
        let current: { node: Text; start: number; end: number } | null = null
        const flush = () => {
          if (!current) return
          const entries = ranges.get(current.node) || []
          entries.push({ start: current.start, end: current.end, color: colorForIndex(keywordIndex) })
          ranges.set(current.node, entries)
        }
        for (let index = start; index < end; index++) {
          occupied.add(index)
          const position = positions[index]
          if (!position) continue
          if (current && (current as { node: Text }).node === position.node) (current as { end: number }).end = position.offset + 1
          else {
            flush()
            current = { node: position.node, start: position.offset, end: position.offset + 1 }
          }
        }
        flush()
      }
      start = normalized.indexOf(needle, end)
    }
  })
  ranges.forEach((entries, node) => {
    const fragment = document.createDocumentFragment()
    let offset = 0
    for (const entry of entries.sort((a, b) => a.start - b.start)) {
      fragment.append(node.data.slice(offset, entry.start))
      const mark = document.createElement('mark')
      mark.style.backgroundColor = entry.color
      mark.style.color = '#1a202c'
      mark.style.borderRadius = '2px'
      mark.textContent = node.data.slice(entry.start, entry.end)
      fragment.append(mark)
      offset = entry.end
    }
    fragment.append(node.data.slice(offset))
    node.replaceWith(fragment)
  })
  return root.innerHTML
}
