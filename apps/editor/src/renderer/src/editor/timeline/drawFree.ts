import {
  freeNoteEndTick,
  freeNoteHead,
  freeNoteKey,
  slideSpanAt,
  type FlickDirection,
  type FreeChart,
  type FreeNote,
  type TimingMap
} from '@rcm/core'
import { FREE_NOTE_COLORS } from '@rcm/playfield'
import type { FreeRect } from './freeHitTest'
import { NOTE_HEIGHT } from './hitTest'
import { msToY, yToMs, type TimelineLayout, type TimelineView } from './view'

export interface FreeDrawParams {
  view: TimelineView
  layout: TimelineLayout
  tm: TimingMap
  chart: FreeChart
  selection: ReadonlySet<string>
  preview: FreeNote[]
  previewInvalid: boolean
  hiddenKeys: ReadonlySet<string>
  selectRect: FreeRect | null
}


const COLORS = {
  selected: '#8b5cf6',
  invalid: '#ef4444',
  selectFill: 'rgba(139, 92, 246, 0.18)',
  selectBorder: '#8b5cf6',
  hidden: '#9ca3af'
}

const NOTE_RADIUS = 3
/** 머리 양옆 여백(px). 이웃 노트와 붙어 보이지 않게 */
const NOTE_INSET = 1
const TRACE_HEIGHT = 6
const MID_POINT_HEIGHT = 6
const BODY_ALPHA = 0.32
const GUIDE_ALPHA = 0.8
const PREVIEW_ALPHA = 0.5
const SELECTED_BORDER = 2
/** 슬라이드 몸통을 이 간격(px)마다 끊어 그린다 */
const BODY_STEP = 4
const ARROW_LENGTH = 14

const crisp = (v: number) => Math.round(v) + 0.5

/** 방향별 단위 벡터 (화면 좌표: y는 아래가 +). */
const DIRECTION_VECTORS: Record<FlickDirection, [number, number]> = {
  up: [0, -1],
  left: [-1, 0],
  right: [1, 0],
  upLeft: [-Math.SQRT1_2, -Math.SQRT1_2],
  upRight: [Math.SQRT1_2, -Math.SQRT1_2]
}

export function drawFreeNotes(ctx: CanvasRenderingContext2D, p: FreeDrawParams): void {
  const { view, tm } = p
  const margin = NOTE_HEIGHT / view.pxPerMs
  const fromTick = tm.msToTick(yToMs(view, view.height) - margin)
  const toTick = tm.msToTick(yToMs(view, 0) + margin)

  for (const note of p.chart.notes) {
    if (freeNoteHead(note).tick > toTick || freeNoteEndTick(note) < fromTick) continue
    const key = freeNoteKey(note)
    if (p.hiddenKeys.has(key)) continue
    drawNote(ctx, p, note, 1, p.selection.has(key), null)
  }
  for (const note of p.preview) {
    drawNote(ctx, p, note, PREVIEW_ALPHA, false, p.previewInvalid ? COLORS.invalid : null)
  }

  const r = p.selectRect
  if (r) {
    const { layout } = p
    const x0 = layout.tracksX + Math.max(0, r.col0) * layout.colPx
    const x1 = layout.tracksX + Math.min(layout.columns.length, r.col1) * layout.colPx
    if (x1 > x0) {
      const yTop = msToY(view, tm.tickToMs(r.tick1))
      const yBottom = msToY(view, tm.tickToMs(r.tick0))
      ctx.fillStyle = COLORS.selectFill
      ctx.fillRect(x0, yTop, x1 - x0, yBottom - yTop)
      ctx.strokeStyle = COLORS.selectBorder
      ctx.lineWidth = 1
      ctx.strokeRect(crisp(x0), crisp(yTop), Math.round(x1 - x0) - 1, Math.round(yBottom - yTop))
    }
  }
}

