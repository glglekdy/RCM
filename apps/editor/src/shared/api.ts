import type { FlickMode, Track } from '@rcm/core'
import type { HitEffectSlot, PlayfieldLayout } from '@rcm/playfield'
import type { HitEffectSettings } from './hitEffects'
import type { UpdateState } from '../main/update/updateState'
import type { PresenceInfo } from './presence'
import type { TrackPreset } from './presets'

export type { UpdateState }

export interface CreateProjectOptions {
  parentDir: string
  title: string
  artist: string
  /** 음악 파일 경로. null이면 음악 없이 만든다 (나중에 곡 탭에서 고른다) */
  audioPath: string | null
  bpm: number
  chartName: string
  tracks: Track[]
  /** 있으면 첫 난이도를 자유형(모바일) 채보로 만든다. tracks는 쓰지 않는다 */
  free?: { columns: number; flickMode: FlickMode }
}

export interface ProjectFiles {
  dir: string
  songText: string
  charts: { file: string; text: string }[]
  editorText: string | null
}

/** 자동 문서 업데이트에 넣은 파일과 마지막으로 맞춘 결과 */
export interface GuideFile {
  path: string
  /** current = 이미 최신, updated = 방금 새 가이드로 바꿈, missing = 파일이 없음 (다시 만들지 않는다) */
  status: 'current' | 'updated' | 'missing' | 'error'
  error?: string
}

export interface RecentProject {
  dir: string
  lastOpened: number
  missing: boolean
  title: string
  artist: string
  /** 자유형 채보는 trackCount 대신 칸 수(columns)가 있다 */
  charts: { name: string; trackCount: number; columns?: number }[]
}

/** 휴지통으로 보내지 못한 프로젝트와 그 이유 */
export interface TrashFailure {
  dir: string
  error: string
}

/** 실행 환경이 지원하는 기능. 지원하지 않는 기능의 화면은 숨긴다. */
export interface Capabilities {
  windowControls: boolean // 제목 표시줄·최소화·최대화·닫기
  autoUpdate: boolean // 앱 내 업데이트
  discord: boolean
  revealInExplorer: boolean
  guideFileSync: boolean // AI 가이드 자동 문서 업데이트
  chooseProjectFolder: boolean // 새 프로젝트 저장 위치, 다시 연결
  trash: boolean // false면 삭제가 영구 삭제
  recording: boolean // 실시간 녹음
  autoSave: boolean // 화면이 가려질 때 자동 저장을 지원
}

