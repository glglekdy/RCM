/**
 * 공지사항 파일. 공개 저장소 main 브랜치의 NOTICES.md를 그대로 읽으므로,
 * 이 파일만 고쳐 푸시하면 배포 없이 모든 사용자에게 보인다 (GitHub 캐시 때문에 몇 분 늦을 수 있다).
 */
export const ANNOUNCEMENTS_URL = 'https://raw.githubusercontent.com/glglekdy/RCM/main/NOTICES.md'

export const ANNOUNCEMENTS_TIMEOUT_MS = 10_000
/** 이보다 큰 응답은 공지 파일이 아니라고 보고 버린다 */
export const ANNOUNCEMENTS_MAX_BYTES = 256 * 1024
