import type { Track } from '@rcm/core'
import type { UpdateState } from '../main/update/updateState'
import type { PresenceInfo } from './presence'
import type { TrackPreset } from './presets'

export type { UpdateState }

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
  /** 저장 대화상자(기본 위치: 다운로드 폴더)로 텍스트 파일을 저장한다. 취소하면 null, 저장하면 그 경로. */
  saveTextFile(defaultName: string, text: string): Promise<string | null>
  /** 저장된 트랙 프리셋 (없거나 잘못됐으면 기본 프리셋)과 마지막으로 고른 프리셋 id. */
  getPresets(): Promise<{ presets: TrackPreset[]; lastPresetId: string | null }>
  /** 프리셋 목록 전체를 저장한다. 잘못된 값이 하나라도 있으면 reject. */
  savePresets(presets: TrackPreset[]): Promise<void>
  setLastPresetId(id: string): Promise<void>
  setDirty(dirty: boolean): void
  onCloseRequested(cb: () => void): () => void
  forceClose(): void
  /** 닫기 확인을 취소했다고 알린다 (재시작 설치 요청도 함께 취소된다). */
  closeCancelled(): void
  minimize(): void
  toggleMaximize(): void
  close(): void
  isMaximized(): Promise<boolean>
  getAppVersion(): Promise<string>
  isPackaged(): Promise<boolean>
  getUpdateState(): Promise<UpdateState>
  /** 확인 중·받는 중·준비됨이면 새로 확인하지 않고 현재 상태를 돌려준다. */
  checkForUpdates(): Promise<UpdateState>
  /** 저장 안 한 변경 확인(닫기 가드)을 거쳐 창을 닫고, 받아 둔 업데이트를 설치한 뒤 다시 실행한다. */
  installUpdate(): void
  onUpdateState(cb: (s: UpdateState) => void): () => void
  /** 디스코드 활동에 보일 편집 상태. 홈 화면이면 null. */
  setPresence(info: PresenceInfo | null): void
  /** 디스코드 활동 표시 설정 (없으면 켜짐). */
  getDiscordPresence(): Promise<boolean>
  /** 설정에 저장하고 바로 반영한다. */
  setDiscordPresence(enabled: boolean): Promise<void>
}

declare global {
  interface Window {
    rcm: RcmApi
  }
}
