import { promises as fs } from 'node:fs'
import { sanitizePresets, type TrackPreset } from '../../shared/presets'
import { writeFileAtomic } from './atomicWrite'

export interface RecentEntry {
  dir: string
  lastOpened: number
}

export interface Settings {
  recent: RecentEntry[]
  defaultProjectDir?: string
  /** 읽은 그대로의 값. 쓸 때는 `presetsOf`로 정리한다. */
  presets?: TrackPreset[]
  lastPresetId?: string
}

const MAX_RECENT = 20

export function touchRecent(list: RecentEntry[], dir: string, now: number): RecentEntry[] {
  return [{ dir, lastOpened: now }, ...list.filter((e) => e.dir !== dir)].slice(0, MAX_RECENT)
}

export async function loadSettings(file: string): Promise<Settings> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(file, 'utf8'))
    if (typeof raw !== 'object' || raw === null) return { recent: [] }
    const obj = raw as {
      recent?: unknown
      defaultProjectDir?: unknown
      presets?: unknown
      lastPresetId?: unknown
    }
    const recent = Array.isArray(obj.recent)
      ? obj.recent.filter(
          (e): e is RecentEntry =>
            typeof e === 'object' &&
            e !== null &&
            typeof (e as RecentEntry).dir === 'string' &&
            typeof (e as RecentEntry).lastOpened === 'number'
        )
      : []
    const settings: Settings = { recent }
    if (typeof obj.defaultProjectDir === 'string') settings.defaultProjectDir = obj.defaultProjectDir
    if (Array.isArray(obj.presets)) settings.presets = obj.presets as TrackPreset[]
    if (typeof obj.lastPresetId === 'string') settings.lastPresetId = obj.lastPresetId
    return settings
  } catch {
    return { recent: [] }
  }
}

export async function saveSettings(file: string, s: Settings): Promise<void> {
  await writeFileAtomic(file, `${JSON.stringify(s, null, 2)}\n`)
}

/** renderer에 줄 프리셋: 저장된 것을 정리하고, 없으면 기본 프리셋. */
export function presetsOf(s: Settings): { presets: TrackPreset[]; lastPresetId: string | null } {
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

const MAX_PRESET_ID_LENGTH = 64

export function validateLastPresetId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > MAX_PRESET_ID_LENGTH) {
    throw new Error('프리셋 id가 올바르지 않아요')
  }
  return raw
}
