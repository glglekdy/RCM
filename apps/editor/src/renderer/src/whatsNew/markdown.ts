/** 업데이트 내역·공지사항에 쓰는 만큼만 읽는 Markdown: `## 제목`, `- 목록`, 문단, 한 줄짜리 `![설명](주소)` 그림, 인라인 `코드`와 **굵게** */
export type NotesBlock =
  | { type: 'heading'; text: string }
  | { type: 'image'; alt: string; src: string }
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
    const image = /^!\[([^\]]*)\]\(\s*([^\s)]+)\s*\)$/.exec(line)
    if (line === '') {
      paragraphOpen = false
      continue
    }
    if (heading) blocks.push({ type: 'heading', text: heading[1] })
    else if (image) blocks.push({ type: 'image', alt: image[1], src: image[2] })
    else if (item) {
      if (last?.type === 'list') last.items.push(item[1])
      else blocks.push({ type: 'list', items: [item[1]] })
    } else if (paragraphOpen && last?.type === 'paragraph') last.text += ` ${line}`
    else blocks.push({ type: 'paragraph', text: line })
    paragraphOpen = !heading && !item && !image
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

/**
 * 그림 주소를 `base`(공지 파일 주소 등) 기준으로 풀어 https 주소만 돌려준다.
 * 저장소 안 상대 경로(`notices/a.png`)를 쓰면 GitHub에서 봐도, 앱에서 봐도 같은 그림이 보인다.
 */
export function resolveImageSrc(src: string, base?: string): string | null {
  try {
    const url = new URL(src, base)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}
