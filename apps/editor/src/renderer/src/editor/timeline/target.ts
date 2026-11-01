import { isFreeChart, noteKey } from '@rcm/core'
import { markerAtY } from '../commands/markers'
import { getChart, type ProjectDoc } from '../state/doc'
import { hitTestFree } from './freeHitTest'
import { hitTestNote } from './hitTest'
import type { ToolGeometry } from './tools'
import { inTrackNameBand, xToLane } from './view'

export type TimelineTarget =
  | { kind: 'note'; key: string }
  | { kind: 'marker'; index: number }
  /** 트랙(칸) 안의 빈 곳 */
  | { kind: 'empty' }
  /** 트랙 밖이면서 마커도 아님, 또는 트랙 이름 띠 */
  | { kind: 'none' }

/** 화면 좌표 아래에 있는 것. 도구 컨트롤러의 onContextMenu와 같은 순서로 판정한다 */
export function timelineTargetAt(
  doc: ProjectDoc,
  activeChart: string,
  g: ToolGeometry,
  x: number,
  y: number
): TimelineTarget {
  if (xToLane(g.layout, x) === null) {
    const index = markerAtY(doc.editorData.markers, g.view, y)
    return index >= 0 ? { kind: 'marker', index } : { kind: 'none' }
  }
  if (inTrackNameBand(g.layout, x, y)) return { kind: 'none' }
  const chart = getChart(doc, activeChart)
  if (isFreeChart(chart)) {
    const hit = hitTestFree(chart.notes, g.tm, g.view, g.layout, x, y)
    return hit ? { kind: 'note', key: hit.key } : { kind: 'empty' }
  }
  const hit = hitTestNote(chart.notes, g.tm, g.view, g.layout, x, y)
  return hit ? { kind: 'note', key: noteKey(hit) } : { kind: 'empty' }
}
