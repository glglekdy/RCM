import { snapTick, type Note, type SnapDivision, type TimingMap } from '@rcm/core'
import { msToY, xToLane, yToMs, type TimelineLayout, type TimelineView } from './view'

/** 노트 머리의 높이(px). 세로 중앙이 노트의 시각이다. */
export const NOTE_HEIGHT = 10

/** 화면 좌표가 가리키는 레인과 스냅된 tick. 레인 밖이면 null. */
export function pointerToCell(
  tm: TimingMap,
  view: TimelineView,
  layout: TimelineLayout,
  x: number,
  y: number,
  snap: SnapDivision
): { lane: number; tick: number } | null {
  const lane = xToLane(layout, x)
  if (lane === null) return null
  const tick = Math.max(0, snapTick(tm, tm.msToTick(yToMs(view, y)), snap))
  return { lane, tick }
}

/** 화면 좌표 아래의 노트 (머리 또는 롱노트 몸통). 여러 개면 tick이 큰 것. */
export function hitTestNote(
  notes: Note[],
  tm: TimingMap,
  view: TimelineView,
  layout: TimelineLayout,
  x: number,
  y: number
): Note | null {
  const lane = xToLane(layout, x)
  if (lane === null) return null
  let best: Note | null = null
  for (const note of notes) {
    if (note.lane !== lane || (best && note.tick <= best.tick)) continue
    const yHead = msToY(view, tm.tickToMs(note.tick))
    // 머리 사각형, 롱노트는 몸통(머리 y ~ 끝 y)까지
    let yTop = yHead - NOTE_HEIGHT / 2
    if (note.type === 'hold') yTop = Math.min(yTop, msToY(view, tm.tickToMs(note.endTick)))
    if (y >= yTop && y <= yHead + NOTE_HEIGHT / 2) best = note
  }
  return best
}
