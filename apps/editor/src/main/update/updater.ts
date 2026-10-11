import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, ipcMain, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { cleanPendingInstallers } from './cache'
import { afterAllClosed, nextState, shouldCheck, type UpdateState, type UpdaterEvent } from './updateState'

const FIRST_CHECK_DELAY_MS = 5000

let state: UpdateState = { kind: 'idle' }
let installRequested = false

/**
 * electron-updater가 받은 설치 파일을 두는 폴더. electron-updater와 같은 계산:
 * `%LOCALAPPDATA%` + app-update.yml의 `updaterCacheDirName`(없으면 앱 이름) + `pending`.
 */
async function pendingDir(): Promise<string> {
  const base = process.env['LOCALAPPDATA'] || join(homedir(), 'AppData', 'Local')
  let dirName: string | null = null
  try {
    const yml = await fs.readFile(join(process.resourcesPath, 'app-update.yml'), 'utf-8')
    const m = /^updaterCacheDirName:\s*['"]?([^'"\r\n]+?)['"]?\s*$/m.exec(yml)
    dirName = m?.[1] ?? null
  } catch (err) {
    console.error('app-update.yml을 읽지 못했어요', err)
  }
  if (dirName === null) console.warn('app-update.yml에서 updaterCacheDirName을 찾지 못해 앱 이름을 대신 써요')
  return join(base, dirName ?? app.getName(), 'pending')
}

function cleanPending(keepVersion: string | null): void {
  void pendingDir().then((dir) => cleanPendingInstallers(dir, keepVersion, app.getVersion()))
}

function check(): void {
  if (!shouldCheck(state)) return
  // 실패는 'error' 이벤트로 상태에 반영되므로 여기서는 삼킨다 (앱 동작을 막지 않는다).
  autoUpdater
    .checkForUpdates()
    .then((result) => result?.downloadPromise?.catch(() => {}))
    .catch(() => {})
}

/** 모든 창이 닫힌 뒤: 설치를 요청했고 받아 둔 업데이트가 있으면 설치 후 다시 실행, 아니면 종료. */
export function quitOrInstall(): void {
  if (afterAllClosed(installRequested, state.kind === 'ready') === 'install') {
    autoUpdater.quitAndInstall(true, true)
  } else {
    app.quit()
  }
}

export function startUpdater(getWindows: () => BrowserWindow[]): void {
  ipcMain.handle('rcm:get-app-version', () => app.getVersion())
  ipcMain.handle('rcm:is-packaged', () => app.isPackaged)
  ipcMain.handle('rcm:get-update-state', () => state)
  ipcMain.handle('rcm:check-for-updates', () => {
    if (app.isPackaged) check()
    return state
  })
  ipcMain.on('rcm:install-update', () => {
    if (state.kind !== 'ready') return
    installRequested = true
    // 저장 안 한 창은 기존 닫기 가드가 renderer에 확인을 묻는다. 취소하면 창이 남고 설치되지 않는다.
    for (const win of getWindows()) win.close()
  })

  // 닫기 확인을 취소하면 설치 요청도 취소한다 (이후 평범한 종료가 재시작하지 않도록).
  ipcMain.on('rcm:close-cancelled', () => {
    installRequested = false
  })

  // 개발 모드에서는 업데이트 확인을 하지 않는다 (상태는 idle 고정).
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  // 앱을 그냥 닫을 때는 설치하지 않는다. 조용한 설치가 몇 초간 RCM.exe를 치워 두는 사이에
  // 바탕화면 바로가기를 누르면 "바로 가기 문제" 오류가 난다. 설치는 '지금 재시작'으로만 하고,
  // 그때는 설치 후 앱이 스스로 다시 열린다. 받아 둔 설치 파일은 다음 실행 때 다시 'ready'가 된다.
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false

  const apply = (e: UpdaterEvent): void => {
    state = nextState(state, e)
    for (const win of getWindows()) {
      if (!win.isDestroyed()) win.webContents.send('rcm:update-state', state)
    }
  }
  autoUpdater.on('checking-for-update', () => apply({ type: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    apply({ type: 'available', version: info.version })
    cleanPending(info.version)
  })
  autoUpdater.on('update-not-available', (info) => apply({ type: 'not-available', version: info.version }))
  autoUpdater.on('download-progress', (p) => apply({ type: 'progress', percent: p.percent }))
  autoUpdater.on('update-downloaded', (info) => apply({ type: 'downloaded', version: info.version }))
  autoUpdater.on('error', (err) => {
    apply({ type: 'error', message: err?.message ?? String(err) })
    // 설치를 시작하지 못하면 창 없이 남지 않도록 종료한다.
    if (installRequested && getWindows().length === 0) app.quit()
  })

  cleanPending(null)
  setTimeout(check, FIRST_CHECK_DELAY_MS)
}
