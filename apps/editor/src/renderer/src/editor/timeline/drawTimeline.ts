import {
  noteKey,
  type Chart,
  type Marker,
  type Note,
  type ScrollMap,
  type SnapDivision,
  type TimingMap,
  type TimingPoint
} from '@rcm/core'
import { peakInRange, type WaveformPeaks } from '../audio/waveform'
import { NOTE_HEIGHT, type SelectRect } from './hitTest'
import {
  SPEED_GRAPH_WIDTH,
  TRACK_NAME_HEIGHT,
  laneSpan,
  msToY,
  speedLabel,
  yToMs,
  type TimelineColumn,
  type TimelineLayout,
  type TimelineView
} from './view'

export interface DrawParams {
  view: TimelineView
  layout: TimelineLayout
  tm: TimingMap
  /** chart.speeds·tm으로 만든 스크롤 맵 (속도 그래프 띠) */
  scroll: ScrollMap
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
  /** 녹음 중: 눌린 트랙 id(→ 누른 시각 ms)와 트랙 위치별 키 이름 */
  recording?: { pressed: ReadonlyMap<string, number>; labels: string[] }
}

/** 스펙 6.3절 타임라인 색 */
const COLORS = {
  laneBg: '#161616',
  laneDivider: '#2a2a2a',
  measure: '#5a5a5a',
  beat: '#3a3a3a',
  snap: '#262626',
  bpm: '#f59e0b',
  bpmChip: 'rgba(245, 158, 11, 0.16)',
  speed: '#34d399',
  speedChip: 'rgba(52, 211, 153, 0.16)',
  /** 속도 그래프 띠: 바탕 --bg-card, 막대 --accent-soft, ×1 선 --border */
  speedGraphBg: '#232323',
  speedGraphBar: 'rgba(139, 92, 246, 0.18)',
  speedGraphOne: '#2e2e2e',
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
  keyLabelPressed: '#f2f2f2',
  /** --text-muted */
  trackName: '#8c8c8c'
}

const NOTE_RADIUS = 3
const NOTE_INSET = 4
const HOLD_BODY_INSET = 8
const HOLD_BODY_ALPHA = 0.6
const PREVIEW_ALPHA = 0.5
const SELECTED_BORDER = 2
const CHIP_HEIGHT = 20
/** 속도 그래프 띠가 꽉 차는 배율 (그 이상은 잘린다) */
const SPEED_GRAPH_MAX = 4
/** 녹음 중 트랙 키 이름 칩: 아래 가장자리에서 띄운 거리와 크기 */
const KEY_CHIP_BOTTOM = 8
const KEY_CHIP_HEIGHT = 20
const KEY_CHIP_INSET = 4
/** 맨 위 트랙 이름 줄의 글자 좌우 여백 */
const NAME_PADDING = 4
const FONT = '500 12px "Pretendard Variable", Pretendard, system-ui, sans-serif'

/** 1px 선이 픽셀 경계에 걸쳐 흐려지지 않도록 반 픽셀에 맞춘다. */
const crisp = (v: number) => Math.round(v) + 0.5

