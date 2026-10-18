import { freeNoteKey, snapTick, stepTick, type FlickDirection, type FreeChart, type FreeNote, type SlidePoint } from '@rcm/core'
import { markerAtY, removeMarker } from '../commands/markers'
import {
  addFreeNote,
  addFreeNotes,
  insertSlidePoint,
  moveFreeNotes,
  movedSlidePoint,
  removeFreeNotes,
  removeSlidePoint,
  replaceFreeNote,
  shiftFreeNote,
  simplifySlidePoints,
  withSpan
} from '../commands/freeNotes'
import { getFreeChart, type ProjectDoc } from '../state/doc'
import type { EditorStore } from '../state/store'
import { freeNotesInRect, hitTestFree, pointerTick, type FreeHit, type FreeRect } from './freeHitTest'
import { NOTE_HEIGHT } from './hitTest'
import type { ToolGeometry, ToolPointer } from './tools'
import { inTrackNameBand, xToCol, xToLane, yToMs } from './view'

/** 드래그하는 동안 그림에 얹는 것. */
export interface FreeToolOverlay {
  preview: FreeNote[]
  previewInvalid: boolean
  hiddenKeys: ReadonlySet<string>
  selectRect: FreeRect | null
}

export type FreeHoverAction = 'resize' | 'move' | 'insert' | null

export interface FreeToolController {
  onPointerDown(e: ToolPointer): void
  onPointerMove(e: ToolPointer): void
  onPointerUp(e: ToolPointer): void
  onContextMenu(e: ToolPointer): void
  cancel(): void
  hoverAction(x: number, y: number): FreeHoverAction
  refresh(): void
  overlay(): FreeToolOverlay
}

type Span = { x: number; width: number }

/**
 * 탭·트레이스·플릭 그리기: 클릭은 기억한 폭, 가로로 끌면 걸친 칸 전체.
 * 방향이 있는 플릭은 끈 방향이 플릭 방향이 된다 (폭은 기억한 폭)
 */
type SpanDrag = {
  kind: 'span'
  file: string
  tick: number
  startCell: number
  /** 누른 화면 위치 (플릭 방향을 잰다) */
  x: number
  y: number
  dragged: boolean
  /** 끌어서 정한 플릭 방향 */
  direction: FlickDirection | null
  preview: FreeNote
  invalid: boolean
}
/**
 * 슬라이드 그리기: 시작 칸에서 옆으로 끌면 폭, 위로 끌면 끝 지점을 정한다.
 * ready는 끝 지점이 시작보다 위에 있어 놓을 수 있는 슬라이드인지
 */
type SlideDrag = {
  kind: 'slide'
  file: string
  start: SlidePoint
  startCell: number
  /** 옆으로 끌어 폭을 정했는지 (정했으면 그 폭을 기억한다) */
  sized: boolean
  preview: FreeNote | null
  invalid: boolean
  ready: boolean
}
type EraseDrag = { kind: 'erase'; file: string; keys: Set<string>; x: number; y: number; button: number }
type RectDrag = {
  kind: 'rect'
  file: string
  col: number
  tick: number
  additive: boolean
  before: ReadonlySet<string>
  moved: boolean
  rect: FreeRect | null
}
type MoveDrag = {
  kind: 'move'
  file: string
  keys: ReadonlySet<string>
  col: number
  tick: number
  dx: number
  dTick: number
  preview: FreeNote[]
  invalid: boolean
  select: boolean
}
/** 머리·지점의 한쪽 끝을 끌어 폭을 바꾼다 */
type EdgeDrag = {
  kind: 'edge'
  file: string
  key: string
  note: FreeNote
  point: number
  side: 'left' | 'right'
  preview: FreeNote | null
  invalid: boolean
}
/** 슬라이드 지점 옮기기. 몸통을 눌러 새로 넣은 지점이면 base는 넣은 뒤의 문서다 */
type PointDrag = {
  kind: 'point'
  file: string
  key: string
  base: ProjectDoc
  note: FreeNote
  index: number
  col: number
  tick: number
  inserted: boolean
  preview: FreeNote | null
  invalid: boolean
}
/**
 * 연속 그리기: 끌고 지나간 스냅 tick마다 포인터 칸을 가운데로 한 노트를 깐다 (tick마다 하나, 놓을 수 없는 자리는 건너뜀).
 * 슬라이드면 위로 지나간 tick마다 지점을 이어 슬라이드 하나를 만든다
 */
