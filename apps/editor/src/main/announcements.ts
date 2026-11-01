import { net } from 'electron'
import { ANNOUNCEMENTS_MAX_BYTES, ANNOUNCEMENTS_TIMEOUT_MS, ANNOUNCEMENTS_URL } from '../shared/announcementsSource'

export { ANNOUNCEMENTS_URL }

/** 받지 못하면(오프라인·시간 초과·서버 오류) null. 파일이 아직 없으면(404) 빈 문자열 */
export async function fetchAnnouncements(): Promise<string | null> {
  try {
    const res = await net.fetch(ANNOUNCEMENTS_URL, {
      cache: 'no-store',
      signal: AbortSignal.timeout(ANNOUNCEMENTS_TIMEOUT_MS)
    })
    if (res.status === 404) return ''
    if (!res.ok) {
      console.error(`공지사항을 받지 못했어요: HTTP ${res.status}`)
      return null
    }
    const text = await res.text()
    if (text.length > ANNOUNCEMENTS_MAX_BYTES) {
      console.error(`공지사항 파일이 너무 커요: ${text.length}자`)
      return null
    }
    return text
  } catch (err) {
    console.error('공지사항을 받지 못했어요', err)
    return null
  }
}
