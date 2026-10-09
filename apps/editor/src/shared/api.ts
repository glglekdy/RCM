import type { Track } from '@rcm/core'
import type { TrackPreset } from './presets'

export interface CreateProjectOptions {
  parentDir: string
  title: string
  artist: string
  audioPath: string
  bpm: number
  chartName: string
  tracks: Track[]
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
  charts: { name: string; trackCount: number }[]
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
  /** 프로젝트 폴더의 `*.chart.json` 파일을 지운다 (다른 이름은 거부). */
  deleteProjectFiles(dir: string, names: string[]): Promise<void>
  getRecentProjects(): Promise<RecentProject[]>
  removeRecentProject(dir: string): Promise<void>
  showInExplorer(dir: string): Promise<void>
  /** 저장된 트랙 프리셋 (없거나 잘못됐으면 기본 프리셋)과 마지막으로 고른 프리셋 id. */
  getPresets(): Promise<{ presets: TrackPreset[]; lastPresetId: string | null }>
  /** 프리셋 목록 전체를 저장한다. 잘못된 값이 하나라도 있으면 reject. */
  savePresets(presets: TrackPreset[]): Promise<void>
  setLastPresetId(id: string): Promise<void>
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
