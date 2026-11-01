import { promises as fs } from 'node:fs'
import { sanitizeLayout, type PlayfieldLayout } from '@rcm/playfield'
import { sanitizePresets, type TrackPreset } from '../../shared/presets'
import {
  MAX_SEEN_ANNOUNCEMENTS,
  isJudgeOffset,
  isNoticeId,
  isPlaytestSpeed,
  isVersion,
  presetsOf as presetsOfFields
} from '../../shared/settingsRules'
import { sanitizeHitEffectSettings, type HitEffectSettings } from '../../shared/hitEffects'
import { sanitizeGuidePaths } from '../guide/guideFiles'
import { writeFileAtomic } from './atomicWrite'

export {
  MAX_SEEN_ANNOUNCEMENTS,
  addSeenAnnouncements,
  validateAnnouncementIds,
  validateLastPresetId,
  validateLastSeenVersion,
  validateNoticeId,
  validatePlaytestSpeed,
  validatePresets
} from '../../shared/settingsRules'

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
  /** 테스트 플레이에서 마지막으로 쓴 배속 (MIN_SPEED~MAX_SPEED) */
  playtestSpeed?: number
  /** 게임플레이 레이아웃. 없으면 기본값을 쓴다 */
  gameplay?: PlayfieldLayout
  /** 테스트 플레이 타격 이펙트. 없으면 기본값을 쓴다 */
  hitEffects?: HitEffectSettings
  /** 업데이트 내역을 마지막으로 확인한 앱 버전 (X.Y.Z) */
  lastSeenVersion?: string
  /** 홈에서 닫은 공지 id 목록 */
  dismissedNotices?: string[]
  /** 이미 본 공지사항 id 목록 (사이드바 공지사항 버튼의 새 글 표시) */
  seenAnnouncements?: string[]
  /** 자동 문서 업데이트: 앱의 AI 가이드로 맞춰 둘 파일들 (사용자가 직접 넣은 `.md` 절대 경로) */
  guideFiles?: string[]
  /** 판정 오프셋 (ms, -200~200). 웹 버전에서 쓴다. PC는 쓰지 않는다 */
  judgeOffset?: number
  /** 자동 저장. 웹 버전에서 쓴다. PC는 쓰지 않는다 */
  autoSave?: boolean
}

const MAX_RECENT = 20

export function touchRecent(list: RecentEntry[], dir: string, now: number): RecentEntry[] {
  return [{ dir, lastOpened: now }, ...list.filter((e) => e.dir !== dir)].slice(0, MAX_RECENT)
}

/**
 * 찾을 수 없는 프로젝트(`from`)를 옮겨 간 폴더(`to`)에 다시 연결한다. 순서와 열람 시간은 그대로 둔다.
 * `to`가 이미 목록에 있으면 하나로 합치고 더 최근 시간을 남긴다.
 */
export function relinkRecent(list: RecentEntry[], from: string, to: string): RecentEntry[] {
  const old = list.find((e) => e.dir === from)
  const existing = list.find((e) => e.dir === to)
  if (!old || from === to) return list
  const lastOpened = Math.max(old.lastOpened, existing?.lastOpened ?? 0)
  return list.flatMap((e) =>
    e.dir === from ? [{ dir: to, lastOpened }] : e.dir === to ? [] : [e]
  )
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
    playtestSpeed?: unknown
    gameplay?: unknown
    hitEffects?: unknown
    lastSeenVersion?: unknown
    dismissedNotices?: unknown
    seenAnnouncements?: unknown
    guideFiles?: unknown
    judgeOffset?: unknown
    autoSave?: unknown
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
  if (isPlaytestSpeed(obj.playtestSpeed)) settings.playtestSpeed = obj.playtestSpeed
  if (obj.gameplay !== undefined) settings.gameplay = sanitizeLayout(obj.gameplay)
  if (obj.hitEffects !== undefined) settings.hitEffects = sanitizeHitEffectSettings(obj.hitEffects)
  if (isVersion(obj.lastSeenVersion)) settings.lastSeenVersion = obj.lastSeenVersion
  if (Array.isArray(obj.dismissedNotices)) settings.dismissedNotices = obj.dismissedNotices.filter(isNoticeId)
  if (Array.isArray(obj.seenAnnouncements)) {
    settings.seenAnnouncements = obj.seenAnnouncements.filter(isNoticeId).slice(-MAX_SEEN_ANNOUNCEMENTS)
  }
  if (obj.guideFiles !== undefined) settings.guideFiles = sanitizeGuidePaths(obj.guideFiles)
  if (isJudgeOffset(obj.judgeOffset)) settings.judgeOffset = obj.judgeOffset
  if (typeof obj.autoSave === 'boolean') settings.autoSave = obj.autoSave
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
  return presetsOfFields(s)
}
