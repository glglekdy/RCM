import { MAX_SPEED, MIN_SPEED } from '@rcm/playfield'
import { MAX_PRESET_ID_LENGTH, sanitizePresets, type TrackPreset } from './presets'

export function isPlaytestSpeed(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= MIN_SPEED && raw <= MAX_SPEED
}

export const isVersion = (raw: unknown): raw is string => typeof raw === 'string' && /^\d+\.\d+\.\d+$/.test(raw)

/** renderer가 보낸 버전 검사. `X.Y.Z`가 아니면 throw. */
export function validateLastSeenVersion(raw: unknown): string {
  if (!isVersion(raw)) throw new Error('버전 값이 올바르지 않아요')
  return raw
}

export const isNoticeId = (raw: unknown): raw is string => typeof raw === 'string' && /^[a-z0-9-]{1,64}$/.test(raw)

/** renderer가 보낸 공지 id 검사. 소문자·숫자·하이픈 1~64자가 아니면 throw. */
export function validateNoticeId(raw: unknown): string {
  if (!isNoticeId(raw)) throw new Error('공지 id가 올바르지 않아요')
  return raw
}

/** 기억해 두는 본 공지사항 id 수. 넘치면 오래된 것부터 버린다 */
export const MAX_SEEN_ANNOUNCEMENTS = 200

/** renderer가 보낸 본 공지사항 id 목록 검사. 공지 id 형식이 아닌 값이 있으면 throw. */
export function validateAnnouncementIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > MAX_SEEN_ANNOUNCEMENTS || !raw.every(isNoticeId)) {
    throw new Error('공지사항 id가 올바르지 않아요')
  }
  return raw
}

/** 본 공지사항 목록에 `ids`를 더한다. 이미 있는 것은 그대로, 넘치면 오래된 것부터 버린다 */
export function addSeenAnnouncements(seen: string[], ids: string[]): string[] {
  const added = ids.filter((id) => !seen.includes(id))
  return [...seen, ...added].slice(-MAX_SEEN_ANNOUNCEMENTS)
}

/** renderer가 보낸 배속 검사. 범위 밖이거나 숫자가 아니면 throw. */
export function validatePlaytestSpeed(raw: unknown): number {
  if (!isPlaytestSpeed(raw)) throw new Error('배속 값이 올바르지 않아요')
  return raw
}

/** 판정 오프셋 한도 (ms, 양쪽 모두) */
export const JUDGE_OFFSET_LIMIT = 200

export function isJudgeOffset(raw: unknown): raw is number {
  return Number.isInteger(raw) && Math.abs(raw as number) <= JUDGE_OFFSET_LIMIT
}

/** 판정 오프셋 검사. 정수이고 -200~200ms가 아니면 throw. */
export function validateJudgeOffset(raw: unknown): number {
  if (!isJudgeOffset(raw)) throw new Error(`판정 오프셋은 -${JUDGE_OFFSET_LIMIT}~${JUDGE_OFFSET_LIMIT}ms 사이 정수여야 해요`)
  return raw
}

/** renderer에 줄 프리셋: 저장된 것을 정리하고, 없으면 기본 프리셋. */
export function presetsOf(s: { presets?: TrackPreset[]; lastPresetId?: string }): {
  presets: TrackPreset[]
  lastPresetId: string | null
} {
  return { presets: sanitizePresets(s.presets), lastPresetId: s.lastPresetId ?? null }
}

/**
 * 항상 살아남는 프리셋. 입력이 모두 버려져 `sanitizePresets`가 기본 프리셋을 돌려주는 경우와
 * 구별하려고 입력 끝에 붙여 검사한다.
 */
const SENTINEL: TrackPreset = { id: '\0', name: '-', tracks: [{ id: 'A', key: null }] }

/** renderer가 보낸 프리셋 목록 검사. 정리하면서 하나라도 버려지면(또는 비었으면) throw. */
export function validatePresets(raw: unknown): TrackPreset[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('프리셋에 잘못된 값이 있어요')
  const kept = sanitizePresets([...raw, SENTINEL])
  if (kept.length !== raw.length + 1) throw new Error('프리셋에 잘못된 값이 있어요')
  return kept.slice(0, -1)
}

export function validateLastPresetId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > MAX_PRESET_ID_LENGTH) {
    throw new Error('프리셋 id가 올바르지 않아요')
  }
  return raw
}
