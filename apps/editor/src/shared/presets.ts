import {
  DEFAULT_NOTE_COLOR,
  MAX_TRACKS,
  MIN_TRACKS,
  TRACK_COLOR_PATTERN,
  isValidTrackId,
  type Track
} from '@rcm/core'

export interface PresetTrack extends Track {
  key: string | null
  /** 보조 키: 주 키와 함께 이 트랙을 친다 (가운데 레인을 양손으로 칠 때 등). 없으면 생략 */
  subKey?: string | null
}

export interface TrackPreset {
  id: string
  name: string
  tracks: PresetTrack[]
}

export const AUTO_KEYS: readonly string[] = [
  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon',
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyU', 'KeyI', 'KeyO', 'KeyP'
]

/** 프리셋 id 최대 길이 (설정 파일·마지막 프리셋 id 검사) */
export const MAX_PRESET_ID_LENGTH = 64

const SIDE_COLOR = '#f59e0b'

function notes(keys: string[]): PresetTrack[] {
  return keys.map((key, i) => ({ id: `Note_${i + 1}`, key }))
}

function preset(id: string, name: string, tracks: PresetTrack[]): TrackPreset {
  tracks.forEach((t) => Object.freeze(t))
  return Object.freeze({ id, name, tracks: Object.freeze(tracks) as PresetTrack[] })
}

