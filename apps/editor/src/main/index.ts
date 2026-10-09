import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, Menu, session } from 'electron'
import { registerProjectIpc } from './ipc'
import { isAllowedNavigation } from './navigation'

// CSP is a response header (not a meta tag) so it governs every script,
// including the inline preamble Vite/plugin-react injects at the top of <head> in dev.
function contentSecurityPolicy(dev: boolean): string {
  return [
    "default-src 'self'",
    dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    dev ? "connect-src 'self' ws:" : "connect-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:"
  ].join('; ')
}

function installCsp(): void {
  const csp = contentSecurityPolicy(!app.isPackaged && !!process.env['ELECTRON_RENDERER_URL'])
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] }
    })
  })
}

const dirtyWindows = new Set<number>()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    backgroundColor: '#141414',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win.show())

  // 보안: 창은 앱 페이지 밖으로 이동하거나 새 창을 열지 않는다. 파일을 끌어다 놓으면
  // Chromium이 그 파일로 이동하는데, 그러면 저장 안 된 편집이 사라지고 이동한 페이지가
  // preload의 window.rcm을 받게 된다.
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  const indexHtml = join(__dirname, '../renderer/index.html')
  const appUrl = devServerUrl ?? pathToFileURL(indexHtml).href
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAllowedNavigation(url, appUrl)) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Close guard: while the renderer reports unsaved changes, ask it to confirm instead of closing.
  win.on('close', (e) => {
    if (!dirtyWindows.has(win.id)) return
    e.preventDefault()
    win.webContents.send('rcm:close-requested')
  })
  win.on('closed', () => dirtyWindows.delete(win.id))
  // A reloaded or crashed renderer can no longer answer the close prompt, so drop the guard.
  // 'did-navigate' fires only when a main-frame load commits (a reload; other navigations are
  // blocked above). 'did-start-loading' would also fire for a navigation that will-navigate
  // then cancels, which dropped the guard while the unsaved page stayed open.
  win.webContents.on('did-navigate', () => dirtyWindows.delete(win.id))
  win.webContents.on('render-process-gone', () => dirtyWindows.delete(win.id))

  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(indexHtml)
  }
  return win
}

function windowOf(e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  installCsp()
  ipcMain.on('rcm:minimize', (e) => windowOf(e)?.minimize())
  ipcMain.on('rcm:toggle-maximize', (e) => {
    const win = windowOf(e)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('rcm:close', (e) => windowOf(e)?.close())
  ipcMain.handle('rcm:is-maximized', (e) => windowOf(e)?.isMaximized() ?? false)
  ipcMain.on('rcm:set-dirty', (e, dirty: boolean) => {
    const win = windowOf(e)
    if (!win) return
    if (dirty) dirtyWindows.add(win.id)
    else dirtyWindows.delete(win.id)
  })
  ipcMain.on('rcm:force-close', (e) => {
    const win = windowOf(e)
    if (!win) return
    dirtyWindows.delete(win.id)
    win.close()
  })
  registerProjectIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
