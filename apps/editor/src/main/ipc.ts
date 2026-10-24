import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_LAYOUT, sanitizeLayout } from '@rcm/playfield'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { CreateProjectOptions, RecentProject } from '../shared/api'
import {
  DEFAULT_HIT_EFFECT_SETTINGS,
  isHitEffectSlot,
  sanitizeHitEffectSettings,
  type HitEffectSettings
} from '../shared/hitEffects'
import { addGuidePath, sameGuidePath, syncGuideFiles } from './guide/guideFiles'
import { chartFormatGuide } from './guide/guideText'
import {
  clearHitEffectFiles,
  importHitEffectFiles,
  readHitEffectFiles,
  sourceWithFiles,
  withStoredFiles
} from './hitEffectFiles'
import { writeFileAtomic } from './project/atomicWrite'
import { importProjectZip } from './project/importZip'
import {
  assertDirectory,
  createProject,
  deleteProjectFiles,
  importProjectAudio,
  openProjectFiles,
  readAudioFile,
  removeUnusedAudio,
  resolveProjectDir,
  summarizeProject,
  writeProjectFiles
} from './project/projectFs'
import {
  loadSettings,
  presetsOf,
  touchRecent,
  updateSettings,
  validateLastPresetId,
  validateLastSeenVersion,
  validateNoticeId,
  validatePlaytestSpeed,
  validatePresets
} from './project/settings'

export const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')
const defaultProjectDir = (): string => join(app.getPath('documents'), 'RCM Projects')
/** 타격 이펙트 PNG를 복사해 두는 곳 */
const hitEffectRoot = (): string => join(app.getPath('userData'), 'hit-effects')

/** 최근 목록 갱신. 설정 파일을 읽지 못해도 프로젝트 열기·만들기는 실패시키지 않는다. */
async function touch(dir: string, extra?: { defaultProjectDir: string }): Promise<void> {
  try {
    await updateSettings(settingsFile(), (settings) => {
      settings.recent = touchRecent(settings.recent, dir, Date.now())
      if (extra) settings.defaultProjectDir = extra.defaultProjectDir
    })
  } catch (err) {
    console.error('최근 프로젝트 목록을 저장하지 못했어요', err)
  }
}

/** 자동 문서 업데이트에 넣은 파일들을 앱의 AI 가이드로 맞춘다. 앱을 켤 때 부른다 (실패해도 앱은 뜬다). */
export async function syncGuideFilesOnStartup(): Promise<void> {
  try {
    const { guideFiles = [] } = await loadSettings(settingsFile())
    for (const r of await syncGuideFiles(guideFiles, chartFormatGuide)) {
      if (r.status === 'error') console.error(`AI 가이드를 업데이트하지 못했어요: ${r.path}`, r.error)
    }
  } catch (err) {
    console.error('AI 가이드 자동 업데이트를 하지 못했어요', err)
  }
}

