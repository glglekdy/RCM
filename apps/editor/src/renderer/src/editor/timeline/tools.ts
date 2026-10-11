import { noteKey, snapTick, type Note, type TimingMap } from '@rcm/core'
import { markerAtY, removeMarker } from '../commands/markers'
import { addNote, moveNotes, removeNotes, resizedHold, resizeHold, shiftNote } from '../commands/notes'
import { getChart } from '../state/doc'
import type { EditorStore } from '../state/store'
import {
  hitTestNote,
  NOTE_HEIGHT,
  notesInRect,
  onHoldEnd,
  pointerToCell,
  type SelectRect
} from './hitTest'
import { inTrackNameBand, xToLane, yToMs, type TimelineLayout, type TimelineView } from './view'

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
  /** 버튼을 누르지 않은 포인터가 놓인 곳에서 누르면 할 일: 롱노트 길이 조절, 노트 옮기기, 그 밖(null). */
  hoverAction(x: number, y: number): 'resize' | 'move' | null
  /** 화면이 스크롤·확대되었을 때 진행 중인 드래그를 마지막 포인터 위치로 다시 계산한다. */
  refresh(): void
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
/** 지우기 도구의 왼쪽 드래그, 또는 그리기 도구의 오른쪽 드래그(button 2) */
type EraseDrag = { kind: 'erase'; file: string; keys: Set<string>; x: number; y: number; button: number }
type RectDrag = {
  kind: 'rect'
  file: string
  x: number
  /** 시작점의 tick (스냅 전). 화면 y가 아니라 시간에 고정해야 끄는 중 휠로 스크롤해도 시작점이 따라 움직이지 않는다 */
  tick: number
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
  /** 놓은 뒤 옮긴 노트를 선택할지 (선택 도구). 그리기 도구는 기존 선택만 따라 고친다 */
  select: boolean
}
/** 롱노트 끝(위쪽)을 끌어 길이를 바꾼다. 머리 아래로 내리면 tap이 된다 */
type ResizeDrag = {
  kind: 'resize'
  file: string
  /** 잡은 원래 롱노트 */
  note: Note
  endTick: number
  preview: Note[]
  invalid: boolean
}
type Drag = DrawDrag | EraseDrag | RectDrag | MoveDrag | ResizeDrag

const NO_KEYS: ReadonlySet<string> = new Set()
const NO_NOTES: Note[] = []
/** 지우기 드래그에서 이전 위치와 현재 위치 사이를 이 간격(px)으로 훑는다. */
const ERASE_STEP = NOTE_HEIGHT / 2

