/** 렌더러가 메인에 알리는 편집 화면 상태. 홈 화면이면 null을 보낸다. */
export interface PresenceInfo {
  title: string
  artist: string
  chart: string
  level: number
  /** 이 프로젝트를 연 시각 (ms epoch) */
  since: number
}

/** 디스코드 `SET_ACTIVITY`의 activity 객체 (쓰는 필드만). */
export interface DiscordActivity {
  type: 0
  details?: string
  state?: string
  timestamps: { start: number }
  assets: { large_image: string; large_text: string }
  buttons: { label: string; url: string }[]
}

export const PRESENCE_BUTTON = { label: '채보 짜러가기!', url: 'https://github.com/glglekdy/RCM/tags' }
export const PRESENCE_IMAGE = 'rcm'
export const PRESENCE_IMAGE_TEXT = 'RCM - Rhythm Chaebo Maker'

const MIN_TEXT = 2
const MAX_TEXT = 128

/** 디스코드 글자 수 규칙(2~128)에 맞춘다. 코드 포인트로 세서 이모지를 쪼개지 않는다. */
function fitText(s: string): string {
  const chars = Array.from(s)
  if (chars.length > MAX_TEXT) return `${chars.slice(0, MAX_TEXT - 1).join('')}…`
  while (chars.length < MIN_TEXT) chars.push('⠀')
  return chars.join('')
}

export function buildActivity(info: PresenceInfo | null, appStartedAt: number): DiscordActivity {
  const base = {
    type: 0 as const,
    assets: { large_image: PRESENCE_IMAGE, large_text: PRESENCE_IMAGE_TEXT },
    buttons: [{ ...PRESENCE_BUTTON }]
  }
  if (!info) return { ...base, timestamps: { start: appStartedAt } }
  const artist = info.artist.trim()
  return {
    ...base,
    details: fitText(artist ? `${info.title} - ${artist}` : info.title),
    state: fitText(`${info.chart} Lv.${info.level} 편집 중`),
    timestamps: { start: info.since }
  }
}

export function isPresenceInfo(raw: unknown): raw is PresenceInfo {
  if (typeof raw !== 'object' || raw === null) return false
  const o = raw as Record<string, unknown>
  return (
    typeof o.title === 'string' &&
    typeof o.artist === 'string' &&
    typeof o.chart === 'string' &&
    Number.isFinite(o.level) &&
    Number.isFinite(o.since)
  )
}
