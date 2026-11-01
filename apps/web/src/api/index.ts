import type { RcmApi, UpdateState } from '../../../editor/src/shared/api'
import {
  ANNOUNCEMENTS_MAX_BYTES,
  ANNOUNCEMENTS_TIMEOUT_MS,
  ANNOUNCEMENTS_URL
} from '../../../editor/src/shared/announcementsSource'
import { MAX_CHART_BYTES, chartExportName, extOf } from '../../../editor/src/shared/project/files'
import { sanitizeFolderName } from '../../../editor/src/shared/project/folderName'
import { openRcmDb } from './db'
import { download } from './downloads'
import { createHitEffects } from './hitEffects'
import { getPicked, isPickedPath, pickFiles, registerPicked } from './picked'
import { createProjects, type ProjectDeps } from './projects'
import { createSettings } from './settings'
import { exportZip, importZip } from './zip'

export interface WebApiDeps {
  db: IDBDatabase
  locks: ProjectDeps['locks']
  now(): number
  uuid(): string
}

const UNAVAILABLE = '웹에서는 쓸 수 없어요'
const NOT_CHART = '채보 파일(.chart.json)만 불러올 수 있어요'

/** 웹 표시용 프로젝트 위치. 실제 저장소는 IndexedDB라 폴더가 없다 */
const WEB_DIR = 'web:'

const IDLE: UpdateState = { kind: 'idle' }

/** `navigator.locks`로 만든 탭 잠금. 지원하지 않는 브라우저는 항상 잡히는 잠금(이 탭 안의 보호만)을 쓴다 */
function browserLocks(): ProjectDeps['locks'] {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks) return { request: (_name, _opts, cb) => cb({}) }
  return { request: (name, opts, cb) => locks.request(name, opts, (lock) => cb(lock)) }
}

