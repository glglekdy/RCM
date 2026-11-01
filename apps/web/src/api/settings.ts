import { DEFAULT_LAYOUT, sanitizeLayout } from '@rcm/playfield'
import type { RcmApi } from '../../../editor/src/shared/api'
import {
  addSeenAnnouncements,
  isNoticeId,
  isPlaytestSpeed,
  isVersion,
  presetsOf,
  validateAnnouncementIds,
  validateJudgeOffset,
  validateLastPresetId,
  validateLastSeenVersion,
  validateNoticeId,
  validatePlaytestSpeed,
  validatePresets
} from '../../../editor/src/shared/settingsRules'
import type { TrackPreset } from '../../../editor/src/shared/presets'
import { req, tx } from './db'

type SettingMethods =
  | 'getPresets'
  | 'savePresets'
  | 'setLastPresetId'
  | 'getWhatsNewState'
  | 'setLastSeenVersion'
  | 'getDismissedNotices'
  | 'dismissNotice'
  | 'getSeenAnnouncements'
  | 'markAnnouncementsSeen'
  | 'getPlaytestSpeed'
  | 'setPlaytestSpeed'
  | 'getGameplayLayout'
  | 'setGameplayLayout'
  | 'getJudgeOffset'
  | 'setJudgeOffset'
  | 'getAutoSave'
  | 'setAutoSave'
  | 'getDiscordPresence'
  | 'setDiscordPresence'

/** `RcmApi`의 설정 메서드들. `getRaw`는 같은 `settings` 저장소를 읽는 다른 모듈(타격 이펙트)용이다 */
export type WebSettings = Pick<RcmApi, SettingMethods> & {
  getRaw(name: string): Promise<unknown>
}

/** `settings` 저장소의 키. 이름은 PC `settings.json`의 항목 이름과 같다 */
export const SETTING_KEYS = {
  presets: 'presets',
  lastPresetId: 'lastPresetId',
  lastSeenVersion: 'lastSeenVersion',
  dismissedNotices: 'dismissedNotices',
  seenAnnouncements: 'seenAnnouncements',
  playtestSpeed: 'playtestSpeed',
  judgeOffset: 'judgeOffset',
  gameplay: 'gameplay',
  hitEffects: 'hitEffects',
  autoSave: 'autoSave'
} as const

const idList = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter(isNoticeId) : [])

export function createSettings(db: IDBDatabase): WebSettings {
  // 만들 때의 상태를 기억한다: 비어 있었으면 처음 실행. 이후의 쓰기보다 먼저 시작해 순서가 보장된다
  const wasEmpty = tx(db, ['settings'], 'readonly', (t) => req(t.objectStore('settings').count()))
    .then((count) => count === 0)
    .catch(() => false)

  const getRaw = (name: string): Promise<unknown> =>
    tx(db, ['settings'], 'readonly', (t) => req<unknown>(t.objectStore('settings').get(name)))

  const set = (name: string, value: unknown): Promise<void> =>
    tx(db, ['settings'], 'readwrite', (t) => {
      t.objectStore('settings').put(value, name)
    })

  /** 읽고 고쳐 쓰기를 한 트랜잭션에서 한다 */
  const update = (name: string, change: (current: unknown) => unknown): Promise<void> =>
    tx(db, ['settings'], 'readwrite', async (t) => {
      const store = t.objectStore('settings')
      store.put(change(await req<unknown>(store.get(name))), name)
    })

  return {
    getRaw,

    async getPresets() {
      const [presets, lastPresetId] = await Promise.all([getRaw(SETTING_KEYS.presets), getRaw(SETTING_KEYS.lastPresetId)])
      return presetsOf({
        presets: presets as TrackPreset[] | undefined,
        lastPresetId: typeof lastPresetId === 'string' ? lastPresetId : undefined
      })
    },
    savePresets: async (raw) => set(SETTING_KEYS.presets, validatePresets(raw)),
    setLastPresetId: async (id) => set(SETTING_KEYS.lastPresetId, validateLastPresetId(id)),

    async getWhatsNewState() {
      const [firstRun, version] = await Promise.all([wasEmpty, getRaw(SETTING_KEYS.lastSeenVersion)])
      return { lastSeenVersion: isVersion(version) ? version : null, firstRun }
    },
    setLastSeenVersion: async (version) => set(SETTING_KEYS.lastSeenVersion, validateLastSeenVersion(version)),

    async getDismissedNotices() {
      return idList(await getRaw(SETTING_KEYS.dismissedNotices))
    },
    async dismissNotice(raw) {
      const id = validateNoticeId(raw)
      return update(SETTING_KEYS.dismissedNotices, (current) => {
        const dismissed = idList(current)
        return dismissed.includes(id) ? dismissed : [...dismissed, id]
      })
    },

    async getSeenAnnouncements() {
      return idList(await getRaw(SETTING_KEYS.seenAnnouncements))
    },
    async markAnnouncementsSeen(raw) {
      const ids = validateAnnouncementIds(raw)
      return update(SETTING_KEYS.seenAnnouncements, (current) => addSeenAnnouncements(idList(current), ids))
    },

    async getPlaytestSpeed() {
      const speed = await getRaw(SETTING_KEYS.playtestSpeed)
      return isPlaytestSpeed(speed) ? speed : null
    },
    setPlaytestSpeed: async (speed) => set(SETTING_KEYS.playtestSpeed, validatePlaytestSpeed(speed)),

    async getGameplayLayout() {
      const layout = await getRaw(SETTING_KEYS.gameplay)
      return layout === undefined ? { ...DEFAULT_LAYOUT } : sanitizeLayout(layout)
    },
    setGameplayLayout: async (layout) => set(SETTING_KEYS.gameplay, sanitizeLayout(layout)),

    async getJudgeOffset() {
      try {
        return validateJudgeOffset(await getRaw(SETTING_KEYS.judgeOffset))
      } catch {
        return 0
      }
    },
    setJudgeOffset: async (ms) => set(SETTING_KEYS.judgeOffset, validateJudgeOffset(ms)),

    async getAutoSave() {
      return (await getRaw(SETTING_KEYS.autoSave)) !== false
    },
    setAutoSave: async (enabled) => set(SETTING_KEYS.autoSave, enabled === true),

    // 디스코드 활동은 PC 전용이다
    getDiscordPresence: async () => false,
    setDiscordPresence: async () => {}
  }
}
