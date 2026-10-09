import { noteKey, type Note, type TimingMap } from '@rcm/core'
import { markerAtY, removeMarker } from '../commands/markers'
import { addNote, removeNotes } from '../commands/notes'
import { getChart } from '../state/doc'
import type { EditorStore } from '../state/store'
import { hitTestNote, NOTE_HEIGHT, pointerToCell } from './hitTest'
import { xToLane, type TimelineLayout, type TimelineView } from './view'

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
}

/** 드래그하는 동안 그림에 얹는 것: 그리는 중인 노트, 지우는 중이라 숨길 노트. */
export interface ToolOverlay {
  preview: Note | null
  hiddenKeys: ReadonlySet<string>
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

type Drag =
  | { kind: 'draw'; file: string; lane: number; tick: number; preview: Note }
  | { kind: 'erase'; file: string; keys: Set<string>; x: number; y: number }

const NO_KEYS: ReadonlySet<string> = new Set()
/** 지우기 드래그에서 이전 위치와 현재 위치 사이를 이 간격(px)으로 훑는다. */
const ERASE_STEP = NOTE_HEIGHT / 2

export function createToolController(
  store: EditorStore,
  getGeometry: () => ToolGeometry
): ToolController {
  let drag: Drag | null = null

  const chartNotes = (file: string) => getChart(store.getState().doc, file).notes

  /** 그리기 드래그의 현재 노트: 같은 레인에서 시작 칸보다 위면 hold, 아니면 tap. */
  const drawNote = (lane: number, tick: number, y: number): Note => {
    const { tm, view, layout } = getGeometry()
    const laneX = layout.lanesX + (lane + 0.5) * layout.laneWidth
    const end = pointerToCell(tm, view, layout, laneX, y, store.getState().snap)
    return end && end.tick > tick
      ? { tick, lane, type: 'hold', endTick: end.tick }
      : { tick, lane, type: 'tap' }
  }

  const eraseAt = (d: Extract<Drag, { kind: 'erase' }>, x: number, y: number) => {
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
        const preview: Note = { tick: cell.tick, lane: cell.lane, type: 'tap' }
        // 이미 노트가 있는 자리에서는 시작하지 않는다 (같은 칸에서 시작하는 hold도 겹친다)
        if (!addNote(s.doc, file, preview)) return
        drag = { kind: 'draw', file, ...cell, preview }
      } else if (s.tool === 'erase') {
        drag = { kind: 'erase', file, keys: new Set(), x: e.x, y: e.y }
        eraseAt(drag, e.x, e.y)
      }
    },

    onPointerMove(e) {
      if (!drag) return
      if (drag.kind === 'draw') drag.preview = drawNote(drag.lane, drag.tick, e.y)
      else eraseAt(drag, e.x, e.y)
    },

    onPointerUp(e) {
      const d = drag
      if (!d) return
      drag = null
      const s = store.getState()
      if (s.playing) return
      if (d.kind === 'draw') {
        const note = drawNote(d.lane, d.tick, e.y)
        store.apply('노트 추가', addNote(s.doc, d.file, note), d.file)
      } else {
        eraseAt(d, e.x, e.y)
        if (d.keys.size > 0) store.apply('노트 지우기', removeNotes(s.doc, d.file, d.keys), d.file)
      }
    },

    onContextMenu(e) {
      const s = store.getState()
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
      drag = null
    },

    overlay() {
      return {
        preview: drag?.kind === 'draw' ? drag.preview : null,
        hiddenKeys: drag?.kind === 'erase' ? drag.keys : NO_KEYS
      }
    }
  }
}
