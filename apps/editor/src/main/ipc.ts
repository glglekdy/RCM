import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { CreateProjectOptions, RecentProject } from '../shared/api'
import { writeFileAtomic } from './project/atomicWrite'
import {
  assertDirectory,
  createProject,
  deleteProjectFiles,
  openProjectFiles,
  readAudioFile,
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
  validatePresets
} from './project/settings'

export const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')
const defaultProjectDir = (): string => join(app.getPath('documents'), 'RCM Projects')

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

  ipcMain.handle('rcm:open-project', async (_e, dir: string) => {
    const files = await openProjectFiles(dir)
    await touch(dir)
    return files
  })

  ipcMain.handle('rcm:read-audio', (_e, path: string) => readAudioFile(path))

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

  ipcMain.handle('rcm:show-in-explorer', async (_e, dir: string) => {
    // openPath는 파일이면 실행하므로 이미 있는 폴더만 연다
    await assertDirectory(dir)
    const error = await shell.openPath(dir)
    if (error) throw new Error(error)
  })
}
