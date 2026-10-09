import {
  noteKey,
  type Chart,
  type Marker,
  type Note,
  type SnapDivision,
  type TimingMap,
  type TimingPoint
} from '@rcm/core'
import { peakInRange, type WaveformPeaks } from '../audio/waveform'
import { NOTE_HEIGHT, type SelectRect } from './hitTest'
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
  /** 오디오 피크. 계산이 끝나기 전에는 없다 */
  peaks?: WaveformPeaks
  /** 그리는 중이거나 옮기는 중인 노트 */
  preview?: Note[]
  /** preview를 놓을 수 없는 자리면 경고색으로 그린다 */
  previewInvalid?: boolean
  /** 지우거나 옮기는 중이라 숨기는 노트 키 */
  hiddenKeys?: ReadonlySet<string>
  selectRect?: SelectRect | null
  /** 녹음 중: 눌린 레인(→ 누른 시각 ms)과 레인별 키 이름 */
  recording?: { pressed: ReadonlyMap<number, number>; labels: string[] }
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
  marker: '#22d3ee',
  wavePast: '#555555',
  waveFuture: '#3a3a3a',
  playhead: '#8b5cf6',
  selected: '#8b5cf6',
  invalid: '#ef4444',
  selectFill: 'rgba(139, 92, 246, 0.18)',
  selectBorder: '#8b5cf6',
  pressed: 'rgba(139, 92, 246, 0.25)',
  keyChip: '#232323',
  keyChipPressed: '#8b5cf6',
  keyLabel: '#8c8c8c',
  keyLabelPressed: '#f2f2f2'
}

