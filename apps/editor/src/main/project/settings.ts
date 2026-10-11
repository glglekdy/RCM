import { promises as fs } from 'node:fs'
import { MAX_PRESET_ID_LENGTH, sanitizePresets, type TrackPreset } from '../../shared/presets'
import { writeFileAtomic } from './atomicWrite'

export interface RecentEntry {
  dir: string
  lastOpened: number
}

export interface Settings {
  recent: RecentEntry[]
  defaultProjectDir?: string
  /** `sanitizePresets`로 정리한 값. 파일에 프리셋이 없으면(첫 실행) 비워 둔다. */
  presets?: TrackPreset[]
  lastPresetId?: string
  /** 디스코드 활동 표시. 없으면 켜짐으로 본다 */
  discordPresence?: boolean
}

const MAX_RECENT = 20

export function touchRecent(list: RecentEntry[], dir: string, now: number): RecentEntry[] {
  return [{ dir, lastOpened: now }, ...list.filter((e) => e.dir !== dir)].slice(0, MAX_RECENT)
}

/** 설정 파일 내용이 깨짐 (JSON이 아니거나 형식이 틀림). 읽기 오류와 구별한다. */
class SettingsFormatError extends Error {}

function parseSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SettingsFormatError('설정 파일 형식이 올바르지 않아요')
  }
  const obj = raw as {
    recent?: unknown
    defaultProjectDir?: unknown
    presets?: unknown
    lastPresetId?: unknown
    discordPresence?: unknown
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
  // 필드가 있을 때만 채운다: 다른 설정만 고쳐 다시 저장해도 프리셋은 남고, 첫 실행 파일에는 기본 프리셋을 쓰지 않는다
  if (obj.presets !== undefined) settings.presets = sanitizePresets(obj.presets)
  if (typeof obj.lastPresetId === 'string') settings.lastPresetId = obj.lastPresetId
  if (typeof obj.discordPresence === 'boolean') settings.discordPresence = obj.discordPresence
  return settings
}

/** 파일이 없으면 빈 설정. 그 밖의 읽기 오류(EBUSY 등)나 깨진 내용은 throw. */
async function readSettingsStrict(file: string): Promise<Settings> {
  let text: string
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { recent: [] }
    throw err
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    throw new SettingsFormatError('설정 파일이 올바른 JSON이 아니에요', { cause: err })
  }
  return parseSettings(raw)
}

/** 읽기 전용: 읽지 못하거나 깨졌으면 빈 설정. */
export async function loadSettings(file: string): Promise<Settings> {
  try {
    return await readSettingsStrict(file)
  } catch {
    return { recent: [] }
  }
}

export async function saveSettings(file: string, s: Settings): Promise<void> {
  await writeFileAtomic(file, `${JSON.stringify(s, null, 2)}\n`)
}

/**
 * 고치기 전 읽기. 내용이 깨졌으면 원본을 같은 폴더의 `<파일 이름>.broken-<시각>`으로 옮겨 두고
 * 빈 설정에서 시작한다 (깨진 파일 때문에 설정을 영영 저장하지 못하는 일이 없게).
 * 읽기 오류(EBUSY·EACCES 등)는 그대로 throw.
 */
async function readSettingsForUpdate(file: string): Promise<Settings> {
  try {
    return await readSettingsStrict(file)
  } catch (err) {
    if (!(err instanceof SettingsFormatError)) throw err
    const broken = `${file}.broken-${Date.now()}`
    await fs.rename(file, broken)
    console.error(`설정 파일이 깨져서 ${broken}(으)로 옮기고 새로 만들어요`, err)
    return { recent: [] }
  }
}

let pending: Promise<unknown> = Promise.resolve()

/**
 * 설정 파일을 읽고 `mutate`로 고쳐 저장한다. 앞선 호출이 끝난 뒤에 실행되므로
 * 동시에 불려도 서로의 변경을 덮어쓰지 않는다. `mutate`가 throw하면 저장하지 않고 reject.
 * 내용이 깨졌으면 원본을 `.broken-<시각>` 파일로 옮겨 두고 빈 설정에서 고친다.
 * 파일을 읽지 못했으면(없는 경우 제외) 저장된 프리셋 등을 지우지 않도록 덮어쓰지 않고 reject.
 */
export function updateSettings(file: string, mutate: (s: Settings) => void): Promise<void> {
  const run = pending.then(async () => {
    const settings = await readSettingsForUpdate(file)
    mutate(settings)
    await saveSettings(file, settings)
  })
  pending = run.catch(() => {})
  return run
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

export function validateLastPresetId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > MAX_PRESET_ID_LENGTH) {
    throw new Error('프리셋 id가 올바르지 않아요')
  }
  return raw
}