type BrushDrag = {
  kind: 'brush'
  file: string
  /** 마지막으로 처리한 스냅 tick과 그때의 화면 x */
  tick: number
  x: number
  notes: Map<number, FreeNote>
  points: SlidePoint[]
}
type Drag = BrushDrag | SpanDrag | SlideDrag | EraseDrag | RectDrag | MoveDrag | EdgeDrag | PointDrag

const NO_KEYS: ReadonlySet<string> = new Set()
const ERASE_STEP = NOTE_HEIGHT / 2

/** 칸 cell을 가운데로 한 폭 w의 구간 (칸 안으로 민다). */
export function clickSpan(cell: number, w: number, columns: number): Span {
  const width = Math.min(Math.max(1, Math.round(w)), columns)
  const x = Math.min(Math.max(0, cell - Math.floor((width - 1) / 2)), columns - width)
  return { x, width }
}

/** 플릭 방향을 정하려면 이만큼(px) 끌어야 한다 */
export const FLICK_DRAG_PX = 12

/**
 * 누른 자리에서 (dx, dy)만큼 끈 방향에 가장 가까운 플릭 방향. 덜 끌었거나 거의 아래로 끌었으면 null.
 * 아래쪽으로 비스듬히 끌면 왼쪽·오른쪽으로 본다.
 */
export function dragDirection(dx: number, dy: number): FlickDirection | null {
  if (Math.hypot(dx, dy) < FLICK_DRAG_PX) return null
  if (dy > 0 && Math.abs(dx) < dy) return null
  const angle = (Math.atan2(Math.max(0, -dy), dx) * 180) / Math.PI
  const dirs: FlickDirection[] = ['right', 'upRight', 'up', 'upLeft', 'left']
  return dirs[Math.round(angle / 45)]
}

/** 칸 a부터 b까지(양 끝 포함) 걸친 구간. */
export function dragSpan(a: number, b: number): Span {
  return { x: Math.min(a, b), width: Math.abs(a - b) + 1 }
}

