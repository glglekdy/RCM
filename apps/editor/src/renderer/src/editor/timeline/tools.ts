import { noteKey, snapTick, type Note, type TimingMap } from '@rcm/core'
import { markerAtY, removeMarker } from '../commands/markers'
import { addNote, moveNotes, removeNotes, shiftNote } from '../commands/notes'
import { getChart } from '../state/doc'
import type { EditorStore } from '../state/store'
import {
  hitTestNote,
  NOTE_HEIGHT,
  notesInRect,
  pointerToCell,
  type SelectRect
} from './hitTest'
import { xToLane, yToMs, type TimelineLayout, type TimelineView } from './view'

export interface ToolGeometry {
  tm: TimingMap
  view: TimelineView
  layout: TimelineLayout
}

/** 캔버스 기준 좌표의 포인터 입력. button: 0 왼쪽, 2 오른쪽. */
export interface ToolPointer {
  x: number
  y: number
  button: number
  shift: boolean
}

/** 드래그하는 동안 그림에 얹는 것. */
export interface ToolOverlay {
  /** 그리는 중이거나 옮기는 중인 노트 */
  preview: Note[]
  /** preview를 그 자리에 놓을 수 없음 (겹침·범위 밖) */
  previewInvalid: boolean
  /** 지우는 중이거나 옮기는 중이라 원래 자리에서 숨길 노트 */
  hiddenKeys: ReadonlySet<string>
  selectRect: SelectRect | null
}

export interface ToolController {
  onPointerDown(e: ToolPointer): void
  onPointerMove(e: ToolPointer): void
  onPointerUp(e: ToolPointer): void
  onContextMenu(e: ToolPointer): void
  /** 진행 중인 드래그를 버린다 (Escape). */
  cancel(): void
  overlay(): ToolOverlay
}

type DrawDrag = {
  kind: 'draw'
  file: string
  lane: number
  track: string
  tick: number
  preview: Note
  invalid: boolean
}
type EraseDrag = { kind: 'erase'; file: string; keys: Set<string>; x: number; y: number }
type RectDrag = {
  kind: 'rect'
  file: string
  x: number
  y: number
  additive: boolean
  /** 드래그 전 선택 (취소하면 되돌린다) */
  before: ReadonlySet<string>
  /** 한 번이라도 움직였는지. 움직이지 않은 클릭은 사각형 없이 선택만 해제한다 */
  moved: boolean
  rect: SelectRect | null
}
type MoveDrag = {
  kind: 'move'
  file: string
  keys: ReadonlySet<string>
  /** 시작 지점의 트랙 위치와 스냅 tick */
  lane: number
  tick: number
  dLane: number
  dTick: number
  preview: Note[]
  invalid: boolean
}
type Drag = DrawDrag | EraseDrag | RectDrag | MoveDrag

const NO_KEYS: ReadonlySet<string> = new Set()
const NO_NOTES: Note[] = []
/** 지우기 드래그에서 이전 위치와 현재 위치 사이를 이 간격(px)으로 훑는다. */
const ERASE_STEP = NOTE_HEIGHT / 2

