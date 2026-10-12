/** 업데이트 내역에 넣는 커밋 종류와 제목. 나머지(docs, chore, test, refactor 등)는 사용자에게 보이지 않는 변경으로 본다. */
const SECTIONS = [
  ['feat', '새 기능'],
  ['fix', '버그 수정'],
  ['perf', '성능 개선'],
]

const COMMIT_RE = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/

/** 지난 배포 뒤 커밋 제목들로 업데이트 내역(Markdown)을 만든다. */
export function buildReleaseNotes(subjects) {
  const groups = new Map(SECTIONS.map(([type]) => [type, []]))
  for (const subject of subjects) {
    const m = COMMIT_RE.exec(subject.trim())
    if (m) groups.get(m[1])?.push(m[2])
  }
  const parts = SECTIONS.filter(([type]) => groups.get(type).length > 0).map(
    ([type, title]) => `## ${title}\n\n${groups.get(type).map((s) => `- ${s}`).join('\n')}`
  )
  return parts.length > 0 ? parts.join('\n\n') : '- 내부 정리 (화면에 보이는 변경 없음)'
}

/** 주석 태그 메시지: 첫 줄은 태그 이름, 빈 줄 다음에 업데이트 내역. */
export function tagMessage(tag, notes) {
  return `${tag}\n\n${notes.trim()}\n`
}
