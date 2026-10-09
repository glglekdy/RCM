export interface CreateProjectOptions {
  parentDir: string
  title: string
  artist: string
  audioPath: string
  bpm: number
  chartName: string
  lanes: number
}

export interface ProjectFiles {
  dir: string
  audioPath: string
  songText: string
  charts: { file: string; text: string }[]
  editorText: string | null
}

export interface RecentProject {
  dir: string
  lastOpened: number
  missing: boolean
  title: string
  artist: string
  charts: { name: string; lanes: number }[]
}

export interface RcmApi {
  pickAudioFile(): Promise<string | null>
  pickFolder(defaultPath?: string): Promise<string | null>
  getDefaultProjectDir(): Promise<string>
  resolveProjectDir(parentDir: string, title: string): Promise<string>
  createProject(opts: CreateProjectOptions): Promise<{ dir: string }>
  openProject(dir: string): Promise<ProjectFiles>
  readAudio(path: string): Promise<ArrayBuffer>
  writeProjectFiles(dir: string, files: { name: string; text: string }[]): Promise<void>
  getRecentProjects(): Promise<RecentProject[]>
  removeRecentProject(dir: string): Promise<void>
  showInExplorer(dir: string): Promise<void>
  setDirty(dirty: boolean): void
  onCloseRequested(cb: () => void): () => void
  forceClose(): void
  minimize(): void
  toggleMaximize(): void
  close(): void
  isMaximized(): Promise<boolean>
}

declare global {
  interface Window {
    rcm: RcmApi
  }
}
