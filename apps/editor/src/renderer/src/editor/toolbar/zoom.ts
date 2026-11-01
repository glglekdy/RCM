import { clampZoom } from '../timeline/view'

/** 확대 컨트롤 한 번에 바뀌는 배율 */
export const ZOOM_STEP = 1.25

export function zoomIn(pxPerMs: number): number {
  return clampZoom(pxPerMs * ZOOM_STEP)
}

export function zoomOut(pxPerMs: number): number {
  return clampZoom(pxPerMs / ZOOM_STEP)
}
