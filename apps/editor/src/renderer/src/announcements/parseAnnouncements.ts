export interface Announcement {
  /** 설정의 seenAnnouncements에 저장하는 id. 날짜와 제목으로 만든다 (`[a-z0-9-]`) */
  id: string
  /** `YYYY-MM-DD`. 제목 줄에 날짜가 없으면 빈 문자열 */
  date: string
  title: string
  /** 업데이트 내역과 같은 Markdown (`### 소제목`, `- 목록`, 문단, `코드`, **굵게**) */
  body: string
}

/** FNV-1a 32비트 → 8자리 16진수 */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (const ch of text) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * 공지사항 파일(저장소의 NOTICES.md)을 읽는다. `## YYYY-MM-DD 제목` 줄마다 공지 하나이고,
 * 다음 `## ` 줄 전까지가 본문이다. 첫 `## ` 전의 글과 `<!-- 주석 -->`은 앱에 보이지 않는다.
 * 파일에 적은 순서 그대로 (맨 위가 최신) 돌려준다.
 */
export function parseAnnouncements(text: string): Announcement[] {
  const list: Announcement[] = []
  let current: { date: string; title: string; lines: string[] } | null = null
  const flush = (): void => {
    if (!current || current.title === '') return
    const base = `${current.date ? `${current.date}-` : ''}${hash(`${current.date} ${current.title}`)}`
    // 같은 날짜·제목이 또 있으면 뒤에 번호를 붙여 id가 겹치지 않게 한다
    let id = base
    for (let n = 2; list.some((a) => a.id === id); n++) id = `${base}-${n}`
    list.push({ id, date: current.date, title: current.title, body: current.lines.join('\n').trim() })
  }
  const withoutComments = text.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '')
  for (const line of withoutComments.split('\n')) {
    const heading = /^##\s+(.*)$/.exec(line.trim())
    if (heading) {
      flush()
      const m = /^(\d{4}-\d{2}-\d{2})\s*(.*)$/.exec(heading[1].trim())
      current = m ? { date: m[1], title: m[2].trim(), lines: [] } : { date: '', title: heading[1].trim(), lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  flush()
  return list
}
