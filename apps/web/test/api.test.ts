import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { openRcmDb } from '../src/api/db'
import { createWebApi } from '../src/api'
import { registerPicked } from '../src/api/picked'
import type { RcmApi } from '../../editor/src/shared/api'

const locks = {
  async request(_name: string, _opts: { ifAvailable: true }, cb: (lock: unknown) => Promise<void>) {
    await cb({})
  }
}

let n = 0
const setup = async (): Promise<RcmApi> => {
  const db = await openRcmDb(`api-${++n}`)
  return createWebApi({ db, locks })
}

/** `RcmApi` 인터페이스의 함수 멤버 (api.ts와 같이 유지한다) */
const FUNCTION_KEYS = [
  'pickAudioFile', 'pickFolder', 'getDefaultProjectDir', 'resolveProjectDir', 'createProject', 'openProject',
  'importProjectZip', 'exportProjectZip', 'pickProjectZip', 'pathForFile', 'readAudio', 'importProjectAudio',
  'pickChartFiles', 'readChartFile', 'exportChart', 'writeProjectFiles', 'deleteProjectFiles', 'getRecentProjects',
  'removeRecentProject', 'relinkRecentProject', 'trashProjects', 'showInExplorer', 'saveTextFile', 'getGuideFiles',
  'addGuideFile', 'removeGuideFile', 'getPresets', 'savePresets', 'setLastPresetId', 'getJudgeOffset',
  'setJudgeOffset', 'getAutoSave', 'setAutoSave', 'closeProject', 'getStorageUsage', 'setDirty', 'onCloseRequested',
  'forceClose', 'closeCancelled', 'minimize', 'toggleMaximize', 'close', 'isMaximized', 'getAppVersion', 'isPackaged',
  'getUpdateState', 'checkForUpdates', 'installUpdate', 'onUpdateState', 'setPresence', 'getDiscordPresence',
  'setDiscordPresence', 'getWhatsNewState', 'setLastSeenVersion', 'getDismissedNotices', 'dismissNotice',
  'fetchAnnouncements', 'getSeenAnnouncements', 'markAnnouncementsSeen', 'getPlaytestSpeed', 'setPlaytestSpeed',
  'getGameplayLayout', 'setGameplayLayout', 'getHitEffects', 'setHitEffects', 'pickHitEffect', 'clearHitEffect',
  'readHitEffectImages'
] as const

describe('createWebApi', () => {
  it('RcmApi의 모든 멤버를 채운다', async () => {
    const api = await setup()
    for (const key of FUNCTION_KEYS) expect(typeof api[key], key).toBe('function')
    expect(typeof api.capabilities).toBe('object')
    expect(Object.keys(api).sort()).toEqual([...FUNCTION_KEYS, 'capabilities'].sort())
  })

  it('웹은 PC 전용 기능이 모두 꺼져 있고 자동 저장만 켜져 있다', async () => {
    const { capabilities } = await setup()
    expect(capabilities).toEqual({
      windowControls: false,
      autoUpdate: false,
      discord: false,
      revealInExplorer: false,
      guideFileSync: false,
      chooseProjectFolder: false,
      trash: false,
      recording: false,
      autoSave: true
    })
  })

  it('폴더 고르기는 취소로, 기본 위치는 비어 있지 않은 표시용 값으로 돌려준다', async () => {
    const api = await setup()
    expect(await api.pickFolder()).toBeNull()
    expect(await api.getDefaultProjectDir()).toBe('web:')
    expect(await api.resolveProjectDir('web:', '봄날 / 여름')).toMatch(/^web:.+/)
  })

  it('웹에서 쓸 수 없는 기능은 reject한다', async () => {
    const api = await setup()
    await expect(api.showInExplorer('web:x')).rejects.toThrow('웹에서는 쓸 수 없어요')
    await expect(api.relinkRecentProject('web:a', 'web:b')).rejects.toThrow('웹에서는 쓸 수 없어요')
  })

  it('고르지 않은 채보 파일은 다시 고르라고 안내한다', async () => {
    const api = await setup()
    await expect(api.readChartFile('picked:x')).rejects.toThrow('파일을 다시 골라 주세요')
  })

  it('채보 파일이 아니면 읽지 않는다', async () => {
    const api = await setup()
    const path = registerPicked(new File(['{}'], 'a.txt'))
    await expect(api.readChartFile(path)).rejects.toThrow('채보 파일(.chart.json)만 불러올 수 있어요')
    await expect(api.readChartFile('C:\\a.chart.json')).rejects.toThrow('채보 파일(.chart.json)만 불러올 수 있어요')
  })

  it('고른 채보 파일의 글을 읽는다', async () => {
    const api = await setup()
    const path = api.pathForFile(new File(['{"a":1}'], 'a.chart.json'))
    expect(await api.readChartFile(path)).toBe('{"a":1}')
  })

  it('업데이트·창·가이드 파일은 아무 일도 하지 않는다', async () => {
    const api = await setup()
    expect(await api.getUpdateState()).toEqual({ kind: 'idle' })
    expect(await api.checkForUpdates()).toEqual({ kind: 'idle' })
    expect(await api.isMaximized()).toBe(false)
    expect(await api.getGuideFiles()).toEqual([])
    expect(await api.addGuideFile()).toBeNull()
    expect(await api.removeGuideFile('x')).toEqual([])
    expect(typeof api.onCloseRequested(() => {})).toBe('function')
    expect(typeof api.onUpdateState(() => {})).toBe('function')
  })

  it('프로젝트를 만들고 열 수 있다', async () => {
    const api = await setup()
    const { dir } = await api.createProject({
      parentDir: 'web:',
      title: '봄날',
      artist: '가수',
      audioPath: null,
      bpm: 120,
      chartName: '기본',
      tracks: [{ id: 't1', name: '1', lane: 0, key: 'D' } as never]
    })
    expect(dir).toMatch(/^web:/)
    const files = await api.openProject(dir)
    expect(files.charts.length).toBe(1)
    await api.closeProject(dir)
  })

  it('프로젝트를 만들지 못하면 PC와 같은 접두어를 붙인다', async () => {
    const api = await setup()
    await expect(
      api.createProject({ parentDir: 'web:', title: '', artist: '', audioPath: null, bpm: 0, chartName: '', tracks: [] })
    ).rejects.toThrow('프로젝트를 만들 수 없어요: ')
  })

  it('설정은 프로젝트 저장소와 같은 DB에 저장된다', async () => {
    const api = await setup()
    await api.setJudgeOffset(30)
    expect(await api.getJudgeOffset()).toBe(30)
    expect(await api.getAutoSave()).toBe(true)
    expect(await api.getStorageUsage()).toSatisfy((v: unknown) => v === null || typeof (v as { usedBytes: number }).usedBytes === 'number')
  })
})
