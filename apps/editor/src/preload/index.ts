import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { RcmApi, UpdateState } from '../shared/api'

const api: RcmApi = {
  pickAudioFile: () => ipcRenderer.invoke('rcm:pick-audio-file'),
  pickFolder: (defaultPath) => ipcRenderer.invoke('rcm:pick-folder', defaultPath),
  getDefaultProjectDir: () => ipcRenderer.invoke('rcm:get-default-project-dir'),
  resolveProjectDir: (parentDir, title) => ipcRenderer.invoke('rcm:resolve-project-dir', parentDir, title),
  createProject: (opts) => ipcRenderer.invoke('rcm:create-project', opts),
  openProject: (dir) => ipcRenderer.invoke('rcm:open-project', dir),
  importProjectZip: (zipPath) => ipcRenderer.invoke('rcm:import-project-zip', zipPath),
  pathForFile: (file) => webUtils.getPathForFile(file),
  readAudio: (path) => ipcRenderer.invoke('rcm:read-audio', path),
  importProjectAudio: (dir, source) => ipcRenderer.invoke('rcm:import-project-audio', dir, source),
  writeProjectFiles: (dir, files) => ipcRenderer.invoke('rcm:write-project-files', dir, files),
  deleteProjectFiles: (dir, names) => ipcRenderer.invoke('rcm:delete-project-files', dir, names),
  getRecentProjects: () => ipcRenderer.invoke('rcm:get-recent-projects'),
  removeRecentProject: (dir) => ipcRenderer.invoke('rcm:remove-recent-project', dir),
  showInExplorer: (dir) => ipcRenderer.invoke('rcm:show-in-explorer', dir),
  saveTextFile: (defaultName, text) => ipcRenderer.invoke('rcm:save-text-file', defaultName, text),
  getPresets: () => ipcRenderer.invoke('rcm:get-presets'),
  savePresets: (presets) => ipcRenderer.invoke('rcm:save-presets', presets),
  setLastPresetId: (id) => ipcRenderer.invoke('rcm:set-last-preset-id', id),
  setDirty: (dirty) => ipcRenderer.send('rcm:set-dirty', dirty),
  onCloseRequested: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on('rcm:close-requested', listener)
    return () => {
      ipcRenderer.removeListener('rcm:close-requested', listener)
    }
  },
  forceClose: () => ipcRenderer.send('rcm:force-close'),
  closeCancelled: () => ipcRenderer.send('rcm:close-cancelled'),
  minimize: () => ipcRenderer.send('rcm:minimize'),
  toggleMaximize: () => ipcRenderer.send('rcm:toggle-maximize'),
  close: () => ipcRenderer.send('rcm:close'),
  isMaximized: () => ipcRenderer.invoke('rcm:is-maximized'),
  getAppVersion: () => ipcRenderer.invoke('rcm:get-app-version'),
  isPackaged: () => ipcRenderer.invoke('rcm:is-packaged'),
  getUpdateState: () => ipcRenderer.invoke('rcm:get-update-state'),
  checkForUpdates: () => ipcRenderer.invoke('rcm:check-for-updates'),
  installUpdate: () => ipcRenderer.send('rcm:install-update'),
  onUpdateState: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, s: UpdateState): void => cb(s)
    ipcRenderer.on('rcm:update-state', listener)
    return () => {
      ipcRenderer.removeListener('rcm:update-state', listener)
    }
  },
  setPresence: (info) => ipcRenderer.send('rcm:set-presence', info),
  getDiscordPresence: () => ipcRenderer.invoke('rcm:get-discord-presence'),
  setDiscordPresence: (enabled) => ipcRenderer.invoke('rcm:set-discord-presence', enabled),
  getWhatsNewState: () => ipcRenderer.invoke('rcm:get-whats-new-state'),
  setLastSeenVersion: (version) => ipcRenderer.invoke('rcm:set-last-seen-version', version),
  getPlaytestSpeed: () => ipcRenderer.invoke('rcm:get-playtest-speed'),
  setPlaytestSpeed: (speed) => ipcRenderer.invoke('rcm:set-playtest-speed', speed),
  getGameplayLayout: () => ipcRenderer.invoke('rcm:get-gameplay-layout'),
  setGameplayLayout: (layout) => ipcRenderer.invoke('rcm:set-gameplay-layout', layout)
}

contextBridge.exposeInMainWorld('rcm', api)
