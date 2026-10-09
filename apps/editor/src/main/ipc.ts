import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { CreateProjectOptions, RecentProject } from '../shared/api'
import {
  createProject,
  openProjectFiles,
  resolveProjectDir,
  summarizeProject,
  writeProjectFiles
} from './project/projectFs'
import { loadSettings, saveSettings, touchRecent } from './project/settings'

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')
const defaultProjectDir = (): string => join(app.getPath('documents'), 'RCM Projects')

async function touch(dir: string, extra?: { defaultProjectDir: string }): Promise<void> {
  const settings = await loadSettings(settingsFile())
  settings.recent = touchRecent(settings.recent, dir, Date.now())
  if (extra) settings.defaultProjectDir = extra.defaultProjectDir
  await saveSettings(settingsFile(), settings)
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

  ipcMain.handle('rcm:read-audio', async (_e, path: string) => {
    const buf = await fs.readFile(path)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })

  ipcMain.handle(
    'rcm:write-project-files',
    (_e, dir: string, files: { name: string; text: string }[]) => writeProjectFiles(dir, files)
  )

  ipcMain.handle('rcm:get-recent-projects', async (): Promise<RecentProject[]> => {
    const { recent } = await loadSettings(settingsFile())
    const list = await Promise.all(
      recent.map(async (r) => ({ ...(await summarizeProject(r.dir)), lastOpened: r.lastOpened }))
    )
    return list.sort((a, b) => b.lastOpened - a.lastOpened)
  })

  ipcMain.handle('rcm:remove-recent-project', async (_e, dir: string) => {
    const settings = await loadSettings(settingsFile())
    settings.recent = settings.recent.filter((r) => r.dir !== dir)
    await saveSettings(settingsFile(), settings)
  })

  ipcMain.handle('rcm:show-in-explorer', async (_e, dir: string) => {
    await shell.openPath(dir)
  })
}