export function drawTimeline(ctx: CanvasRenderingContext2D, p: DrawParams): void {
  const { view, layout, tm } = p
  const left = layout.tracksX
  const right = layout.tracksX + layout.totalWidth
  const h = view.height

  // 트랙 바탕·구분선
  ctx.fillStyle = COLORS.laneBg
  ctx.fillRect(left, 0, right - left, h)
  drawDividers(ctx, layout, 0, h)

  // 녹음 중 눌린 트랙: 트랙 전체 높이를 강조
  if (p.recording) {
    ctx.fillStyle = COLORS.pressed
    for (const col of layout.columns) {
      if (p.recording.pressed.has(col.id)) ctx.fillRect(col.x, 0, col.width, h)
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

  drawSpeedGraph(ctx, p)

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
    ctx.lineTo(layout.labelX, y)
    ctx.stroke()
    drawChip(ctx, layout.labelX, y, `${formatBpm(point.bpm)} BPM`, COLORS.bpmChip, COLORS.bpm)
  }

  // 변속 지점: 초록 선 + 라벨 칩. 같은 tick에 BPM 칩이 있으면 그 아래에 놓는다
  // (아래로 내려간 칩은 지점이 화면 위 밖에 있어도 보일 수 있어 위쪽 범위를 넓힌다)
  const bpmTicks = new Set(p.timing.map((t) => t.tick))
  for (const point of p.chart.speeds ?? []) {
    const y = Math.round(msToY(view, tm.tickToMs(point.tick)))
    if (y < -(CHIP_HEIGHT * 2 + 2) || y > h + CHIP_HEIGHT) continue
    ctx.strokeStyle = COLORS.speed
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(left, crisp(y))
    ctx.lineTo(layout.labelX, crisp(y))
    ctx.stroke()
    const chipY = bpmTicks.has(point.tick) ? y + CHIP_HEIGHT + 2 : y
    drawChip(ctx, layout.labelX, chipY, speedLabel(point), COLORS.speedChip, COLORS.speed)
  }

  // 가이드 마커: 청록 점선 (트랙 + 파형 영역)
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

  // 노트: 트랙 색. 채보에 없는 트랙의 노트는 그리지 않는다
  const columns = new Map(layout.columns.map((c) => [c.id, c]))
  for (const note of p.chart.notes) {
    const endTick = note.type === 'hold' ? note.endTick : note.tick
    if (note.tick > toTick || endTick < fromTick) continue
    const col = columns.get(note.track)
    const key = noteKey(note)
    if (!col || p.hiddenKeys?.has(key)) continue
    drawNote(ctx, p, note, col, col.color, 1, p.selection.has(key))
  }
  for (const note of p.preview ?? []) {
    const col = columns.get(note.track)
    if (!col) continue
    const color = p.previewInvalid ? COLORS.invalid : col.color
    drawNote(ctx, p, note, col, color, PREVIEW_ALPHA, false)
  }
  if (p.recording) drawRecording(ctx, p, p.recording)

  // 사각 선택 범위: 걸친 트랙 전체 폭 (끄는 중에 트랙이 줄었으면 남은 트랙까지만)
  const r = p.selectRect
  const span = r && laneSpan(layout, r.lane0, r.lane1)
  if (r && span) {
    const { x0, x1 } = span
    const yTop = msToY(view, tm.tickToMs(r.tick1))
    const yBottom = msToY(view, tm.tickToMs(r.tick0))
    ctx.fillStyle = COLORS.selectFill
    ctx.fillRect(x0, yTop, x1 - x0, yBottom - yTop)
    ctx.strokeStyle = COLORS.selectBorder
    ctx.lineWidth = 1
    ctx.strokeRect(crisp(x0), crisp(yTop), Math.round(x1 - x0) - 1, Math.round(yBottom - yTop))
  }

  drawTrackNames(ctx, layout)

  // 재생선
  const py = Math.round(msToY(view, view.playheadMs))
  ctx.strokeStyle = COLORS.playhead
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(layout.waveX, py)
  ctx.lineTo(right, py)
  ctx.stroke()
}

/** x에서 시작해 세로 가운데가 y인 라벨 칩. */
function drawChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  background: string,
  color: string
): void {
  const w = Math.ceil(ctx.measureText(text).width) + 16
  ctx.fillStyle = background
  ctx.beginPath()
  ctx.roundRect(x, y - CHIP_HEIGHT / 2, w, CHIP_HEIGHT, 6)
  ctx.fill()
  ctx.fillStyle = color
  ctx.fillText(text, x + 8, y + 0.5)
}

/** 트랙 오른쪽 속도 그래프 띠: 화면 1px 행마다 그 시각의 속도를 왼쪽부터 채운 막대 (×4에서 꽉 참). */
function drawSpeedGraph(ctx: CanvasRenderingContext2D, p: DrawParams): void {
  const { view, layout, scroll } = p
  const x = layout.speedX
  ctx.fillStyle = COLORS.speedGraphBg
  ctx.fillRect(x, 0, SPEED_GRAPH_WIDTH, view.height)
  ctx.fillStyle = COLORS.speedGraphBar
  for (let y = 0; y < view.height; y++) {
    const speed = scroll.speedAt(yToMs(view, y + 0.5))
    const w = (Math.min(speed, SPEED_GRAPH_MAX) / SPEED_GRAPH_MAX) * SPEED_GRAPH_WIDTH
    if (w > 0) ctx.fillRect(x, y, w, 1)
  }
  // ×1 위치
  const oneX = crisp(x + SPEED_GRAPH_WIDTH / SPEED_GRAPH_MAX)
  ctx.strokeStyle = COLORS.speedGraphOne
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(oneX, 0)
  ctx.lineTo(oneX, view.height)
  ctx.stroke()
}

