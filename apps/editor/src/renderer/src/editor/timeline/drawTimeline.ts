import type { Chart, Marker, Note, SnapDivision, TimingMap, TimingPoint } from '@rcm/core'
import { msToY, yToMs, type TimelineLayout, type TimelineView } from './view'

export interface DrawParams {
  view: TimelineView
  layout: TimelineLayout
  tm: TimingMap
  chart: Chart
  snap: SnapDivision
  selection: ReadonlySet<string>
  markers: Marker[]
  timing: TimingPoint[]
  durationMs: number
  preview?: Note | null
  selectRect?: { lane0: number; lane1: number; tick0: number; tick1: number } | null
}

/** 스펙 6.3절 타임라인 색 */
const COLORS = {
  laneBg: '#161616',
  laneDivider: '#2a2a2a',
  measure: '#5a5a5a',
  beat: '#3a3a3a',
  snap: '#262626',
  note: '#f2f2f2',
  bpm: '#f59e0b',
  bpmChip: 'rgba(245, 158, 11, 0.16)',
  playhead: '#8b5cf6'
}

const NOTE_HEIGHT = 10
const NOTE_RADIUS = 3
const NOTE_INSET = 4
const HOLD_BODY_INSET = 8
const HOLD_BODY_ALPHA = 0.6
const CHIP_HEIGHT = 20
const FONT = '500 12px "Pretendard Variable", Pretendard, system-ui, sans-serif'

/** 1px 선이 픽셀 경계에 걸쳐 흐려지지 않도록 반 픽셀에 맞춘다. */
const crisp = (v: number) => Math.round(v) + 0.5

export function drawTimeline(ctx: CanvasRenderingContext2D, p: DrawParams): void {
  const { view, layout, tm } = p
  const left = layout.lanesX
  const right = layout.lanesX + layout.lanes * layout.laneWidth
  const h = view.height

  // 레인 바탕·구분선
  ctx.fillStyle = COLORS.laneBg
  ctx.fillRect(left, 0, right - left, h)
  ctx.strokeStyle = COLORS.laneDivider
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i <= layout.lanes; i++) {
    const x = crisp(left + i * layout.laneWidth)
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
  }
  ctx.stroke()

  // 보이는 범위 (노트 높이만큼 여유)
  const margin = NOTE_HEIGHT / view.pxPerMs
  const fromMs = yToMs(view, h) - margin
  const toMs = yToMs(view, 0) + margin
  const fromTick = tm.msToTick(fromMs)
  const toTick = tm.msToTick(Math.min(toMs, p.durationMs))

  // 격자: 스냅 → 박 → 마디 순으로 겹쳐 그린다
  if (toTick >= fromTick) {
    const lines = tm.gridLines(Math.ceil(fromTick), Math.floor(toTick), p.snap)
    for (const kind of ['snap', 'beat', 'measure'] as const) {
      const width = kind === 'measure' ? 2 : 1
      ctx.strokeStyle = COLORS[kind]
      ctx.lineWidth = width
      ctx.beginPath()
      for (const line of lines) {
        if (line.kind !== kind) continue
        const y = msToY(view, tm.tickToMs(line.tick))
        const yy = width === 1 ? crisp(y) : Math.round(y)
        ctx.moveTo(left, yy)
        ctx.lineTo(right, yy)
      }
      ctx.stroke()
    }
  }

  // BPM 변경 지점: 주황 선 + 라벨 칩
  ctx.font = FONT
  ctx.textBaseline = 'middle'
  for (const point of p.timing) {
    const y = Math.round(msToY(view, tm.tickToMs(point.tick)))
    if (y < -CHIP_HEIGHT || y > h + CHIP_HEIGHT) continue
    ctx.strokeStyle = COLORS.bpm
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(right + 4, y)
    ctx.stroke()

    const text = `${formatBpm(point.bpm)} BPM`
    const w = Math.ceil(ctx.measureText(text).width) + 16
    ctx.fillStyle = COLORS.bpmChip
    ctx.beginPath()
    ctx.roundRect(layout.labelX, y - CHIP_HEIGHT / 2, w, CHIP_HEIGHT, 6)
    ctx.fill()
    ctx.fillStyle = COLORS.bpm
    ctx.fillText(text, layout.labelX + 8, y + 0.5)
  }

  // 노트
  for (const note of p.chart.notes) {
    const endTick = note.type === 'hold' ? note.endTick : note.tick
    if (note.tick > toTick || endTick < fromTick) continue
    drawNote(ctx, p, note)
  }

  // 재생선
  const py = Math.round(msToY(view, view.playheadMs))
  ctx.strokeStyle = COLORS.playhead
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(layout.waveX, py)
  ctx.lineTo(right, py)
  ctx.stroke()
}

function drawNote(ctx: CanvasRenderingContext2D, p: DrawParams, note: Note): void {
  const { view, layout, tm } = p
  const x = layout.lanesX + note.lane * layout.laneWidth
  const y = msToY(view, tm.tickToMs(note.tick))
  ctx.fillStyle = COLORS.note

  if (note.type === 'hold') {
    const yEnd = msToY(view, tm.tickToMs(note.endTick))
    ctx.globalAlpha = HOLD_BODY_ALPHA
    ctx.beginPath()
    ctx.roundRect(
      x + HOLD_BODY_INSET,
      yEnd - NOTE_HEIGHT / 2,
      layout.laneWidth - HOLD_BODY_INSET * 2,
      y - yEnd + NOTE_HEIGHT / 2,
      NOTE_RADIUS
    )
    ctx.fill()
    ctx.globalAlpha = 1
  }

  ctx.beginPath()
  ctx.roundRect(
    x + NOTE_INSET,
    y - NOTE_HEIGHT / 2,
    layout.laneWidth - NOTE_INSET * 2,
    NOTE_HEIGHT,
    NOTE_RADIUS
  )
  ctx.fill()
}

function formatBpm(bpm: number): string {
  return String(Math.round(bpm * 100) / 100)
}
