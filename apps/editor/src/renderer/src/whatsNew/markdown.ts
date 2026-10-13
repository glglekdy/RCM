/** 업데이트 내역에 쓰는 만큼만 읽는 Markdown: `## 제목`, `- 목록`, 문단, 인라인 `코드`와 **굵게** */
export type NotesBlock =
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string }

export interface InlinePart {
  kind: 'text' | 'code' | 'bold'
  text: string
}

export function parseNotes(text: string): NotesBlock[] {
  const blocks: NotesBlock[] = []
  // 빈 줄이 문단을 끝낸다 (바로 다음 줄이면 같은 문단으로 잇는다)
  let paragraphOpen = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const last = blocks[blocks.length - 1]
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    const item = /^[-*]\s+(.*)$/.exec(line)
    if (line === '') {
      paragraphOpen = false
      continue
    }
    if (heading) blocks.push({ type: 'heading', text: heading[1] })
    else if (item) {
      if (last?.type === 'list') last.items.push(item[1])
      else blocks.push({ type: 'list', items: [item[1]] })
    } else if (paragraphOpen && last?.type === 'paragraph') last.text += ` ${line}`
    else blocks.push({ type: 'paragraph', text: line })
    paragraphOpen = !heading && !item
  }
  return blocks
}

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*/g

export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  let at = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > at) parts.push({ kind: 'text', text: text.slice(at, m.index) })
    parts.push(m[1] !== undefined ? { kind: 'code', text: m[1] } : { kind: 'bold', text: m[2] })
    at = m.index + m[0].length
  }
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) })
  return parts
}
