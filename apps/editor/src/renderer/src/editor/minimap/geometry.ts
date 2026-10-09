import { yToMs, type TimelineView } from '../timeline/view'

/** 미니맵 띠의 폭(px) */
export const MINIMAP_WIDTH = 72

/** 100% 확대일 때의 타임라인 배율 */
export const DEFAULT_PX_PER_MS = 0.3

/** 곡 전체를 띠 높이에 맞춘다: 아래(y = height)가 0ms, 위(y = 0)가 곡 끝. */
export function msToMinimapY(ms: number, height: number, durationMs: number): number {
  return height - (ms / durationMs) * height
}

export function minimapYToMs(y: number, height: number, durationMs: number): number {
  const ms = ((height - y) / height) * durationMs
  return Math.min(durationMs, Math.max(0, ms))
}

/** 타임라인에 지금 보이는 시간 범위를 미니맵 y로 (top이 미래 쪽). */
export function minimapViewport(
  view: TimelineView,
  height: number,
  durationMs: number
): { top: number; bottom: number } {
  return {
    top: msToMinimapY(yToMs(view, 0), height, durationMs),
    bottom: msToMinimapY(yToMs(view, view.height), height, durationMs)
  }
}

/** 드래그한 픽셀 변화 → ms 변화. 위로 끌면(dy < 0) 앞으로 간다. */
export function minimapDyToMs(dy: number, height: number, durationMs: number): number {
  return (-dy / height) * durationMs
}
