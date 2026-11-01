import { net } from 'electron'

/**
 * 공지사항 파일. 공개 저장소 main 브랜치의 NOTICES.md를 그대로 읽으므로,
 * 이 파일만 고쳐 푸시하면 배포 없이 모든 사용자에게 보인다 (GitHub 캐시 때문에 몇 분 늦을 수 있다).
 */
export const ANNOUNCEMENTS_URL = 'https://raw.githubusercontent.com/glglekdy/RCM/main/NOTICES.md'

const TIMEOUT_MS = 10_000
/** 이보다 큰 응답은 공지 파일이 아니라고 보고 버린다 */
const MAX_BYTES = 256 * 1024

/** 받지 못하면(오프라인·시간 초과·서버 오류) null. 파일이 아직 없으면(404) 빈 문자열 */
export async function fetchAnnouncements(): Promise<string | null> {
  try {
    const res = await net.fetch(ANNOUNCEMENTS_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (res.status === 404) return ''
    if (!res.ok) {
      console.error(`공지사항을 받지 못했어요: HTTP ${res.status}`)
      return null
    }
    const text = await res.text()
    if (text.length > MAX_BYTES) {
      console.error(`공지사항 파일이 너무 커요: ${text.length}자`)
      return null
    }
    return text
  } catch (err) {
    console.error('공지사항을 받지 못했어요', err)
    return null
  }
}