export function createFreeToolController(store: EditorStore, getGeometry: () => ToolGeometry): FreeToolController {
  let drag: Drag | null = null
  let last: ToolPointer | null = null
  let skipContextMenu = false

  const chartOf = (file: string): FreeChart => getFreeChart(store.getState().doc, file)

  const tickAt = (y: number) => {
    const { tm, view } = getGeometry()
    return tm.msToTick(yToMs(view, y))
  }
  const snapped = (y: number) => snapTick(getGeometry().tm, tickAt(y), store.getState().snap)
  const colAt = (x: number) => xToCol(getGeometry().layout, x)
  const cellAt = (x: number, columns: number) => Math.min(columns - 1, Math.max(0, Math.floor(colAt(x))))

  const hitAt = (file: string, x: number, y: number): FreeHit | null => {
    const { tm, view, layout } = getGeometry()
    return hitTestFree(chartOf(file).notes, tm, view, layout, x, y)
  }

  /** 지금 고른 종류(탭·트레이스·플릭)의 노트. direction이 있으면 툴바 방향 대신 쓴다 */
  const makeNote = (chart: FreeChart, tick: number, span: Span, direction?: FlickDirection | null): FreeNote => {
    const { freeType, flickDirection } = store.getState()
    if (freeType === 'flick') {
      return chart.flickMode === 'directional'
        ? { tick, type: 'flick', ...span, direction: direction ?? flickDirection }
        : { tick, type: 'flick', ...span }
    }
    return { tick, type: freeType === 'trace' ? 'trace' : 'tap', ...span }
  }

  /** 옮긴 노트가 선택돼 있었으면 선택도 새 키로 따라간다. */
  const follow = (oldKeys: ReadonlySet<string>, newKeys: ReadonlySet<string>, select: boolean) => {
    const s = store.getState()
    if (select) {
      store.set({ selection: newKeys })
      return
    }
    if (![...oldKeys].some((k) => s.selection.has(k))) return
    const selection = new Set([...s.selection].filter((k) => !oldKeys.has(k)))
    for (const k of newKeys) selection.add(k)
    store.set({ selection })
  }

  const spanTo = (d: SpanDrag, x: number, y: number) => {
    const s = store.getState()
    const chart = chartOf(d.file)
    if (s.freeType === 'flick' && chart.flickMode === 'directional') {
      // 방향 플릭: 끈 방향이 플릭 방향, 폭은 기억한 폭
      d.direction = dragDirection(x - d.x, y - d.y) ?? d.direction
      d.preview = makeNote(chart, d.tick, clickSpan(d.startCell, s.freeWidth, chart.columns), d.direction)
      d.invalid = !addFreeNote(s.doc, d.file, d.preview)
      return
    }
    const cell = cellAt(x, chart.columns)
    d.dragged = d.dragged || cell !== d.startCell
    const span = d.dragged ? dragSpan(d.startCell, cell) : clickSpan(d.startCell, s.freeWidth, chart.columns)
    d.preview = makeNote(chart, d.tick, span)
    d.invalid = !addFreeNote(s.doc, d.file, d.preview)
  }

  const slideTo = (d: SlideDrag, x: number, y: number) => {
    const s = store.getState()
    const chart = chartOf(d.file)
    const end = Math.max(0, snapped(y))
    const cell = cellAt(x, chart.columns)
    if (end <= d.start.tick) {
      // 아직 위로 끌지 않았으면 옆으로 끈 만큼 시작 폭을 정한다
      if (cell !== d.startCell || d.sized) {
        d.sized = true
        d.start = { tick: d.start.tick, ...dragSpan(d.startCell, cell) }
      }
      const head: FreeNote = { tick: d.start.tick, type: 'tap', x: d.start.x, width: d.start.width }
      d.preview = { type: 'slide', points: [d.start, { ...d.start, tick: d.start.tick + 1 }] }
      d.invalid = !addFreeNote(s.doc, d.file, head)
      d.ready = false
      return
    }
    const span = clickSpan(cell, d.start.width, chart.columns)
    d.preview = { type: 'slide', points: [d.start, { tick: end, ...span }] }
    d.invalid = !addFreeNote(s.doc, d.file, d.preview)
    d.ready = true
  }

  const eraseAt = (d: EraseDrag, x: number, y: number) => {
    const { layout } = getGeometry()
    const steps = Math.max(1, Math.ceil(Math.hypot(x - d.x, y - d.y) / ERASE_STEP))
    for (let i = 1; i <= steps; i++) {
      const px = d.x + ((x - d.x) * i) / steps
      const py = d.y + ((y - d.y) * i) / steps
      if (inTrackNameBand(layout, px, py)) continue
      const { tm, view } = getGeometry()
      const notes = chartOf(d.file).notes.filter((n) => !d.keys.has(freeNoteKey(n)))
      const hit = hitTestFree(notes, tm, view, layout, px, py)
      if (hit) d.keys.add(hit.key)
    }
    d.x = x
    d.y = y
  }

  const rectTo = (d: RectDrag, x: number, y: number) => {
    d.moved = true
    const c = colAt(x)
    const t = tickAt(y)
    d.rect = { col0: Math.min(d.col, c), col1: Math.max(d.col, c), tick0: Math.min(d.tick, t), tick1: Math.max(d.tick, t) }
    const picked = freeNotesInRect(chartOf(d.file).notes, d.rect)
    if (d.additive) for (const key of d.before) picked.add(key)
    store.set({ selection: picked })
  }

  const moveTo = (d: MoveDrag, x: number, y: number) => {
    const s = store.getState()
    d.dx = Math.round(colAt(x) - d.col)
    d.dTick = snapped(y) - d.tick
    if (d.dx === 0 && d.dTick === 0) {
      d.preview = []
      d.invalid = false
      return
    }
    d.preview = chartOf(d.file)
      .notes.filter((n) => d.keys.has(freeNoteKey(n)))
      .map((n) => shiftFreeNote(n, d.dTick, d.dx))
    d.invalid = moveFreeNotes(s.doc, d.file, d.keys, d.dTick, d.dx) === null
  }

  const edgeTo = (d: EdgeDrag, x: number) => {
    const s = store.getState()
    const chart = chartOf(d.file)
    const p = d.note.type === 'slide' ? d.note.points[d.point] : d.note
    const col = Math.round(colAt(x))
    let span: Span
    if (d.side === 'left') {
      const right = p.x + p.width
      const left = Math.max(0, Math.min(col, right - 1))
      span = { x: left, width: right - left }
    } else {
      const right = Math.min(chart.columns, Math.max(col, p.x + 1))
      span = { x: p.x, width: right - p.x }
    }
    if (span.x === p.x && span.width === p.width) {
      d.preview = null
      d.invalid = false
      return
    }
    d.preview = withSpan(d.note, span.x, span.width, d.point)
    d.invalid = replaceFreeNote(s.doc, d.file, d.key, d.preview) === null
  }

  const pointTo = (d: PointDrag, x: number, y: number) => {
    if (d.note.type !== 'slide') return
    const p = d.note.points[d.index]
    const dTick = snapped(y) - d.tick
    const dx = Math.round(colAt(x) - d.col)
    if (dTick === 0 && dx === 0) {
      // 새로 넣은 지점은 움직이지 않아도 미리보기로 보인다
      d.preview = d.inserted ? d.note : null
      d.invalid = false
      return
    }
    d.preview = movedSlidePoint(d.note, d.index, p.tick + dTick, p.x + dx)
    d.invalid = replaceFreeNote(d.base, d.file, d.key, d.preview) === null
  }

  /** 잡은 노트 조각의 드래그: 끝은 폭, 슬라이드 지점은 지점 이동, 그 밖은 keys를 옮긴다. */
  const noteDrag = (e: ToolPointer, file: string, hit: FreeHit, keys: ReadonlySet<string>, select: boolean): Drag | null => {
    const s = store.getState()
    if (hit.part === 'point' && hit.edge) {
      return { kind: 'edge', file, key: hit.key, note: hit.note, point: hit.point, side: hit.edge, preview: null, invalid: false }
    }
    const tick = snapped(e.y)
    if (hit.note.type === 'slide' && hit.part === 'point' && hit.point > 0) {
      return {
        kind: 'point',
        file,
        key: hit.key,
        base: s.doc,
        note: hit.note,
        index: hit.point,
        col: colAt(e.x),
        tick,
        inserted: false,
        preview: null,
        invalid: false
      }
    }
    if (hit.note.type === 'slide' && hit.part === 'body' && s.freeType === 'slide' && s.tool === 'draw') {
      const at = pointerTick(getGeometry().tm, getGeometry().view, e.y, s.snap)
      const { tm } = getGeometry()
      const ins = at === null ? null : insertSlidePoint(s.doc, file, hit.key, at, (t) => tm.tickToMs(t))
      if (!ins) return null
      const note = getFreeChart(ins.doc, file).notes.find((n) => freeNoteKey(n) === hit.key)
      if (!note) return null
      return {
        kind: 'point',
        file,
        key: hit.key,
        base: ins.doc,
        note,
        index: ins.index,
        col: colAt(e.x),
        tick,
        inserted: true,
        preview: note,
        invalid: false
      }
    }
    return { kind: 'move', file, keys, col: colAt(e.x), tick, dx: 0, dTick: 0, preview: [], invalid: false, select }
  }

  const selectDown = (e: ToolPointer, file: string) => {
    const s = store.getState()
    const hit = hitAt(file, e.x, e.y)
    if (!hit) {
      drag = {
        kind: 'rect',
        file,
        col: colAt(e.x),
        tick: tickAt(e.y),
        additive: e.shift,
        before: s.selection,
        moved: false,
        rect: null
      }
      store.set({ selection: e.shift ? s.selection : new Set() })
      return
    }
    if (e.shift) {
      const selection = new Set(s.selection)
      if (!selection.delete(hit.key)) selection.add(hit.key)
      store.set({ selection })
      return
    }
    if (!s.selection.has(hit.key)) store.set({ selection: new Set([hit.key]) })
    drag = noteDrag(e, file, hit, store.getState().selection, true)
  }

  /** 연속 그리기: tick에 화면 x 위치의 노트(또는 슬라이드 지점)를 놓아 본다 */
  const brushAt = (d: BrushDrag, tick: number, x: number) => {
    const s = store.getState()
    const chart = chartOf(d.file)
    const span = clickSpan(cellAt(x, chart.columns), s.freeWidth, chart.columns)
    if (s.freeType === 'slide') {
      const last = d.points[d.points.length - 1]
      // 슬라이드는 위(미래)로만 이어 간다
      if (last && tick <= last.tick) return
      const point = { tick, ...span }
      if (!last && !addFreeNote(s.doc, d.file, { tick, type: 'tap', ...span })) return
      d.points.push(point)
      return
    }
    if (d.notes.has(tick)) return
    const note = makeNote(chart, tick, span)
    if (addFreeNote(s.doc, d.file, note)) d.notes.set(tick, note)
  }

  /** 지난 위치에서 지금 위치까지 지나간 스냅 tick을 모두 처리한다 */
  const brushTo = (d: BrushDrag, x: number, y: number) => {
    const s = store.getState()
    const { tm } = getGeometry()
    const target = Math.max(0, snapped(y))
    if (target === d.tick) return
    const dir = target > d.tick ? 1 : -1
    const from = d.tick
    let t = d.tick
    while (t !== target) {
      const next = stepTick(tm, t, s.snap, dir)
      // 격자가 더 나아가지 않거나 목표를 지나치면 목표에서 멈춘다
      t = next === t || (dir === 1 ? next > target : next < target) ? target : next
      brushAt(d, t, d.x + ((x - d.x) * (t - from)) / (target - from))
    }
    d.tick = target
    d.x = x
  }

  const brushNotes = (d: BrushDrag): FreeNote[] => {
    if (store.getState().freeType !== 'slide') return [...d.notes.values()]
    if (d.points.length >= 2) return [{ type: 'slide', points: d.points }]
    // 아직 지점이 하나면 머리만 보이게
    const p = d.points[0]
    return p ? [{ type: 'slide', points: [p, { ...p, tick: p.tick + 1 }] }] : []
  }

  const update = (d: Drag, e: ToolPointer) => {
    if (d.kind === 'brush') brushTo(d, e.x, e.y)
    else if (d.kind === 'span') spanTo(d, e.x, e.y)
    else if (d.kind === 'slide') slideTo(d, e.x, e.y)
    else if (d.kind === 'erase') eraseAt(d, e.x, e.y)
    else if (d.kind === 'rect') rectTo(d, e.x, e.y)
    else if (d.kind === 'move') moveTo(d, e.x, e.y)
    else if (d.kind === 'edge') edgeTo(d, e.x)
    else pointTo(d, e.x, e.y)
  }

  const pointerMove = (e: ToolPointer) => {
    if (!drag) return
    last = e
    update(drag, e)
  }

  const inField = (x: number) => xToLane(getGeometry().layout, x) !== null

  return {
    onPointerDown(e) {
      const s = store.getState()
      skipContextMenu = false
      if (s.playing) return
      const { layout } = getGeometry()
      if (e.button === 2) {
        if (drag || (s.tool !== 'draw' && s.tool !== 'brush') || !inField(e.x) || inTrackNameBand(layout, e.x, e.y)) return
        last = e
        drag = { kind: 'erase', file: s.activeChart, keys: new Set(), x: e.x, y: e.y, button: 2 }
        eraseAt(drag, e.x, e.y)
        return
      }
      if (e.button !== 0) return
      drag = null
      last = e
      if (inTrackNameBand(layout, e.x, e.y)) return
      const file = s.activeChart
      if (s.tool === 'erase') {
        drag = { kind: 'erase', file, keys: new Set(), x: e.x, y: e.y, button: 0 }
        eraseAt(drag, e.x, e.y)
        return
      }
      if (s.tool === 'select') {
        selectDown(e, file)
        return
      }
      if (s.tool === 'brush') {
        // 노트 위에서 시작해도 된다 (놓을 수 없는 자리는 건너뛴다)
        const start = pointerTick(getGeometry().tm, getGeometry().view, e.y, s.snap)
        if (start === null || !inField(e.x)) return
        const d: BrushDrag = { kind: 'brush', file, tick: start, x: e.x, notes: new Map(), points: [] }
        brushAt(d, start, e.x)
        drag = d
        return
      }
      const hit = hitAt(file, e.x, e.y)
      if (hit) {
        drag = noteDrag(e, file, hit, new Set([hit.key]), false)
        return
      }
      if (!inField(e.x)) return
      const tick = pointerTick(getGeometry().tm, getGeometry().view, e.y, s.snap)
      if (tick === null) return
      const chart = chartOf(file)
      const startCell = cellAt(e.x, chart.columns)
      if (s.freeType === 'slide') {
        const start = { tick, ...clickSpan(startCell, s.freeWidth, chart.columns) }
        // 시작 자리에 이미 노트가 있으면 시작하지 않는다
        if (!addFreeNote(s.doc, file, { tick, type: 'tap', x: start.x, width: start.width })) return
        drag = { kind: 'slide', file, start, startCell, sized: false, preview: null, invalid: false, ready: false }
        return
      }
      const d: SpanDrag = {
        kind: 'span',
        file,
        tick,
        startCell,
        x: e.x,
        y: e.y,
        dragged: false,
        direction: null,
        preview: makeNote(chart, tick, clickSpan(startCell, s.freeWidth, chart.columns)),
        invalid: false
      }
      d.invalid = !addFreeNote(s.doc, file, d.preview)
      drag = d
    },

    onPointerMove: pointerMove,

    hoverAction(x, y) {
      const s = store.getState()
      if (drag || s.playing || (s.tool !== 'draw' && s.tool !== 'select')) return null
      const { layout } = getGeometry()
      if (inTrackNameBand(layout, x, y)) return null
      const hit = hitAt(s.activeChart, x, y)
      if (!hit) return null
      if (hit.part === 'point' && hit.edge) return 'resize'
      if (hit.part === 'body' && s.tool === 'draw' && s.freeType === 'slide') return 'insert'
      return 'move'
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
      // 움직이지 않은 선택 클릭은 사각형을 만들지 않는다
      if (d.kind !== 'rect' || d.moved) update(d, e)
      if (d.kind === 'brush') {
        const { tm } = getGeometry()
        if (s.freeType === 'slide') {
          if (d.points.length < 2) return
          // 손으로 그린 경로의 꺾이는 곳은 판정 없이 경로만 꺾는 숨은 지점으로 둔다 (채보 탭에서 바꿀 수 있다)
          const points = simplifySlidePoints(d.points, (t) => tm.tickToMs(t)).map((p, i, all) =>
            i > 0 && i < all.length - 1 ? { ...p, hidden: true } : p
          )
          store.apply('슬라이드 추가', addFreeNote(s.doc, d.file, { type: 'slide', points }), d.file)
        } else {
          store.apply('노트 연속 추가', addFreeNotes(s.doc, d.file, [...d.notes.values()]), d.file)
        }
      } else if (d.kind === 'span') {
        if (d.invalid) return
        if (!store.apply('노트 추가', addFreeNote(s.doc, d.file, d.preview), d.file)) return
        if (d.dragged) store.set({ freeWidth: freeWidthOf(d.preview) })
        // 끌어서 정한 플릭 방향은 다음 플릭의 기본 방향이 된다
        if (d.direction) store.set({ flickDirection: d.direction })
      } else if (d.kind === 'slide') {
        if (!d.ready || !d.preview || d.invalid) return
        if (store.apply('슬라이드 추가', addFreeNote(s.doc, d.file, d.preview), d.file) && d.sized) {
          store.set({ freeWidth: d.start.width })
        }
      } else if (d.kind === 'erase') {
        if (d.button === 2) skipContextMenu = true
        if (d.keys.size > 0) store.apply('노트 지우기', removeFreeNotes(s.doc, d.file, d.keys), d.file)
      } else if (d.kind === 'move') {
        if (d.dx === 0 && d.dTick === 0) return
        const moved = moveFreeNotes(s.doc, d.file, d.keys, d.dTick, d.dx)
        if (moved && store.apply('노트 이동', moved.doc, d.file)) follow(d.keys, moved.keys, d.select)
      } else if (d.kind === 'edge') {
        if (!d.preview) return
        const r = replaceFreeNote(s.doc, d.file, d.key, d.preview)
        if (r && store.apply('노트 폭 조절', r.doc, d.file)) follow(new Set([d.key]), r.keys, false)
      } else if (d.kind === 'point') {
        const r = d.preview && !d.invalid ? replaceFreeNote(d.base, d.file, d.key, d.preview) : null
        const label = d.inserted ? '슬라이드 지점 추가' : '슬라이드 지점 이동'
        // 놓을 수 없는 자리면 새로 넣은 지점은 넣은 자리에 남기고, 옮기던 지점은 원위치
        if (r) {
          if (store.apply(label, r.doc, d.file)) follow(new Set([d.key]), r.keys, false)
        } else if (d.inserted) {
          store.apply(label, d.base, d.file)
        }
      }
    },

    onContextMenu(e) {
      if (drag) return
      if (skipContextMenu) {
        skipContextMenu = false
        return
      }
      const s = store.getState()
      if (s.mode === 'recording') return
      const { view, layout } = getGeometry()
      if (!inField(e.x)) {
        const index = markerAtY(s.doc.editorData.markers, view, e.y)
        if (index >= 0) store.apply('마커 삭제', removeMarker(s.doc, index))
        return
      }
      if (s.playing || inTrackNameBand(layout, e.x, e.y)) return
      const file = s.activeChart
      const hit = hitAt(file, e.x, e.y)
      if (!hit) return
      const n = hit.note
      // 슬라이드 중간 지점은 지점만 지운다
      if (n.type === 'slide' && hit.part === 'point' && hit.point > 0 && hit.point < n.points.length - 1) {
        const r = removeSlidePoint(s.doc, file, hit.key, hit.point)
        if (r) store.apply('슬라이드 지점 삭제', r.doc, file)
        return
      }
      store.apply('노트 삭제', removeFreeNotes(s.doc, file, new Set([hit.key])), file)
    },

    cancel() {
      const d = drag
      drag = null
      if (d?.kind === 'rect') store.set({ selection: d.before })
      if (d?.kind === 'erase' && d.button === 2) skipContextMenu = true
    },

    overlay() {
      const d = drag
      const none: FreeToolOverlay = { preview: [], previewInvalid: false, hiddenKeys: NO_KEYS, selectRect: null }
      if (!d) return none
      switch (d.kind) {
        case 'brush':
          return { ...none, preview: brushNotes(d) }
        case 'span':
          return { ...none, preview: [d.preview], previewInvalid: d.invalid }
        case 'slide':
          return d.preview ? { ...none, preview: [d.preview], previewInvalid: d.invalid } : none
        case 'erase':
          return { ...none, hiddenKeys: d.keys }
        case 'rect':
          return { ...none, selectRect: d.rect }
        case 'move':
          return d.preview.length > 0
            ? { ...none, preview: d.preview, previewInvalid: d.invalid, hiddenKeys: d.keys }
            : none
        case 'edge':
        case 'point':
          return d.preview
            ? { ...none, preview: [d.preview], previewInvalid: d.invalid, hiddenKeys: new Set([d.key]) }
            : none
      }
    }
  }
}

function freeWidthOf(n: FreeNote): number {
  return n.type === 'slide' ? n.points[0].width : n.width
}