export function createToolController(
  store: EditorStore,
  getGeometry: () => ToolGeometry
): ToolController {
  let drag: Drag | null = null
  /** 드래그 중 마지막 포인터 위치 (refresh용) */
  let last: ToolPointer | null = null
  /**
   * 오른쪽 드래그 지우기를 끝냈으니 뒤따르는 contextmenu는 무시한다 (같은 노트를 두 번 지우지 않게).
   * Windows는 버튼을 뗀 뒤 contextmenu가 오므로 필요하다. 다음 누름에서 다시 끈다.
   */
  let skipContextMenu = false

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

  /**
   * 그리기 드래그의 현재 노트: 같은 트랙에서 시작 칸보다 위면 hold, 아니면 tap.
   * 끄는 동안 시작 트랙이 사라졌거나 다른 트랙으로 바뀌었으면 null.
   */
  const drawNote = (d: DrawDrag, y: number): Note | null => {
    const { tm, view, layout } = getGeometry()
    const col = layout.columns[d.lane]
    if (!col || col.id !== d.track) return null
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
      // 이름 줄에 가려진 노트는 지우지 않는다
      if (inTrackNameBand(layout, px, py)) continue
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
    const t0 = d.tick
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

  /** 롱노트 끝 드래그: 스냅한 포인터 tick을 끝으로 한 미리보기. 그대로면 미리보기 없음. */
  const resizeTo = (d: ResizeDrag, y: number) => {
    const s = store.getState()
    d.endTick = Math.max(0, snapTick(getGeometry().tm, tickAt(y), s.snap))
    if (d.note.type === 'hold' && d.endTick === d.note.endTick) {
      d.preview = NO_NOTES
      d.invalid = false
      return
    }
    d.preview = [resizedHold(d.note, d.endTick)]
    d.invalid = resizeHold(s.doc, d.file, noteKey(d.note), d.endTick) === null
  }

  /** 잡은 노트의 드래그: 롱노트 끝 손잡이면 길이 조절, 아니면 keys를 옮긴다. */
  const noteDrag = (
    e: ToolPointer,
    file: string,
    hit: Note,
    keys: ReadonlySet<string>,
    select: boolean
  ): Drag => {
    const { tm, view } = getGeometry()
    if (onHoldEnd(hit, tm, view, e.y)) {
      const endTick = hit.type === 'hold' ? hit.endTick : hit.tick
      return { kind: 'resize', file, note: hit, endTick, preview: NO_NOTES, invalid: false }
    }
    return {
      kind: 'move',
      file,
      keys,
      lane: laneAt(e.x),
      tick: snapTick(tm, tickAt(e.y), store.getState().snap),
      dLane: 0,
      dTick: 0,
      preview: NO_NOTES,
      invalid: false,
      select
    }
  }

  /** 선택 도구 누름: Shift+노트는 토글, 롱노트 끝은 길이 조절, 노트는 옮기기, 빈 곳은 사각 선택. */
  const selectDown = (e: ToolPointer, file: string) => {
    const s = store.getState()
    const { tm, view, layout } = getGeometry()
    const hit = hitTestNote(chartNotes(file), tm, view, layout, e.x, e.y)
    if (!hit) {
      const d: RectDrag = {
        kind: 'rect',
        file,
        x: e.x,
        tick: tickAt(e.y),
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
    drag = noteDrag(e, file, hit, store.getState().selection, true)
  }

  const pointerMove = (e: ToolPointer) => {
    const d = drag
    if (!d) return
    last = e
    if (d.kind === 'draw') {
      const note = drawNote(d, e.y)
      if (!note) {
        drag = null
        return
      }
      d.preview = note
      d.invalid = !addNote(store.getState().doc, d.file, note)
    } else if (d.kind === 'erase') {
      eraseAt(d, e.x, e.y)
    } else if (d.kind === 'rect') {
      rectTo(d, e.x, e.y)
    } else if (d.kind === 'resize') {
      resizeTo(d, e.y)
    } else {
      moveTo(d, e.x, e.y)
    }
  }

  return {
    onPointerDown(e) {
      const s = store.getState()
      skipContextMenu = false
      if (s.playing) return
      if (e.button === 2) {
        // 그리기 도구: 오른쪽 버튼을 누른 채 끌면 지나간 노트를 지운다.
        // 트랙 밖(마커)이나 다른 도구의 우클릭은 contextmenu가 처리한다
        const { layout } = getGeometry()
        if (drag || s.tool !== 'draw' || xToLane(layout, e.x) === null) return
        if (inTrackNameBand(layout, e.x, e.y)) return
        last = e
        drag = { kind: 'erase', file: s.activeChart, keys: new Set(), x: e.x, y: e.y, button: 2 }
        eraseAt(drag, e.x, e.y)
        return
      }
      if (e.button !== 0) return
      drag = null
      last = e
      // 트랙 이름 줄에서는 그리기·지우기·선택을 시작하지 않는다 (가려진 노트를 보지 않고 고치게 된다)
      if (inTrackNameBand(getGeometry().layout, e.x, e.y)) return
      const file = s.activeChart
      if (s.tool === 'draw') {
        const { tm, view, layout } = getGeometry()
        // 노트를 잡으면 그 노트 하나만 옮기거나 (롱노트 끝이면) 길이를 바꾼다
        const hit = hitTestNote(chartNotes(file), tm, view, layout, e.x, e.y)
        if (hit) {
          drag = noteDrag(e, file, hit, new Set([noteKey(hit)]), false)
          return
        }
        const cell = pointerToCell(tm, view, layout, e.x, e.y, s.snap)
        if (!cell) return
        const preview: Note = { tick: cell.tick, track: cell.track, type: 'tap' }
        // 이미 노트가 있는 자리에서는 시작하지 않는다 (같은 칸에서 시작하는 hold도 겹친다)
        if (!addNote(s.doc, file, preview)) return
        drag = { kind: 'draw', file, ...cell, preview, invalid: false }
      } else if (s.tool === 'erase') {
        drag = { kind: 'erase', file, keys: new Set(), x: e.x, y: e.y, button: 0 }
        eraseAt(drag, e.x, e.y)
      } else {
        selectDown(e, file)
      }
    },

    onPointerMove: pointerMove,

    hoverAction(x, y) {
      const s = store.getState()
      if (drag || s.playing || (s.tool !== 'draw' && s.tool !== 'select')) return null
      const { tm, view, layout } = getGeometry()
      if (inTrackNameBand(layout, x, y)) return null
      const hit = hitTestNote(chartNotes(s.activeChart), tm, view, layout, x, y)
      if (!hit) return null
      return onHoldEnd(hit, tm, view, y) ? 'resize' : 'move'
    },

    refresh() {
      if (drag && last) pointerMove(last)
    },

    onPointerUp(e) {
      const d = drag
      if (!d) return
      drag = null
      const s = store.getState()
      if (s.playing) return
      if (d.kind === 'draw') {
        const note = drawNote(d, e.y)
        if (note) store.apply('노트 추가', addNote(s.doc, d.file, note), d.file)
      } else if (d.kind === 'erase') {
        if (d.button === 2) skipContextMenu = true
        eraseAt(d, e.x, e.y)
        if (d.keys.size > 0) store.apply('노트 지우기', removeNotes(s.doc, d.file, d.keys), d.file)
      } else if (d.kind === 'rect') {
        if (d.moved) rectTo(d, e.x, e.y)
      } else if (d.kind === 'resize') {
        resizeTo(d, e.y)
        if (d.preview.length === 0) return
        // 놓을 수 없는 길이면 그대로 둔다. 머리는 그대로라 노트 키(선택)도 그대로다
        const resized = resizeHold(s.doc, d.file, noteKey(d.note), d.endTick)
        if (resized) store.apply('롱노트 길이 조절', resized.doc, d.file)
      } else {
        moveTo(d, e.x, e.y)
        if (d.dLane === 0 && d.dTick === 0) return
        // 놓을 수 없는 자리면 아무것도 바꾸지 않는다 (원위치)
        const moved = moveNotes(s.doc, d.file, d.keys, d.dTick, d.dLane)
        if (!moved || !store.apply('노트 이동', moved.doc, d.file)) return
        if (d.select) {
          store.set({ selection: moved.keys })
        } else if ([...d.keys].some((k) => s.selection.has(k))) {
          // 그리기 도구로 옮긴 노트가 선택돼 있었으면 선택도 새 자리로 따라간다
          const selection = new Set([...s.selection].filter((k) => !d.keys.has(k)))
          for (const k of moved.keys) selection.add(k)
          store.set({ selection })
        }
      }
    },

    onContextMenu(e) {
      // 드래그 중의 우클릭은 무시한다 (한 동작이 기록 두 개로 갈라지지 않게).
      // 오른쪽 드래그 지우기가 이미 처리한 우클릭도 무시한다
      if (drag) return
      if (skipContextMenu) {
        skipContextMenu = false
        return
      }
      const s = store.getState()
      // 녹음 중에는 트랙 키 외의 편집을 모두 끈다 (5.10절)
      if (s.mode === 'recording') return
      const { tm, view, layout } = getGeometry()
      if (xToLane(layout, e.x) === null) {
        const index = markerAtY(s.doc.editorData.markers, view, e.y)
        if (index >= 0) store.apply('마커 삭제', removeMarker(s.doc, index))
        return
      }
      if (s.playing || inTrackNameBand(layout, e.x, e.y)) return
      const file = s.activeChart
      const hit = hitTestNote(chartNotes(file), tm, view, layout, e.x, e.y)
      if (hit) store.apply('노트 삭제', removeNotes(s.doc, file, new Set([noteKey(hit)])), file)
    },

    cancel() {
      const d = drag
      drag = null
      if (d?.kind === 'rect') store.set({ selection: d.before })
      // 취소한 오른쪽 드래그 뒤의 contextmenu가 노트를 지우지 않게
      if (d?.kind === 'erase' && d.button === 2) skipContextMenu = true
    },

    overlay() {
      const d = drag
      if (d?.kind === 'draw') {
        return { preview: [d.preview], previewInvalid: d.invalid, hiddenKeys: NO_KEYS, selectRect: null }
      }
      if (d?.kind === 'move' || d?.kind === 'resize') {
        const keys = d.kind === 'move' ? d.keys : new Set([noteKey(d.note)])
        const hiddenKeys = d.preview.length > 0 ? keys : NO_KEYS
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