/** 트랙 사이와 양 끝의 세로 구분선 (y0~y1). */
function drawDividers(
  ctx: CanvasRenderingContext2D,
  layout: TimelineLayout,
  y0: number,
  y1: number
): void {
  ctx.strokeStyle = COLORS.laneDivider
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const x of [...layout.columns.map((c) => c.x), layout.tracksX + layout.totalWidth]) {
    ctx.moveTo(crisp(x), y0)
    ctx.lineTo(crisp(x), y1)
  }
  ctx.stroke()
}

/** 맨 위 트랙 이름 줄. 지나가는 노트·격자를 가리고, 열 폭에 안 들어가는 이름은 말줄임. */
function drawTrackNames(ctx: CanvasRenderingContext2D, layout: TimelineLayout): void {
  const { tracksX, totalWidth } = layout
  ctx.fillStyle = COLORS.laneBg
  ctx.fillRect(tracksX, 0, totalWidth, TRACK_NAME_HEIGHT)
  drawDividers(ctx, layout, 0, TRACK_NAME_HEIGHT)
  ctx.beginPath()
  ctx.moveTo(tracksX, crisp(TRACK_NAME_HEIGHT))
  ctx.lineTo(tracksX + totalWidth, crisp(TRACK_NAME_HEIGHT))
  ctx.stroke()

  ctx.font = FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COLORS.trackName
  for (const col of layout.columns) {
    const text = fitText(ctx, col.id, col.width - NAME_PADDING * 2)
    ctx.fillText(text, col.x + col.width / 2, TRACK_NAME_HEIGHT / 2 + 0.5)
  }
  ctx.textAlign = 'start'
}

/** maxWidth에 안 들어가면 뒤를 잘라 `…`을 붙인다. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  for (let n = text.length - 1; n > 0; n--) {
    const cut = `${text.slice(0, n)}…`
    if (ctx.measureText(cut).width <= maxWidth) return cut
  }
  return '…'
}

/** 녹음 중: 누르고 있는 키를 누른 시각부터 재생선까지 반투명 막대로, 트랙 아래에 키 이름을 그린다. */
function drawRecording(
  ctx: CanvasRenderingContext2D,
  p: DrawParams,
  rec: NonNullable<DrawParams['recording']>
): void {
  const { view, layout } = p
  const py = msToY(view, view.playheadMs)
  ctx.globalAlpha = PREVIEW_ALPHA
  for (const col of layout.columns) {
    const downMs = rec.pressed.get(col.id)
    if (downMs === undefined) continue
    const y = msToY(view, downMs)
    ctx.fillStyle = col.color
    ctx.beginPath()
    ctx.roundRect(
      col.x + HOLD_BODY_INSET,
      py,
      col.width - HOLD_BODY_INSET * 2,
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
  layout.columns.forEach((col, i) => {
    const pressed = rec.pressed.has(col.id)
    ctx.fillStyle = pressed ? COLORS.keyChipPressed : COLORS.keyChip
    ctx.beginPath()
    ctx.roundRect(
      col.x + KEY_CHIP_INSET,
      chipY,
      col.width - KEY_CHIP_INSET * 2,
      KEY_CHIP_HEIGHT,
      NOTE_RADIUS
    )
    ctx.fill()
    ctx.fillStyle = pressed ? COLORS.keyLabelPressed : COLORS.keyLabel
    const label = fitText(ctx, rec.labels[i] ?? '-', col.width - KEY_CHIP_INSET * 2)
    ctx.fillText(label, col.x + col.width / 2, chipY + KEY_CHIP_HEIGHT / 2 + 0.5)
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
  col: TimelineColumn,
  color: string,
  alpha: number,
  selected: boolean
): void {
  const { view, tm } = p
  const x = col.x
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
      col.width - HOLD_BODY_INSET * 2,
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
    col.width - NOTE_INSET * 2,
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
