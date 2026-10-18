import {
  freeNoteHead,
  freeNoteKey,
  slideSpanAt,
  snapTick,
  type FreeNote,
  type SnapDivision,
  type TimingMap
} from '@rcm/core'
import { NOTE_HEIGHT } from './hitTest'
import { msToY, xToCol, yToMs, type TimelineLayout, type TimelineView } from './view'

/** 노트 양 끝에서 이 거리(px) 안을 잡으면 폭을 바꾼다. 좁은 노트는 가운데 1/3을 옮기기용으로 남긴다. */
export const EDGE_PX = 6

/** 화면 좌표 아래의 자유형 노트 조각. */
export interface FreeHit {
  note: FreeNote
  key: string
  /** 'point': 노트 머리 또는 슬라이드 지점, 'body': 슬라이드 지점 사이 몸통 */
  part: 'point' | 'body'
  /** 슬라이드 지점 위치 (단발 노트는 0) */
  point: number
  /** 머리·지점의 왼쪽/오른쪽 끝을 잡았으면 그쪽 */
  edge: 'left' | 'right' | null
}

/** 화면 좌표의 스냅된 tick. 곡 시작 전(0보다 앞)이면 null. */
export function pointerTick(tm: TimingMap, view: TimelineView, y: number, snap: SnapDivision): number | null {
  const tick = snapTick(tm, tm.msToTick(yToMs(view, y)), snap)
  return tick < 0 ? null : Math.max(0, tick)
}

/** 노트·지점 머리 사각형 */
function headHit(
  layout: TimelineLayout,
  view: TimelineView,
  tm: TimingMap,
  p: { tick: number; x: number; width: number },
  x: number,
  y: number
): 'left' | 'right' | 'mid' | null {
  const yc = msToY(view, tm.tickToMs(p.tick))
  if (y < yc - NOTE_HEIGHT / 2 || y > yc + NOTE_HEIGHT / 2) return null
  const x0 = layout.tracksX + p.x * layout.colPx
  const x1 = x0 + p.width * layout.colPx
  if (x < x0 || x > x1) return null
  const edge = Math.min(EDGE_PX, (x1 - x0) / 3)
  if (x <= x0 + edge) return 'left'
  if (x >= x1 - edge) return 'right'
  return 'mid'
}

/**
 * 화면 좌표 아래의 노트 조각. 머리·지점을 몸통보다 먼저 보고, 여럿이면 tick이 큰(위에 그려진) 것.
 */
export function hitTestFree(
  notes: readonly FreeNote[],
  tm: TimingMap,
  view: TimelineView,
  layout: TimelineLayout,
  x: number,
  y: number
): FreeHit | null {
  let best: FreeHit | null = null
  let bestTick = -Infinity
  for (const note of notes) {
    const points = note.type === 'slide' ? note.points : [note]
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      if (p.tick < bestTick) continue
      const h = headHit(layout, view, tm, p, x, y)
      if (!h) continue
      bestTick = p.tick
      best = { note, key: freeNoteKey(note), part: 'point', point: i, edge: h === 'mid' ? null : h }
    }
  }
  if (best) return best
  const ms = yToMs(view, y)
  const col = xToCol(layout, x)
  for (const note of notes) {
    if (note.type !== 'slide') continue
    const times = note.points.map((p) => tm.tickToMs(p.tick))
    if (ms < times[0] || ms > times[times.length - 1]) continue
    const head = freeNoteHead(note).tick
    if (head < bestTick) continue
    const span = slideSpanAt(note.points, times, ms)
    if (col < span.x || col > span.x + span.width) continue
    bestTick = head
    // 몸통의 지점 위치: 그 시각 바로 앞 지점
    let point = 0
    while (point < times.length - 2 && ms >= times[point + 1]) point++
    best = { note, key: freeNoteKey(note), part: 'body', point, edge: null }
  }
  return best
}

/** 사각 선택 범위: 칸(소수)과 tick 모두 양 끝 포함. */
export interface FreeRect {
  col0: number
  col1: number
  tick0: number
  tick1: number
}

/** 머리가 범위 안에 걸친(가로 구간이 겹치는) 노트 키. */
export function freeNotesInRect(notes: readonly FreeNote[], r: FreeRect): Set<string> {
  const keys = new Set<string>()
  for (const n of notes) {
    const h = freeNoteHead(n)
    if (h.tick < r.tick0 || h.tick > r.tick1) continue
    if (h.x + h.width < r.col0 || h.x > r.col1) continue
    keys.add(freeNoteKey(n))
  }
  return keys
}
