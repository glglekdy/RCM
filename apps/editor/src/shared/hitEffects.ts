import type { HitEffectBlend, HitEffectSlot } from '@rcm/playfield'

/** 슬롯 하나의 스프라이트. 파일 이름은 `userData/hit-effects/<slot>/`에 복사해 둔 이름이다 */
export type HitEffectSource =
  | { type: 'sheet'; file: string; cols: number; rows: number; count: number; fps: number }
  | { type: 'frames'; files: string[]; fps: number }

/** 설정 파일의 타격 이펙트 (에디터 테스트 플레이 전용). 슬롯이 없으면 기본 이펙트 */
export interface HitEffectSettings {
  enabled: boolean
  size: number
  blend: HitEffectBlend
  perfect?: HitEffectSource
  normal?: HitEffectSource
}

export const HIT_EFFECT_SLOTS: readonly HitEffectSlot[] = ['perfect', 'normal']

export const DEFAULT_HIT_EFFECT_SETTINGS: Readonly<HitEffectSettings> = Object.freeze({
  enabled: true,
  size: 128,
  blend: 'normal'
})

export const HIT_EFFECT_LIMITS = {
  size: { min: 32, max: 512 },
  grid: { min: 1, max: 32 },
  fps: { min: 1, max: 120 },
  maxFrames: 120,
  maxFileBytes: 10 * 1024 * 1024
} as const

const DEFAULT_FPS = 30

export function isHitEffectSlot(raw: unknown): raw is HitEffectSlot {
  return raw === 'perfect' || raw === 'normal'
}

/** 복사해 둔 파일 이름으로 쓸 수 있는지: 비어 있지 않은 `.png` 이름, 경로 구분자나 `..` 없음 */
export function isSafeEffectFileName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    /\.png$/i.test(name) &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('..')
  )
}

/** 숫자면 반올림 후 범위로 자르고, 아니면 기본값 */
function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback
  return Math.min(max, Math.max(min, Math.round(raw)))
}

function sanitizeSource(raw: unknown): HitEffectSource | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const obj = raw as Record<string, unknown>
  const { grid, fps } = HIT_EFFECT_LIMITS
  const f = clampInt(obj.fps, fps.min, fps.max, DEFAULT_FPS)
  if (obj.type === 'sheet') {
    if (!isSafeEffectFileName(obj.file)) return undefined
    const cols = clampInt(obj.cols, grid.min, grid.max, 1)
    const rows = clampInt(obj.rows, grid.min, grid.max, 1)
    const count = clampInt(obj.count, 1, cols * rows, cols * rows)
    return { type: 'sheet', file: obj.file, cols, rows, count, fps: f }
  }
  if (obj.type === 'frames') {
    const files = Array.isArray(obj.files)
      ? obj.files.filter(isSafeEffectFileName).slice(0, HIT_EFFECT_LIMITS.maxFrames)
      : []
    return files.length > 0 ? { type: 'frames', files, fps: f } : undefined
  }
  return undefined
}

/** 설정 파일·renderer에서 온 값을 정리한다. 잘못된 키는 기본값, 숫자는 범위로, 잘못된 슬롯은 비운다. */
export function sanitizeHitEffectSettings(raw: unknown): HitEffectSettings {
  const settings: HitEffectSettings = { ...DEFAULT_HIT_EFFECT_SETTINGS }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return settings
  const obj = raw as Record<string, unknown>
  if (typeof obj.enabled === 'boolean') settings.enabled = obj.enabled
  const { size } = HIT_EFFECT_LIMITS
  settings.size = clampInt(obj.size, size.min, size.max, settings.size)
  if (obj.blend === 'normal' || obj.blend === 'add') settings.blend = obj.blend
  for (const slot of HIT_EFFECT_SLOTS) {
    const source = sanitizeSource(obj[slot])
    if (source) settings[slot] = source
  }
  return settings
}
