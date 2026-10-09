import { contextBridge, ipcRenderer } from 'electron'
import type { RcmApi } from '../shared/api'

const api: RcmApi = {
  minimize: () => ipcRenderer.send('rcm:minimize'),
  toggleMaximize: () => ipcRenderer.send('rcm:toggle-maximize'),
  close: () => ipcRenderer.send('rcm:close'),
  isMaximized: () => ipcRenderer.invoke('rcm:is-maximized')
}

contextBridge.exposeInMainWorld('rcm', api)