/** override: 미리보기를 놓을 수 없을 때 모든 부분을 이 색으로 */
function drawNote(
  ctx: CanvasRenderingContext2D,
  p: FreeDrawParams,
  note: FreeNote,
  alpha: number,
  selected: boolean,
  override: string | null
): void {
  const { view, tm, layout } = p
  const xOf = (col: number) => layout.tracksX + col * layout.colPx
  const yOf = (tick: number) => msToY(view, tm.tickToMs(tick))
  ctx.globalAlpha = alpha

  if (note.type !== 'slide') {
    const color = override ?? FREE_NOTE_COLORS[note.type]
    const h = note.type === 'trace' ? TRACE_HEIGHT : NOTE_HEIGHT
    head(ctx, xOf(note.x), xOf(note.x + note.width), yOf(note.tick), h, color, selected)
    if (note.type === 'flick') {
      arrow(ctx, xOf(note.x + note.width / 2), yOf(note.tick) - NOTE_HEIGHT / 2 - 2, note.direction, color)
    }
    ctx.globalAlpha = 1
    return
  }

  const color = override ?? FREE_NOTE_COLORS.slide
  const { points } = note
  const times = points.map((pt) => tm.tickToMs(pt.tick))
  const yHead = msToY(view, times[0])
  const yEnd = msToY(view, times[times.length - 1])
  // 보이는 범위만 끊어 그리되 지점 위치는 꼭 넣어 꺾이는 곳이 뭉개지지 않게 한다
  const top = Math.max(yEnd, -BODY_STEP)
  const bottom = Math.min(yHead, view.height + BODY_STEP)
  if (bottom > top) {
    const ys: number[] = []
    for (let y = bottom; y > top; y -= BODY_STEP) ys.push(y)
    ys.push(top)
    for (const t of times) {
      const y = msToY(view, t)
      if (y > top && y < bottom) ys.push(y)
    }
    ys.sort((a, b) => b - a)
    const spans = ys.map((y) => slideSpanAt(points, times, yToMs(view, y)))
    ctx.beginPath()
    ys.forEach((y, i) => {
      const x = xOf(spans[i].x)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    for (let i = ys.length - 1; i >= 0; i--) ctx.lineTo(xOf(spans[i].x + spans[i].width), ys[i])
    ctx.closePath()
    ctx.globalAlpha = alpha * BODY_ALPHA
    ctx.fillStyle = color
    ctx.fill()
    if (selected) {
      ctx.globalAlpha = alpha
      ctx.strokeStyle = COLORS.selected
      ctx.lineWidth = 1
      ctx.stroke()
    }
    // 가운데 안내선
    ctx.globalAlpha = alpha * GUIDE_ALPHA
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ys.forEach((y, i) => {
      const x = xOf(spans[i].x + spans[i].width / 2)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }

  ctx.globalAlpha = alpha
  const last = points.length - 1
  points.forEach((pt, i) => {
    const x0 = xOf(pt.x)
    const x1 = xOf(pt.x + pt.width)
    const y = yOf(pt.tick)
    if (pt.hidden) {
      // 숨은 지점: 판정이 없으므로 점선 테두리만
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = override ?? COLORS.hidden
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(x0 + NOTE_INSET, y - MID_POINT_HEIGHT / 2, x1 - x0 - NOTE_INSET * 2, MID_POINT_HEIGHT, NOTE_RADIUS)
      ctx.stroke()
      ctx.setLineDash([])
      return
    }
    if (i === last && note.endFlick) {
      const flick = override ?? FREE_NOTE_COLORS.flick
      head(ctx, x0, x1, y, NOTE_HEIGHT, flick, selected)
      arrow(ctx, (x0 + x1) / 2, y - NOTE_HEIGHT / 2 - 2, note.direction, flick)
      return
    }
    head(ctx, x0, x1, y, i === 0 || i === last ? NOTE_HEIGHT : MID_POINT_HEIGHT, color, selected)
  })
  ctx.globalAlpha = 1
}

function head(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  h: number,
  color: string,
  selected: boolean
): void {
  ctx.beginPath()
  ctx.roundRect(x0 + NOTE_INSET, y - h / 2, Math.max(1, x1 - x0 - NOTE_INSET * 2), h, NOTE_RADIUS)
  ctx.fillStyle = color
  ctx.fill()
  if (selected) {
    ctx.strokeStyle = COLORS.selected
    ctx.lineWidth = SELECTED_BORDER
    ctx.stroke()
  }
}

/** 플릭 화살표: 머리 위 (x, y)에서 방향으로. 방향이 없으면(방향 무관) 위쪽 꺾쇠 두 개. */
function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: FlickDirection | undefined, color: string): void {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  if (!dir) {
    ctx.beginPath()
    for (const dy of [0, 6]) {
      ctx.moveTo(x - 6, y - dy)
      ctx.lineTo(x, y - dy - 6)
      ctx.lineTo(x + 6, y - dy)
    }
    ctx.stroke()
    ctx.lineCap = 'butt'
    return
  }
  const [vx, vy] = DIRECTION_VECTORS[dir]
  // 옆 방향은 머리 바로 위 가운데에서 옆으로, 위 방향은 위로 그린다
  const sx = x - (vx * ARROW_LENGTH) / 2
  const sy = vy === 0 ? y - 4 : y
  const ex = sx + vx * ARROW_LENGTH
  const ey = sy + vy * ARROW_LENGTH
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  // 화살촉
  const back = 6
  const side = 5
  const bx = ex - vx * back
  const by = ey - vy * back
  ctx.beginPath()
  ctx.moveTo(ex, ey)
  ctx.lineTo(bx - vy * side, by + vx * side)
  ctx.lineTo(bx + vy * side, by - vx * side)
  ctx.closePath()
  ctx.fill()
  ctx.lineCap = 'butt'
}
