import type { FlickDirection, SnapDivision } from '@rcm/core'
import type { ProjectFiles } from '../../../../shared/api'
import { dirtyFiles, isDirty, removedFiles, savedRefsOf, type SavedRefs } from './dirty'
import type { ProjectDoc } from './doc'
import type { Clip } from '../commands/notes'
import { DEFAULT_FLICK_DIRECTION, type FreeClip, type FreeNoteType } from '../commands/freeNotes'
import { History } from './history'

export interface EditorState {
  dir: string
  doc: ProjectDoc
  saved: SavedRefs
  activeChart: string
  /** brush: 끌고 지나간 스냅 위치마다 노트를 까는 연속 그리기 (자유형 채보 전용, 레인형에서는 그리기와 같다) */
  tool: 'draw' | 'erase' | 'select' | 'brush'
  snap: SnapDivision
  playheadMs: number
  pxPerMs: number
  playing: boolean
  mode: 'edit' | 'recording' | 'playtest'
  selection: ReadonlySet<string>
  panelOpen: boolean
  panelTab: 'song' | 'timing' | 'chart'
  /** 타임라인 칩을 눌러 패널에서 강조할 BPM·변속 지점. 패널이 강조한 뒤 null로 비운다 */
  focusPoint: { kind: 'bpm' | 'speed'; tick: number } | null
  hitsoundVolume: number
  musicVolume: number
  taps: number[]
  clipboard: Clip | FreeClip | null
  /** 자유형 채보에서 그릴 노트 종류 */
  freeType: FreeNoteType
  /** freeType이 'gimmick'일 때 그릴 기믹 종류 이름 */
  freeGimmick: string | null
  /** 자유형 채보에서 새 플릭의 방향 (flickMode가 directional일 때) */
  flickDirection: FlickDirection
  /** 자유형 채보에서 클릭으로 그릴 노트 폭(칸). 드래그로 폭을 정하면 그 폭을 기억한다 */
  freeWidth: number
  /** 입력 필드에 포커스가 있다 (확정 안 된 값이 있을 수 있어 닫기 전에 확인한다) */
  fieldFocused: boolean
}

export class EditorStore {
  private state: EditorState
  private readonly history = new History()
  private readonly listeners = new Set<() => void>()
  /** main에 마지막으로 알린 닫기 보호 상태 */
  private reportedGuard = false
  private pendingSave: Promise<void> | null = null

  constructor(files: Pick<ProjectFiles, 'dir'>, doc: ProjectDoc) {
    this.state = {
      dir: files.dir,
      doc,
      saved: savedRefsOf(doc),
      activeChart: doc.charts[0].file,
      tool: 'draw',
      snap: 16,
      playheadMs: 0,
      pxPerMs: 0.3,
      playing: false,
      mode: 'edit',
      selection: new Set(),
      panelOpen: true,
      panelTab: 'song',
      focusPoint: null,
      hitsoundVolume: 0.6,
      musicVolume: 1,
      taps: [],
      clipboard: null,
      freeType: 'tap',
      freeGimmick: null,
      flickDirection: DEFAULT_FLICK_DIRECTION,
      freeWidth: 3,
      fieldFocused: false
    }
  }

  getState(): EditorState {
    return this.state
  }

  readonly subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  set(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  apply(label: string, next: ProjectDoc | null, chartFile?: string): boolean {
    if (!next) return false
    this.history.commit({ label, before: this.state.doc, after: next, chartFile })
    this.set({ doc: next })
    return true
  }

  undo(): void {
    const entry = this.history.undo()
    if (entry) this.restore(entry.before, entry.chartFile)
  }

  redo(): void {
    const entry = this.history.redo()
    if (entry) this.restore(entry.after, entry.chartFile)
  }

  get canUndo(): boolean {
    return this.history.canUndo
  }

  get canRedo(): boolean {
    return this.history.canRedo
  }

  isDirty(): boolean {
    return isDirty(this.state.doc, this.state.saved)
  }

  /** 창을 닫기 전에 물어봐야 하는지: 저장 안 된 변경, 진행 중인 녹음, 입력 중인 필드. */
  needsCloseGuard(): boolean {
    return this.isDirty() || this.state.mode === 'recording' || this.state.fieldFocused
  }

  /** 저장한다. 앞선 저장이 끝나지 않았으면 그 뒤에 이어서 한다 (실패해도 다음 저장은 진행). */
  save(): Promise<void> {
    const prev = this.pendingSave
    const run = prev ? prev.then(() => this.saveNow()) : this.saveNow()
    const settled = run.catch(() => {})
    this.pendingSave = settled
    void settled.then(() => {
      if (this.pendingSave === settled) this.pendingSave = null
    })
    return run
  }

  private async saveNow(): Promise<void> {
    const { doc, saved, dir } = this.state
    const files = dirtyFiles(doc, saved)
    const removed = removedFiles(doc, saved)
    if (files.length > 0) await window.rcm.writeProjectFiles(dir, files)
    if (removed.length > 0) await window.rcm.deleteProjectFiles(dir, removed)
    // 저장하는 동안 편집이 있었더라도 저장된 시점의 문서를 기준으로 삼는다
    this.set({ saved: savedRefsOf(doc) })
  }

  private restore(doc: ProjectDoc, chartFile?: string): void {
    const has = (file: string | undefined): file is string =>
      file !== undefined && doc.charts.some((c) => c.file === file)
    const activeChart = has(chartFile)
      ? chartFile
      : has(this.state.activeChart)
        ? this.state.activeChart
        : doc.charts[0].file
    this.set({ doc, selection: new Set(), activeChart })
  }

  private emit(): void {
    const guard = this.needsCloseGuard()
    if (guard !== this.reportedGuard) {
      this.reportedGuard = guard
      window.rcm.setDirty(guard)
    }
    for (const fn of [...this.listeners]) fn()
  }
}
