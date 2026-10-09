import { stepTick, type SnapDivision, type TimingMap } from '@rcm/core'

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

export const LANE_WIDTH = 48
export const WAVE_WIDTH = 64
const GAP = 8

export interface TimelineLayout {
  lanesX: number
  laneWidth: number
  lanes: number
  waveX: number
  waveWidth: number
  labelX: number
}

export function layoutTimeline(width: number, lanes: number): TimelineLayout {
  const lanesX = Math.round((width - lanes * LANE_WIDTH) / 2)
  return {
    lanesX,
    laneWidth: LANE_WIDTH,
    lanes,
    waveX: lanesX - GAP - WAVE_WIDTH,
    waveWidth: WAVE_WIDTH,
    labelX: lanesX + lanes * LANE_WIDTH + GAP
  }
}

export function xToLane(l: TimelineLayout, x: number): number | null {
  const lane = Math.floor((x - l.lanesX) / l.laneWidth)
  return lane >= 0 && lane < l.lanes ? lane : null
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