export function createToolController(
  store: EditorStore,
  getGeometry: () => ToolGeometry
): ToolController {
  let drag: Drag | null = null

  const chartNotes = (file: string) => getChart(store.getState().doc, file).notes

  /** 트랙 위치. 트랙 영역 왼쪽 밖이면 -1, 오른쪽 밖이면 트랙 수. */
  const laneAt = (x: number) => {
    const { layout } = getGeometry()
    if (x < layout.tracksX) return -1
    return xToLane(layout, x) ?? layout.columns.length
  }

  /** 스냅하지 않은 tick */
  const tickAt = (y: number) => {
    const { tm, view } = getGeometry()
    return tm.msToTick(yToMs(view, y))
  }

  /** 그리기 드래그의 현재 노트: 같은 트랙에서 시작 칸보다 위면 hold, 아니면 tap. */
  const drawNote = (d: DrawDrag, y: number): Note => {
    const { tm, view, layout } = getGeometry()
    const col = layout.columns[d.lane]
    const end = pointerToCell(tm, view, layout, col.x + col.width / 2, y, store.getState().snap)
    return end && end.tick > d.tick
      ? { tick: d.tick, track: d.track, type: 'hold', endTick: end.tick }
      : { tick: d.tick, track: d.track, type: 'tap' }
  }

  const eraseAt = (d: EraseDrag, x: number, y: number) => {
    const { tm, view, layout } = getGeometry()
    const notes = chartNotes(d.file).filter((n) => !d.keys.has(noteKey(n)))
    const steps = Math.max(1, Math.ceil(Math.hypot(x - d.x, y - d.y) / ERASE_STEP))
    for (let i = 1; i <= steps; i++) {
      const px = d.x + ((x - d.x) * i) / steps
      const py = d.y + ((y - d.y) * i) / steps
      const hit = hitTestNote(notes, tm, view, layout, px, py)
      if (hit) d.keys.add(noteKey(hit))
    }
    d.x = x
    d.y = y
  }

  /** 시작점과 현재 점이 걸친 트랙 위치(트랙 범위로 자름)와 tick 범위. 트랙에 걸치지 않으면 null. */
  const rectTo = (d: RectDrag, x: number, y: number) => {
    d.moved = true
    const { layout } = getGeometry()
    const lane0 = Math.max(0, laneAt(Math.min(d.x, x)))
    const lane1 = Math.min(layout.columns.length - 1, laneAt(Math.max(d.x, x)))
    const t0 = tickAt(d.y)
    const t1 = tickAt(y)
    d.rect =
      lane0 <= lane1 ? { lane0, lane1, tick0: Math.min(t0, t1), tick1: Math.max(t0, t1) } : null
    const { notes, tracks } = getChart(store.getState().doc, d.file)
    const r = d.rect
    const picked = r
      ? notesInRect(notes, tracks, r.lane0, r.lane1, r.tick0, r.tick1)
      : new Set<string>()
    if (d.additive) for (const key of d.before) picked.add(key)
    store.set({ selection: picked })
  }

  /** 옮기기 드래그: 시작점과 현재 포인터의 스냅 tick 차이·트랙 위치 차이만큼 옮긴 미리보기. */
  const moveTo = (d: MoveDrag, x: number, y: number) => {
    const s = store.getState()
    d.dLane = laneAt(x) - d.lane
    d.dTick = snapTick(getGeometry().tm, tickAt(y), s.snap) - d.tick
    if (d.dLane === 0 && d.dTick === 0) {
      d.preview = NO_NOTES
      d.invalid = false
      return
    }
    const chart = getChart(s.doc, d.file)
    d.preview = chart.notes
      .filter((n) => d.keys.has(noteKey(n)))
      .map((n) => shiftNote(n, d.dTick, d.dLane, chart.tracks))
      .filter((n): n is Note => n !== null)
    d.invalid = moveNotes(s.doc, d.file, d.keys, d.dTick, d.dLane) === null
  }

  /** 선택 도구 누름: Shift+노트는 토글, 노트는 옮기기, 빈 곳은 사각 선택. */
  const selectDown = (e: ToolPointer, file: string) => {
    const s = store.getState()
    const { tm, view, layout } = getGeometry()
    const hit = hitTestNote(chartNotes(file), tm, view, layout, e.x, e.y)
    if (!hit) {
      const d: RectDrag = {
        kind: 'rect',
        file,
        x: e.x,
        y: e.y,
        additive: e.shift,
        before: s.selection,
        moved: false,
        rect: null
      }
      drag = d
      store.set({ selection: e.shift ? s.selection : new Set() })
      return
    }
    const key = noteKey(hit)
    if (e.shift) {
      const selection = new Set(s.selection)
      if (!selection.delete(key)) selection.add(key)
      store.set({ selection })
      return
    }
    // 선택 안 된 노트를 잡으면 그 노트만 선택해 옮긴다
    if (!s.selection.has(key)) store.set({ selection: new Set([key]) })
    drag = {
      kind: 'move',
      file,
      keys: store.getState().selection,
      lane: laneAt(e.x),
      tick: snapTick(tm, tickAt(e.y), s.snap),
      dLane: 0,
      dTick: 0,
      preview: NO_NOTES,
      invalid: false
    }
  }

  return {
    onPointerDown(e) {
      const s = store.getState()
      if (e.button !== 0 || s.playing) return
      drag = null
      const file = s.activeChart
      if (s.tool === 'draw') {
        const { tm, view, layout } = getGeometry()
        const cell = pointerToCell(tm, view, layout, e.x, e.y, s.snap)
        if (!cell) return
        const preview: Note = { tick: cell.tick, track: cell.track, type: 'tap' }
        // 이미 노트가 있는 자리에서는 시작하지 않는다 (같은 칸에서 시작하는 hold도 겹친다)
        if (!addNote(s.doc, file, preview)) return
        drag = { kind: 'draw', file, ...cell, preview, invalid: false }
      } else if (s.tool === 'erase') {
        drag = { kind: 'erase', file, keys: new Set(), x: e.x, y: e.y }
        eraseAt(drag, e.x, e.y)
      } else {
        selectDown(e, file)
      }
    },

    onPointerMove(e) {
      const d = drag
      if (!d) return
      if (d.kind === 'draw') {
        d.preview = drawNote(d, e.y)
        d.invalid = !addNote(store.getState().doc, d.file, d.preview)
      } else if (d.kind === 'erase') {
        eraseAt(d, e.x, e.y)
      } else if (d.kind === 'rect') {
        rectTo(d, e.x, e.y)
      } else {
        moveTo(d, e.x, e.y)
      }
    },

    onPointerUp(e) {
      const d = drag
      if (!d) return
      drag = null
      const s = store.getState()
      if (s.playing) return
      if (d.kind === 'draw') {
        const note = drawNote(d, e.y)
        store.apply('노트 추가', addNote(s.doc, d.file, note), d.file)
      } else if (d.kind === 'erase') {
        eraseAt(d, e.x, e.y)
        if (d.keys.size > 0) store.apply('노트 지우기', removeNotes(s.doc, d.file, d.keys), d.file)
      } else if (d.kind === 'rect') {
        if (d.moved) rectTo(d, e.x, e.y)
      } else {
        moveTo(d, e.x, e.y)
        if (d.dLane === 0 && d.dTick === 0) return
        // 놓을 수 없는 자리면 아무것도 바꾸지 않는다 (원위치)
        const moved = moveNotes(s.doc, d.file, d.keys, d.dTick, d.dLane)
        if (moved && store.apply('노트 이동', moved.doc, d.file)) store.set({ selection: moved.keys })
      }
    },

    onContextMenu(e) {
      // 왼쪽 드래그 중의 우클릭은 무시한다 (한 동작이 기록 두 개로 갈라지지 않게)
      if (drag) return
      const s = store.getState()
      // 녹음 중에는 트랙 키 외의 편집을 모두 끈다 (5.10절)
      if (s.mode === 'recording') return
      const { tm, view, layout } = getGeometry()
      if (xToLane(layout, e.x) === null) {
        const index = markerAtY(s.doc.editorData.markers, view, e.y)
        if (index >= 0) store.apply('마커 삭제', removeMarker(s.doc, index))
        return
      }
      if (s.playing) return
      const file = s.activeChart
      const hit = hitTestNote(chartNotes(file), tm, view, layout, e.x, e.y)
      if (hit) store.apply('노트 삭제', removeNotes(s.doc, file, new Set([noteKey(hit)])), file)
    },

    cancel() {
      const d = drag
      drag = null
      if (d?.kind === 'rect') store.set({ selection: d.before })
    },

    overlay() {
      const d = drag
      if (d?.kind === 'draw') {
        return { preview: [d.preview], previewInvalid: d.invalid, hiddenKeys: NO_KEYS, selectRect: null }
      }
      if (d?.kind === 'move') {
        const hiddenKeys = d.preview.length > 0 ? d.keys : NO_KEYS
        return { preview: d.preview, previewInvalid: d.invalid, hiddenKeys, selectRect: null }
      }
      return {
        preview: NO_NOTES,
        previewInvalid: false,
        hiddenKeys: d?.kind === 'erase' ? d.keys : NO_KEYS,
        selectRect: d?.kind === 'rect' ? d.rect : null
      }
    }
  }
}