/** 브라우저에서 쓰는 `RcmApi`. 저장소는 IndexedDB, 파일 고르기·내려받기는 브라우저 기능을 쓴다 */
export async function createWebApi(deps: Partial<WebApiDeps> = {}): Promise<RcmApi> {
  // 브라우저가 저장소를 마음대로 지우지 않게 요청한다 (거절돼도 계속 쓸 수 있다)
  try {
    void Promise.resolve(globalThis.navigator?.storage?.persist?.()).catch(() => {})
  } catch {
    // 지원하지 않거나 막힌 환경
  }

  const db = deps.db ?? (await openRcmDb())
  const settings = createSettings(db)
  const hitEffects = createHitEffects(db, settings)
  const projects = createProjects(db, {
    locks: deps.locks ?? browserLocks(),
    now: deps.now ?? Date.now,
    uuid: deps.uuid ?? (() => crypto.randomUUID())
  })

  let dirty = false

  const pickOne = async (accept: string): Promise<string | null> => {
    const [file] = await pickFiles(accept, false)
    return file ? registerPicked(file) : null
  }

  return {
    capabilities: {
      windowControls: false,
      autoUpdate: false,
      discord: false,
      revealInExplorer: false,
      guideFileSync: false,
      chooseProjectFolder: false,
      trash: false,
      recording: false,
      autoSave: true
    },

    // 파일 고르기
    pickAudioFile: () => pickOne('.ogg,.mp3,.wav'),
    pickProjectZip: () => pickOne('.zip'),
    pickChartFiles: async () => (await pickFiles('.json', true)).map(registerPicked),
    pickHitEffect: async (slot, type) => {
      const files = await pickFiles('.png', type === 'frames')
      return files.length === 0 ? null : hitEffects.importFiles(slot, type, files)
    },
    pathForFile: registerPicked,

    // 프로젝트 위치 (표시용)
    pickFolder: async () => null,
    getDefaultProjectDir: async () => WEB_DIR,
    resolveProjectDir: async (_parentDir, title) => WEB_DIR + sanitizeFolderName(title),

    // 프로젝트
    createProject: async (opts) => {
      try {
        return await projects.createProject(opts)
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        throw new Error(`프로젝트를 만들 수 없어요: ${reason}`)
      }
    },
    openProject: projects.openProject,
    closeProject: projects.closeProject,
    writeProjectFiles: projects.writeProjectFiles,
    deleteProjectFiles: projects.deleteProjectFiles,
    readAudio: projects.readAudio,
    importProjectAudio: projects.importProjectAudio,
    getRecentProjects: projects.getRecentProjects,
    removeRecentProject: projects.removeRecentProject,
    trashProjects: projects.trashProjects,
    relinkRecentProject: () => Promise.reject(new Error(UNAVAILABLE)),
    showInExplorer: () => Promise.reject(new Error(UNAVAILABLE)),

    // ZIP·채보·텍스트 파일
    importProjectZip: async (zipPath) => {
      const file = getPicked(zipPath)
      return importZip(projects, new Uint8Array(await file.arrayBuffer()))
    },
    exportProjectZip: async (dir) => {
      const { name, data } = await exportZip(projects, dir)
      return download(name, new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), 'application/zip')
    },
    readChartFile: async (path) => {
      if (typeof path !== 'string' || !isPickedPath(path)) throw new Error(NOT_CHART)
      const file = getPicked(path)
      if (extOf(file.name) !== '.json') throw new Error(NOT_CHART)
      if (file.size > MAX_CHART_BYTES) throw new Error('채보 파일이 너무 커요')
      return file.text()
    },
    exportChart: async (name, text) => download(chartExportName(name), text, 'application/json'),
    saveTextFile: async (name, text) => download(name, text, 'text/plain'),

    // 설정
    getPresets: settings.getPresets,
    savePresets: settings.savePresets,
    setLastPresetId: settings.setLastPresetId,
    getJudgeOffset: settings.getJudgeOffset,
    setJudgeOffset: settings.setJudgeOffset,
    getAutoSave: settings.getAutoSave,
    setAutoSave: settings.setAutoSave,
    getDiscordPresence: settings.getDiscordPresence,
    setDiscordPresence: settings.setDiscordPresence,
    getWhatsNewState: settings.getWhatsNewState,
    setLastSeenVersion: settings.setLastSeenVersion,
    getDismissedNotices: settings.getDismissedNotices,
    dismissNotice: settings.dismissNotice,
    getSeenAnnouncements: settings.getSeenAnnouncements,
    markAnnouncementsSeen: settings.markAnnouncementsSeen,
    getPlaytestSpeed: settings.getPlaytestSpeed,
    setPlaytestSpeed: settings.setPlaytestSpeed,
    getGameplayLayout: settings.getGameplayLayout,
    setGameplayLayout: settings.setGameplayLayout,

    // 타격 이펙트
    getHitEffects: hitEffects.getHitEffects,
    setHitEffects: hitEffects.setHitEffects,
    clearHitEffect: hitEffects.clearHitEffect,
    readHitEffectImages: hitEffects.readHitEffectImages,

    // 공지사항·저장소
    fetchAnnouncements: async () => {
      try {
        const res = await fetch(ANNOUNCEMENTS_URL, {
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
    },
    getStorageUsage: async () => {
      try {
        const usage = (await navigator.storage?.estimate?.())?.usage
        return typeof usage === 'number' ? { usedBytes: usage } : null
      } catch {
        return null
      }
    },

    // 창·업데이트·디스코드·가이드 파일: 웹에는 없다
    setDirty: (value) => {
      dirty = value
    },
    onCloseRequested: () => () => {},
    forceClose: () => {},
    closeCancelled: () => {},
    minimize: () => {},
    toggleMaximize: () => {},
    close: () => {},
    isMaximized: async () => false,
    getAppVersion: async () => __APP_VERSION__,
    isPackaged: async () => !import.meta.env.DEV,
    getUpdateState: async () => IDLE,
    checkForUpdates: async () => IDLE,
    installUpdate: () => {},
    onUpdateState: () => () => {},
    setPresence: () => {},
    getGuideFiles: async () => [],
    addGuideFile: async () => null,
    removeGuideFile: async () => []
  }
}
