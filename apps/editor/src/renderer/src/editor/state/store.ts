import type { SnapDivision } from '@rcm/core'
import type { ProjectFiles } from '../../../../shared/api'
import { dirtyFiles, isDirty, savedRefsOf, type SavedRefs } from './dirty'
import type { ProjectDoc } from './doc'
import type { Clip } from '../commands/notes'
import { History } from './history'

export interface EditorState {
  dir: string
  audioPath: string
  doc: ProjectDoc
  saved: SavedRefs
  activeChart: string
  tool: 'draw' | 'erase' | 'select'
  snap: SnapDivision
  playheadMs: number
  pxPerMs: number
  playing: boolean
  mode: 'edit' | 'recording' | 'playtest'
  selection: ReadonlySet<string>
  panelOpen: boolean
  panelTab: 'song' | 'timing' | 'chart'
  hitsoundVolume: number
  taps: number[]
  clipboard: Clip | null
}

export class EditorStore {
  private state: EditorState
  private readonly history = new History()
  private readonly listeners = new Set<() => void>()
  private reportedDirty = false

  constructor(files: Pick<ProjectFiles, 'dir' | 'audioPath'>, doc: ProjectDoc) {
    this.state = {
      dir: files.dir,
      audioPath: files.audioPath,
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
      hitsoundVolume: 0.6,
      taps: [],
      clipboard: null
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

  async save(): Promise<void> {
    const { doc, saved, dir } = this.state
    const files = dirtyFiles(doc, saved)
    if (files.length > 0) await window.rcm.writeProjectFiles(dir, files)
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
    const dirty = this.isDirty()
    if (dirty !== this.reportedDirty) {
      this.reportedDirty = dirty
      window.rcm.setDirty(dirty)
    }
    for (const fn of [...this.listeners]) fn()
  }
}
