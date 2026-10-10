import {
  DEFAULT_NOTE_COLOR,
  stepTick,
  type SnapDivision,
  type TimingMap,
  type Track,
  type TrackWidth
} from '@rcm/core'

/** 재생선이 놓이는 높이 비율 (위에서부터). 아래 1/4 지점. */
export const PLAYHEAD_RATIO = 0.75

export interface TimelineView {
  playheadMs: number
  pxPerMs: number
  height: number
}

/** 시간이 아래 → 위로 흐른다: 미래일수록 y가 작다. */
export function msToY(v: TimelineView, ms: number): number {
  return v.height * PLAYHEAD_RATIO - (ms - v.playheadMs) * v.pxPerMs
}

export function yToMs(v: TimelineView, y: number): number {
  return v.playheadMs + (v.height * PLAYHEAD_RATIO - y) / v.pxPerMs
}

/** 에디터 타임라인의 트랙 폭(px). */
export const TRACK_PX: Readonly<Record<TrackWidth, number>> = { narrow: 32, normal: 48, wide: 80 }
export const WAVE_WIDTH = 64
const GAP = 8

/** 트랙 하나가 차지하는 세로 열. 위치는 `tracks` 배열 순서와 같다. */
export interface TimelineColumn {
  id: string
  x: number
  width: number
  color: string
}

export interface TimelineLayout {
  tracksX: number
  totalWidth: number
  columns: TimelineColumn[]
  waveX: number
  waveWidth: number
  labelX: number
}

export function layoutTimeline(width: number, tracks: readonly Track[]): TimelineLayout {
  const widths = tracks.map((t) => TRACK_PX[t.width ?? 'normal'])
  const totalWidth = widths.reduce((a, b) => a + b, 0)
  const tracksX = Math.round((width - totalWidth) / 2)
  let x = tracksX
  const columns = tracks.map((t, i) => {
    const col = { id: t.id, x, width: widths[i], color: t.color ?? DEFAULT_NOTE_COLOR }
    x += widths[i]
    return col
  })
  return {
    tracksX,
    totalWidth,
    columns,
    waveX: tracksX - GAP - WAVE_WIDTH,
    waveWidth: WAVE_WIDTH,
    labelX: tracksX + totalWidth + GAP
  }
}

/** x가 놓인 열의 위치(트랙 위치). 트랙 밖이면 null. */
export function xToLane(l: TimelineLayout, x: number): number | null {
  const lane = l.columns.findIndex((c) => x >= c.x && x < c.x + c.width)
  return lane >= 0 ? lane : null
}

/** 타임라인 맨 위 트랙 이름 줄의 높이(px). */
export const TRACK_NAME_HEIGHT = 20

/** 트랙 이름 줄 위인지. 이름 줄에 가려진 노트는 보이지 않으므로 여기서는 편집하지 않는다. */
export function inTrackNameBand(l: TimelineLayout, x: number, y: number): boolean {
  return y < TRACK_NAME_HEIGHT && xToLane(l, x) !== null
}

/**
 * 트랙 위치 lane0~lane1(양 끝 포함)이 차지하는 x 구간. 지금 있는 트랙으로 자르고,
 * 걸친 트랙이 없으면 null (트랙이 줄어든 뒤의 오래된 범위).
 */
export function laneSpan(l: TimelineLayout, lane0: number, lane1: number): { x0: number; x1: number } | null {
  const lo = Math.max(0, lane0)
  const hi = Math.min(l.columns.length - 1, lane1)
  if (lo > hi) return null
  const last = l.columns[hi]
  return { x0: l.columns[lo].x, x1: last.x + last.width }
}

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 2

export function clampZoom(pxPerMs: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pxPerMs))
}

/** 재생선이 갈 수 있는 범위: 곡 시작과 tick 0 중 이른 쪽의 2초 전 ~ 곡 끝. */
export function clampPlayheadMs(tm: TimingMap, ms: number, durationMs: number): number {
  const min = Math.min(0, tm.tickToMs(0)) - 2000
  return Math.min(Math.max(ms, min), Math.max(min, durationMs))
}

/** 재생선을 스냅 한 칸 앞/뒤로 옮긴 위치(ms). */
export function stepPlayheadMs(
  tm: TimingMap,
  playheadMs: number,
  snap: SnapDivision,
  dir: 1 | -1
): number {
  // ms ↔ tick 왕복 오차(예: 479.9999…)로 같은 칸에 머무르지 않도록 tick을 다듬는다
  const tick = Math.round(tm.msToTick(playheadMs) * 1e6) / 1e6
  return tm.tickToMs(stepTick(tm, tick, snap, dir))
}