const NOTE_RADIUS = 3
const NOTE_INSET = 4
const HOLD_BODY_INSET = 8
const HOLD_BODY_ALPHA = 0.6
const PREVIEW_ALPHA = 0.5
const SELECTED_BORDER = 2
const CHIP_HEIGHT = 20
/** 녹음 중 레인 키 이름 칩: 아래 가장자리에서 띄운 거리와 크기 */
const KEY_CHIP_BOTTOM = 8
const KEY_CHIP_HEIGHT = 20
const KEY_CHIP_INSET = 4
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

  // 녹음 중 눌린 레인: 레인 전체 높이를 강조
  if (p.recording) {
    ctx.fillStyle = COLORS.pressed
    for (const lane of p.recording.pressed.keys()) {
      ctx.fillRect(left + lane * layout.laneWidth, 0, layout.laneWidth, h)
    }
  }

  // 보이는 범위 (노트 높이만큼 여유)
  const margin = NOTE_HEIGHT / view.pxPerMs
  const fromMs = yToMs(view, h) - margin
  const toMs = yToMs(view, 0) + margin
  const fromTick = tm.msToTick(fromMs)
  const toTick = tm.msToTick(Math.min(toMs, p.durationMs))

  // 파형: 격자선이 위에 보이도록 먼저 그린다
  if (p.peaks) drawWaveform(ctx, p, p.peaks)

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

  // 가이드 마커: 청록 점선 (레인 + 파형 영역)
  ctx.strokeStyle = COLORS.marker
  ctx.lineWidth = 1
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  for (const marker of p.markers) {
    const y = msToY(view, marker.ms)
    if (y < -1 || y > h + 1) continue
    ctx.moveTo(layout.waveX, crisp(y))
    ctx.lineTo(right, crisp(y))
  }
  ctx.stroke()
  ctx.setLineDash([])

  // 노트
  for (const note of p.chart.notes) {
    const endTick = note.type === 'hold' ? note.endTick : note.tick
    if (note.tick > toTick || endTick < fromTick) continue
    const key = noteKey(note)
    if (p.hiddenKeys?.has(key)) continue
    drawNote(ctx, p, note, COLORS.note, 1, p.selection.has(key))
  }
  const previewColor = p.previewInvalid ? COLORS.invalid : COLORS.note
  for (const note of p.preview ?? []) drawNote(ctx, p, note, previewColor, PREVIEW_ALPHA, false)
  if (p.recording) drawRecording(ctx, p, p.recording)

  // 사각 선택 범위: 걸친 레인 전체 폭
  if (p.selectRect) {
    const r = p.selectRect
    const x0 = left + r.lane0 * layout.laneWidth
    const x1 = left + (r.lane1 + 1) * layout.laneWidth
    const yTop = msToY(view, tm.tickToMs(r.tick1))
    const yBottom = msToY(view, tm.tickToMs(r.tick0))
    ctx.fillStyle = COLORS.selectFill
    ctx.fillRect(x0, yTop, x1 - x0, yBottom - yTop)
    ctx.strokeStyle = COLORS.selectBorder
    ctx.lineWidth = 1
    ctx.strokeRect(crisp(x0), crisp(yTop), Math.round(x1 - x0) - 1, Math.round(yBottom - yTop))
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

/** 녹음 중: 누르고 있는 키를 누른 시각부터 재생선까지 반투명 막대로, 레인 아래에 키 이름을 그린다. */
function drawRecording(
  ctx: CanvasRenderingContext2D,
  p: DrawParams,
  rec: NonNullable<DrawParams['recording']>
): void {
  const { view, layout } = p
  const py = msToY(view, view.playheadMs)
  ctx.fillStyle = COLORS.note
  ctx.globalAlpha = PREVIEW_ALPHA
  for (const [lane, downMs] of rec.pressed) {
    const y = msToY(view, downMs)
    ctx.beginPath()
    ctx.roundRect(
      layout.lanesX + lane * layout.laneWidth + HOLD_BODY_INSET,
      py,
      layout.laneWidth - HOLD_BODY_INSET * 2,
      Math.max(y - py, 1),
      NOTE_RADIUS
    )
    ctx.fill()
  }
  ctx.globalAlpha = 1

  ctx.font = FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const chipY = view.height - KEY_CHIP_BOTTOM - KEY_CHIP_HEIGHT
  rec.labels.forEach((label, lane) => {
    const pressed = rec.pressed.has(lane)
    const x = layout.lanesX + lane * layout.laneWidth
    ctx.fillStyle = pressed ? COLORS.keyChipPressed : COLORS.keyChip
    ctx.beginPath()
    ctx.roundRect(
      x + KEY_CHIP_INSET,
      chipY,
      layout.laneWidth - KEY_CHIP_INSET * 2,
      KEY_CHIP_HEIGHT,
      NOTE_RADIUS
    )
    ctx.fill()
    ctx.fillStyle = pressed ? COLORS.keyLabelPressed : COLORS.keyLabel
    ctx.fillText(label, x + layout.laneWidth / 2, chipY + KEY_CHIP_HEIGHT / 2 + 0.5)
  })
  ctx.textAlign = 'start'
}

/** 화면 1px 행마다 그 행이 덮는 시간의 피크를 띠 가운데 기준 좌우 대칭 막대로 그린다. */
function drawWaveform(ctx: CanvasRenderingContext2D, p: DrawParams, peaks: WaveformPeaks): void {
  const { view, layout } = p
  const half = layout.waveWidth / 2
  const cx = layout.waveX + half
  const playheadY = msToY(view, view.playheadMs)
  for (let y = 0; y < view.height; y++) {
    // 시간은 위로 흐르므로 행의 위쪽 가장자리가 더 늦은 시각이다
    const toMs = yToMs(view, y)
    const fromMs = yToMs(view, y + 1)
    if (toMs < 0 || fromMs > p.durationMs) continue
    const amp = peakInRange(peaks, fromMs, toMs)
    if (amp <= 0) continue
    const w = Math.max(1, Math.round(Math.min(1, amp) * half))
    ctx.fillStyle = y + 0.5 >= playheadY ? COLORS.wavePast : COLORS.waveFuture
    ctx.fillRect(cx - w, y, w * 2, 1)
  }
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  p: DrawParams,
  note: Note,
  color: string,
  alpha: number,
  selected: boolean
): void {
  const { view, layout, tm } = p
  const x = layout.lanesX + note.lane * layout.laneWidth
  const y = msToY(view, tm.tickToMs(note.tick))
  ctx.fillStyle = color
  ctx.strokeStyle = COLORS.selected
  ctx.lineWidth = SELECTED_BORDER
  ctx.globalAlpha = alpha

  if (note.type === 'hold') {
    const yEnd = msToY(view, tm.tickToMs(note.endTick))
    ctx.globalAlpha = HOLD_BODY_ALPHA * alpha
    ctx.beginPath()
    ctx.roundRect(
      x + HOLD_BODY_INSET,
      yEnd - NOTE_HEIGHT / 2,
      layout.laneWidth - HOLD_BODY_INSET * 2,
      y - yEnd + NOTE_HEIGHT / 2,
      NOTE_RADIUS
    )
    ctx.fill()
    ctx.globalAlpha = alpha
    if (selected) ctx.stroke()
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
  if (selected) ctx.stroke()
  ctx.globalAlpha = 1
}

function formatBpm(bpm: number): string {
  return String(Math.round(bpm * 100) / 100)
}