export interface RcmApi {
  readonly capabilities: Capabilities
  pickAudioFile(): Promise<string | null>
  pickFolder(defaultPath?: string): Promise<string | null>
  getDefaultProjectDir(): Promise<string>
  resolveProjectDir(parentDir: string, title: string): Promise<string>
  createProject(opts: CreateProjectOptions): Promise<{ dir: string }>
  openProject(dir: string): Promise<ProjectFiles>
  /** 프로젝트 ZIP을 기본 저장 위치에 풀고 최근 목록에 등록한다. 잘못된 ZIP이면 이유를 담아 reject. */
  importProjectZip(zipPath: string): Promise<{ dir: string }>
  /** 프로젝트를 ZIP으로 내보낸다. 취소하면 null, 저장하면 파일 이름(웹) 또는 경로(PC). */
  exportProjectZip(dir: string): Promise<string | null>
  /** 대화상자에서 ZIP을 고른다. 취소하면 null. 결과는 importProjectZip에 넘기는 경로. */
  pickProjectZip(): Promise<string | null>
  /** 끌어다 놓은 파일의 디스크 경로. 디스크 파일이 아니면 빈 문자열. */
  pathForFile(file: File): string
  readAudio(path: string): Promise<ArrayBuffer>
  /** 음악 파일을 프로젝트 폴더에 새 이름으로 복사하고 그 파일 이름(song.json의 `audio` 값)을 돌려준다. */
  importProjectAudio(dir: string, source: string): Promise<string>
  /** 대화상자에서 고른 채보 파일 경로들. 취소하면 빈 배열. */
  pickChartFiles(): Promise<string[]>
  /** 프로젝트 밖의 채보 파일(`.json`)을 읽는다. */
  readChartFile(path: string): Promise<string>
  /** 저장 대화상자(기본 위치: 다운로드 폴더)로 채보를 내보낸다. 취소하면 null, 저장하면 그 경로. */
  exportChart(defaultName: string, text: string): Promise<string | null>
  writeProjectFiles(dir: string, files: { name: string; text: string }[]): Promise<void>
  /** 프로젝트 폴더의 `*.chart.json` 파일을 지운다 (다른 이름은 거부). */
  deleteProjectFiles(dir: string, names: string[]): Promise<void>
  getRecentProjects(): Promise<RecentProject[]>
  removeRecentProject(dir: string): Promise<void>
  /** 찾을 수 없는 프로젝트(`from`)를 옮겨 간 폴더(`to`)에 다시 연결한다. `to`가 프로젝트 폴더가 아니면 reject. */
  relinkRecentProject(from: string, to: string): Promise<void>
  /** 최근 목록의 프로젝트 폴더들을 휴지통으로 보내고 목록에서 뺀다. 실패한 것만 돌려준다. */
  trashProjects(dirs: string[]): Promise<TrashFailure[]>
  showInExplorer(dir: string): Promise<void>
  /** 저장 대화상자(기본 위치: 다운로드 폴더)로 텍스트 파일을 저장한다. 취소하면 null, 저장하면 그 경로. */
  saveTextFile(defaultName: string, text: string): Promise<string | null>
  /** 자동 문서 업데이트 목록. 돌려주기 전에 각 파일을 앱의 AI 가이드로 맞춘다. */
  getGuideFiles(): Promise<GuideFile[]>
  /** 저장 대화상자로 고른 위치에 AI 가이드를 저장하고 자동 업데이트에 넣는다. 취소하면 null. */
  addGuideFile(): Promise<GuideFile[] | null>
  /** 자동 업데이트에서 뺀다 (파일은 지우지 않는다). */
  removeGuideFile(path: string): Promise<GuideFile[]>
  /** 저장된 트랙 프리셋 (없거나 잘못됐으면 기본 프리셋)과 마지막으로 고른 프리셋 id. */
  getPresets(): Promise<{ presets: TrackPreset[]; lastPresetId: string | null }>
  /** 프리셋 목록 전체를 저장한다. 잘못된 값이 하나라도 있으면 reject. */
  savePresets(presets: TrackPreset[]): Promise<void>
  setLastPresetId(id: string): Promise<void>
  /** 판정 오프셋(ms). 저장된 값이 없으면 0. */
  getJudgeOffset(): Promise<number>
  /** 범위(-200~200) 밖이면 reject. */
  setJudgeOffset(ms: number): Promise<void>
  /** 웹 자동 저장 설정 (없으면 켬). PC는 항상 false를 돌려준다. */
  getAutoSave(): Promise<boolean>
  setAutoSave(enabled: boolean): Promise<void>
  /** 편집 화면을 나갈 때 부른다. 웹은 탭 잠금을 푼다, PC는 아무 일도 안 한다. */
  closeProject(dir: string): Promise<void>
  /** 저장소 사용량(바이트). 측정할 수 없으면(PC) null. */
  getStorageUsage(): Promise<{ usedBytes: number } | null>
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
  /** 업데이트 내역을 마지막으로 확인한 버전과, 처음 설치인지 (설정 파일이 없었음). */
  getWhatsNewState(): Promise<{ lastSeenVersion: string | null; firstRun: boolean }>
  /** `X.Y.Z`가 아니면 reject. */
  setLastSeenVersion(version: string): Promise<void>
  /** 홈에서 닫은 공지 id 목록. */
  getDismissedNotices(): Promise<string[]>
  /** 공지를 닫은 것으로 저장한다. id 형식이 틀리면 reject. */
  dismissNotice(id: string): Promise<void>
  /** 공개 저장소의 공지사항 파일(NOTICES.md) 내용. 받지 못하면 null, 파일이 없으면 빈 문자열. */
  fetchAnnouncements(): Promise<string | null>
  /** 이미 본 공지사항 id 목록. */
  getSeenAnnouncements(): Promise<string[]>
  /** 공지사항을 본 것으로 저장한다. id 형식이 틀리면 reject. */
  markAnnouncementsSeen(ids: string[]): Promise<void>
  /** 테스트 플레이에서 마지막으로 쓴 배속. 저장된 값이 없으면 null. */
  getPlaytestSpeed(): Promise<number | null>
  /** 범위(1.0~9.0) 밖이면 reject. */
  setPlaytestSpeed(speed: number): Promise<void>
  /** 게임플레이 레이아웃 (저장된 값이 없으면 기본값). */
  getGameplayLayout(): Promise<PlayfieldLayout>
  /** 범위 밖 값은 범위로 잘라 저장한다. */
  setGameplayLayout(layout: PlayfieldLayout): Promise<void>
  /** 타격 이펙트 설정 (저장된 값이 없으면 기본값). */
  getHitEffects(): Promise<HitEffectSettings>
  /** 켜기·크기·합치기와 슬롯 숫자만 저장한다. 슬롯 파일은 바뀌지 않는다. */
  setHitEffects(settings: HitEffectSettings): Promise<void>
  /** 대화상자에서 고른 PNG를 복사하고 새 설정값을 돌려준다. 취소하면 null, 파일이 맞지 않으면 reject. */
  pickHitEffect(slot: HitEffectSlot, type: 'sheet' | 'frames'): Promise<HitEffectSettings | null>
  /** 슬롯을 비워 기본 이펙트로 되돌리고 새 설정값을 돌려준다. */
  clearHitEffect(slot: HitEffectSlot): Promise<HitEffectSettings>
  /** 슬롯 이미지 바이트 (시트는 1개, 프레임은 순서대로). 슬롯이 비었으면 빈 배열, 파일이 없으면 reject. */
  readHitEffectImages(slot: HitEffectSlot): Promise<Uint8Array[]>
}

declare global {
  interface Window {
    rcm: RcmApi
  }
}
