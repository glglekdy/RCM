/**
 * AI 가이드 알림 id. 가이드 문서 내용으로 만들어서, 문서가 바뀐 버전에서만 홈 사이드바에 알림이 다시 뜬다.
 * 닫은 공지 목록(설정의 dismissedNotices)에 그대로 저장하므로 `[a-z0-9-]` 형식을 지킨다.
 */
export function guideNoticeId(guide: string): string {
  // FNV-1a 32비트. CI는 CRLF로 체크아웃하므로 줄바꿈을 맞춘 뒤 계산한다
  let hash = 0x811c9dc5
  for (const ch of guide.replace(/\r\n/g, '\n')) {
    hash ^= ch.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193)
  }
  return `ai-guide-${(hash >>> 0).toString(16).padStart(8, '0')}`
}
