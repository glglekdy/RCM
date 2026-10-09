import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu } from 'electron'

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

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

function windowOf(e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  ipcMain.on('rcm:minimize', (e) => windowOf(e)?.minimize())
  ipcMain.on('rcm:toggle-maximize', (e) => {
    const win = windowOf(e)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('rcm:close', (e) => windowOf(e)?.close())
  ipcMain.handle('rcm:is-maximized', (e) => windowOf(e)?.isMaximized() ?? false)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