export const DEFAULT_PRESETS: readonly TrackPreset[] = Object.freeze([
  preset('4k', '4K', notes(['KeyD', 'KeyF', 'KeyJ', 'KeyK'])),
  preset('5k', '5K', notes(['KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK'])),
  preset('6k', '6K', notes(['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'])),
  preset('7k', '7K', notes(['KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL'])),
  preset('8k', '8K', notes(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'])),
  preset('6k-side', '6K + 사이드', [
    { id: 'Side_L', color: SIDE_COLOR, key: 'ShiftLeft' },
    ...notes(['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL']),
    { id: 'Side_R', color: SIDE_COLOR, key: 'ShiftRight' }
  ])
])

function copyPreset(p: TrackPreset): TrackPreset {
  return { id: p.id, name: p.name, tracks: p.tracks.map((t) => ({ ...t })) }
}

function defaultsCopy(): TrackPreset[] {
  return DEFAULT_PRESETS.map(copyPreset)
}

export interface PresetIssues {
  name?: string
  tracks: { id?: string; color?: string; key?: string; subKey?: string }[]
  count?: string
}

export function presetErrors(p: TrackPreset): PresetIssues {
  const issues: PresetIssues = { tracks: p.tracks.map(() => ({})) }
  if (p.name.trim() === '') issues.name = '이름을 입력하세요'
  if (p.tracks.length < MIN_TRACKS || p.tracks.length > MAX_TRACKS) {
    issues.count = `트랙은 ${MIN_TRACKS}~${MAX_TRACKS}개여야 해요`
  }
  const ids = new Set<string>()
  const keys = new Set<string>()
  p.tracks.forEach((t, i) => {
    const row = issues.tracks[i]
    if (!isValidTrackId(t.id)) row.id = '영문·숫자·_·-만, 1~32자'
    else if (ids.has(t.id)) row.id = '이미 있는 이름'
    ids.add(t.id)
    if (t.color !== undefined && !TRACK_COLOR_PATTERN.test(t.color)) row.color = '#rrggbb 형식이어야 해요'
    if (t.key !== null) {
      if (typeof t.key !== 'string' || t.key === '') row.key = '키가 올바르지 않아요'
      else if (keys.has(t.key)) row.key = '다른 트랙과 같은 키'
      else keys.add(t.key)
    }
    if (t.subKey !== undefined && t.subKey !== null) {
      if (typeof t.subKey !== 'string' || t.subKey === '') row.subKey = '키가 올바르지 않아요'
      else if (t.subKey === t.key) row.subKey = '주 키와 같은 키'
      else if (keys.has(t.subKey)) row.subKey = '다른 트랙과 같은 키'
      else keys.add(t.subKey)
    }
  })
  return issues
}

export function hasPresetErrors(i: PresetIssues): boolean {
  return !!i.name || !!i.count || i.tracks.some((t) => !!t.id || !!t.color || !!t.key || !!t.subKey)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseTrack(v: unknown): PresetTrack | null {
  if (!isObject(v) || typeof v.id !== 'string') return null
  const key = v.key === undefined ? null : v.key
  if (key !== null && typeof key !== 'string') return null
  const t: PresetTrack = { id: v.id, key }
  if (v.subKey !== undefined && v.subKey !== null) {
    if (typeof v.subKey !== 'string') return null
    t.subKey = v.subKey
  }
  if (v.color !== undefined) {
    if (typeof v.color !== 'string') return null
    t.color = v.color
  }
  return t
}

function parsePreset(v: unknown): TrackPreset | null {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.name !== 'string' || !Array.isArray(v.tracks)) {
    return null
  }
  if (v.id.length > MAX_PRESET_ID_LENGTH) return null
  const tracks: PresetTrack[] = []
  for (const raw of v.tracks) {
    const t = parseTrack(raw)
    if (!t) return null
    tracks.push(t)
  }
  const p: TrackPreset = { id: v.id, name: v.name, tracks }
  return hasPresetErrors(presetErrors(p)) ? null : p
}

export function sanitizePresets(raw: unknown): TrackPreset[] {
  if (!Array.isArray(raw)) return defaultsCopy()
  const out: TrackPreset[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const p = parsePreset(item)
    if (!p || seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
  }
  return out.length > 0 ? out : defaultsCopy()
}

export function newPresetId(existing: readonly TrackPreset[]): string {
  const base = `p-${Date.now().toString(36)}`
  const used = new Set(existing.map((p) => p.id))
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/** 프리셋 트랙의 키 code들: 주 키, 보조 키 순. 비어 있는 칸은 뺀다. */
export function presetTrackKeys(t: PresetTrack): string[] {
  const out: string[] = []
  if (t.key) out.push(t.key)
  if (t.subKey) out.push(t.subKey)
  return out
}

export interface ResolvedKeymap {
  /** 트랙 id → 키 code들 (주 키, 보조 키). 키 없는 트랙은 빈 배열 */
  keys: Map<string, string[]>
  source: { kind: 'preset'; name: string } | { kind: 'auto' }
}

/** 프리셋의 트랙 id 집합이 `ids`와 같은지 (순서 무관). */
function sameTrackIds(p: TrackPreset, ids: ReadonlySet<string>): boolean {
  return p.tracks.length === ids.size && p.tracks.every((t) => ids.has(t.id))
}

export function resolveKeymap(tracks: readonly Track[], presets: readonly TrackPreset[]): ResolvedKeymap {
  const ids = new Set(tracks.map((t) => t.id))
  const match = presets.find((p) => sameTrackIds(p, ids))
  const keys = new Map<string, string[]>()
  if (match) {
    for (const t of match.tracks) keys.set(t.id, presetTrackKeys(t))
    return { keys, source: { kind: 'preset', name: match.name } }
  }
  tracks.forEach((t, i) => keys.set(t.id, i < AUTO_KEYS.length ? [AUTO_KEYS[i]] : []))
  return { keys, source: { kind: 'auto' } }
}

/**
 * `index` 프리셋보다 앞에 있고 트랙 id 집합이 같은 첫 프리셋. 키 매칭은 앞의 것이 이기므로(트랙 스펙 3.4)
 * 이런 프리셋이 있으면 `index` 프리셋의 키는 녹음·플레이에 쓰이지 않는다. 없으면 null.
 */
export function shadowingPreset(presets: readonly TrackPreset[], index: number): TrackPreset | null {
  const target = presets[index]
  if (!target) return null
  const ids = new Set(target.tracks.map((t) => t.id))
  return presets.slice(0, index).find((p) => sameTrackIds(p, ids)) ?? null
}

export function presetToChartTracks(p: TrackPreset): Track[] {
  return p.tracks.map((t) => {
    const out: Track = { id: t.id }
    if (t.color !== undefined && t.color.toLowerCase() !== DEFAULT_NOTE_COLOR) out.color = t.color
    return out
  })
}