export function registerProjectIpc(): void {
  const parentOf = (e: Electron.IpcMainInvokeEvent): BrowserWindow | undefined =>
    BrowserWindow.fromWebContents(e.sender) ?? undefined

  ipcMain.handle('rcm:pick-audio-file', async (e) => {
    const options: Electron.OpenDialogOptions = {
      title: '음악 파일 선택',
      properties: ['openFile'],
      filters: [{ name: '오디오', extensions: ['ogg', 'mp3', 'wav'] }]
    }
    const win = parentOf(e)
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })

  ipcMain.handle('rcm:pick-folder', async (e, defaultPath?: string) => {
    const options: Electron.OpenDialogOptions = {
      title: '폴더 선택',
      properties: ['openDirectory', 'createDirectory'],
      ...(defaultPath ? { defaultPath } : {})
    }
    const win = parentOf(e)
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })

  ipcMain.handle('rcm:get-default-project-dir', async () => {
    const settings = await loadSettings(settingsFile())
    return settings.defaultProjectDir ?? defaultProjectDir()
  })

  ipcMain.handle('rcm:resolve-project-dir', (_e, parentDir: string, title: string) =>
    resolveProjectDir(parentDir, title)
  )

  ipcMain.handle('rcm:create-project', async (_e, opts: CreateProjectOptions) => {
    let dir: string
    try {
      dir = await createProject(opts)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`프로젝트를 만들 수 없어요: ${reason}`)
    }
    await touch(dir, { defaultProjectDir: opts.parentDir })
    return { dir }
  })

  // 끌어다 놓은 프로젝트 ZIP을 기본 저장 위치에 풀고 최근 목록에 등록한다 (열지는 않는다)
  ipcMain.handle('rcm:import-project-zip', async (_e, zipPath: string) => {
    const settings = await loadSettings(settingsFile())
    const dir = await importProjectZip(zipPath, settings.defaultProjectDir ?? defaultProjectDir())
    await touch(dir)
    return { dir }
  })

  ipcMain.handle('rcm:open-project', async (_e, dir: string) => {
    const files = await openProjectFiles(dir)
    try {
      await removeUnusedAudio(dir, files.songText)
    } catch (err) {
      // 정리하지 못해도 프로젝트는 연다
      console.error('쓰지 않는 음악 파일을 지우지 못했어요', err)
    }
    await touch(dir)
    return files
  })

  ipcMain.handle('rcm:read-audio', (_e, path: string) => readAudioFile(path))

  ipcMain.handle('rcm:import-project-audio', (_e, dir: string, source: string) =>
    importProjectAudio(dir, source)
  )

  ipcMain.handle(
    'rcm:write-project-files',
    (_e, dir: string, files: { name: string; text: string }[]) => writeProjectFiles(dir, files)
  )

  ipcMain.handle('rcm:delete-project-files', (_e, dir: string, names: string[]) =>
    deleteProjectFiles(dir, names)
  )

  ipcMain.handle('rcm:get-recent-projects', async (): Promise<RecentProject[]> => {
    const { recent } = await loadSettings(settingsFile())
    const list = await Promise.all(
      recent.map(async (r) => ({ ...(await summarizeProject(r.dir)), lastOpened: r.lastOpened }))
    )
    return list.sort((a, b) => b.lastOpened - a.lastOpened)
  })

  ipcMain.handle('rcm:remove-recent-project', (_e, dir: string) =>
    updateSettings(settingsFile(), (settings) => {
      settings.recent = settings.recent.filter((r) => r.dir !== dir)
    })
  )

  ipcMain.handle('rcm:get-presets', async () => presetsOf(await loadSettings(settingsFile())))

  ipcMain.handle('rcm:save-presets', async (_e, raw: unknown) => {
    const presets = validatePresets(raw)
    return updateSettings(settingsFile(), (settings) => {
      settings.presets = presets
    })
  })

  ipcMain.handle('rcm:set-last-preset-id', async (_e, raw: unknown) => {
    const id = validateLastPresetId(raw)
    return updateSettings(settingsFile(), (settings) => {
      settings.lastPresetId = id
    })
  })

  // 설정 파일이 없으면 처음 설치: 업데이트 내역을 띄우지 않는다
  ipcMain.handle('rcm:get-whats-new-state', async () => ({
    lastSeenVersion: (await loadSettings(settingsFile())).lastSeenVersion ?? null,
    firstRun: !existsSync(settingsFile())
  }))

  ipcMain.handle('rcm:set-last-seen-version', async (_e, raw: unknown) => {
    const version = validateLastSeenVersion(raw)
    return updateSettings(settingsFile(), (settings) => {
      settings.lastSeenVersion = version
    })
  })

  ipcMain.handle(
    'rcm:get-dismissed-notices',
    async () => (await loadSettings(settingsFile())).dismissedNotices ?? []
  )

  ipcMain.handle('rcm:dismiss-notice', async (_e, raw: unknown) => {
    const id = validateNoticeId(raw)
    return updateSettings(settingsFile(), (settings) => {
      const dismissed = settings.dismissedNotices ?? []
      if (!dismissed.includes(id)) settings.dismissedNotices = [...dismissed, id]
    })
  })

  ipcMain.handle(
    'rcm:get-playtest-speed',
    async () => (await loadSettings(settingsFile())).playtestSpeed ?? null
  )

  ipcMain.handle('rcm:set-playtest-speed', async (_e, raw: unknown) => {
    const speed = validatePlaytestSpeed(raw)
    return updateSettings(settingsFile(), (settings) => {
      settings.playtestSpeed = speed
    })
  })

  ipcMain.handle('rcm:get-gameplay-layout', async () => {
    const { gameplay } = await loadSettings(settingsFile())
    return gameplay ?? { ...DEFAULT_LAYOUT }
  })

  ipcMain.handle('rcm:set-gameplay-layout', async (_e, raw: unknown) => {
    const layout = sanitizeLayout(raw)
    return updateSettings(settingsFile(), (settings) => {
      settings.gameplay = layout
    })
  })

  const hitEffectsOf = (settings: { hitEffects?: HitEffectSettings }): HitEffectSettings =>
    settings.hitEffects ?? { ...DEFAULT_HIT_EFFECT_SETTINGS }

  const checkSlot = (raw: unknown) => {
    if (!isHitEffectSlot(raw)) throw new Error('이펙트 슬롯이 올바르지 않아요')
    return raw
  }

  ipcMain.handle('rcm:get-hit-effects', async () => hitEffectsOf(await loadSettings(settingsFile())))

  // 숫자·켜기·합치기만 바꾼다. 슬롯 파일은 pick·clear로만 바뀐다
  ipcMain.handle('rcm:set-hit-effects', async (_e, raw: unknown) => {
    const incoming = sanitizeHitEffectSettings(raw)
    return updateSettings(settingsFile(), (settings) => {
      settings.hitEffects = withStoredFiles(settings.hitEffects, incoming)
    })
  })

  ipcMain.handle('rcm:pick-hit-effect', async (e, rawSlot: unknown, type: unknown) => {
    const slot = checkSlot(rawSlot)
    if (type !== 'sheet' && type !== 'frames') throw new Error('이펙트 형식이 올바르지 않아요')
    const options: Electron.OpenDialogOptions = {
      title: type === 'sheet' ? '타격 이펙트 시트 고르기' : '타격 이펙트 프레임 고르기',
      properties: type === 'sheet' ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: [{ name: 'PNG', extensions: ['png'] }]
    }
    const win = parentOf(e)
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (r.canceled || r.filePaths.length === 0) return null
    const names = await importHitEffectFiles(hitEffectRoot(), slot, type, r.filePaths)
    let next: HitEffectSettings = { ...DEFAULT_HIT_EFFECT_SETTINGS }
    await updateSettings(settingsFile(), (settings) => {
      const current = hitEffectsOf(settings)
      next = { ...current, [slot]: sourceWithFiles(current[slot], type, names) }
      settings.hitEffects = next
    })
    return next
  })

  ipcMain.handle('rcm:clear-hit-effect', async (_e, rawSlot: unknown) => {
    const slot = checkSlot(rawSlot)
    await clearHitEffectFiles(hitEffectRoot(), slot)
    let next: HitEffectSettings = { ...DEFAULT_HIT_EFFECT_SETTINGS }
    await updateSettings(settingsFile(), (settings) => {
      next = { ...hitEffectsOf(settings) }
      delete next[slot]
      settings.hitEffects = next
    })
    return next
  })

  ipcMain.handle('rcm:read-hit-effect-images', async (_e, rawSlot: unknown) => {
    const slot = checkSlot(rawSlot)
    const source = hitEffectsOf(await loadSettings(settingsFile()))[slot]
    if (!source) return []
    return readHitEffectFiles(hitEffectRoot(), slot, source.type === 'sheet' ? [source.file] : source.files)
  })

  ipcMain.handle('rcm:save-text-file', async (e, defaultName: string, text: string) => {
    const options: Electron.SaveDialogOptions = {
      title: '파일 저장',
      defaultPath: join(app.getPath('downloads'), defaultName),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    }
    const win = parentOf(e)
    const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (r.canceled || !r.filePath) return null
    await writeFileAtomic(r.filePath, text)
    return r.filePath
  })

  const guideFilesNow = async () =>
    syncGuideFiles((await loadSettings(settingsFile())).guideFiles ?? [], chartFormatGuide)

  ipcMain.handle('rcm:get-guide-files', guideFilesNow)

  ipcMain.handle('rcm:add-guide-file', async (e) => {
    const { guideFiles = [] } = await loadSettings(settingsFile())
    const last = guideFiles.at(-1)
    const options: Electron.SaveDialogOptions = {
      title: '자동 업데이트할 가이드 파일 위치',
      defaultPath: join(last ? dirname(last) : app.getPath('documents'), 'CHART_FORMAT_GUIDE.md'),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    }
    const win = parentOf(e)
    const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (r.canceled || !r.filePath) return null
    const file = r.filePath
    // 경로부터 검사하고(.md만), 파일을 쓴 뒤에 목록에 넣는다
    addGuidePath(guideFiles, file)
    await writeFileAtomic(file, chartFormatGuide)
    await updateSettings(settingsFile(), (settings) => {
      settings.guideFiles = addGuidePath(settings.guideFiles ?? [], file)
    })
    return guideFilesNow()
  })

  ipcMain.handle('rcm:remove-guide-file', async (_e, file: unknown) => {
    if (typeof file !== 'string') throw new Error('파일 경로가 올바르지 않아요')
    await updateSettings(settingsFile(), (settings) => {
      settings.guideFiles = (settings.guideFiles ?? []).filter((p) => !sameGuidePath(p, file))
    })
    return guideFilesNow()
  })

  ipcMain.handle('rcm:show-in-explorer', async (_e, dir: string) => {
    // openPath는 파일이면 실행하므로 이미 있는 폴더만 연다
    await assertDirectory(dir)
    const error = await shell.openPath(dir)
    if (error) throw new Error(error)
  })
}
