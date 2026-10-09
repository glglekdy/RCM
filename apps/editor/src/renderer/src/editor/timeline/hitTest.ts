import { noteKey, snapTick, type Note, type SnapDivision, type TimingMap } from '@rcm/core'
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
    // 머리 사각형, 롱노트는 그려진 몸통(끝 y보다 반 노트 높이 위)까지
    let yTop = yHead - NOTE_HEIGHT / 2
    if (note.type === 'hold') {
      yTop = Math.min(yTop, msToY(view, tm.tickToMs(note.endTick)) - NOTE_HEIGHT / 2)
    }
    if (y >= yTop && y <= yHead + NOTE_HEIGHT / 2) best = note
  }
  return best
}

/** 사각 선택 범위: 레인과 tick 모두 양 끝 포함. */
export interface SelectRect {
  lane0: number
  lane1: number
  tick0: number
  tick1: number
}

/** 머리가 범위 안(양 끝 포함, 인자 순서 무관)인 노트 키. */
export function notesInRect(
  notes: Note[],
  lane0: number,
  lane1: number,
  tick0: number,
  tick1: number
): Set<string> {
  const [laneLo, laneHi] = lane0 <= lane1 ? [lane0, lane1] : [lane1, lane0]
  const [tickLo, tickHi] = tick0 <= tick1 ? [tick0, tick1] : [tick1, tick0]
  const keys = new Set<string>()
  for (const n of notes) {
    if (n.lane >= laneLo && n.lane <= laneHi && n.tick >= tickLo && n.tick <= tickHi) {
      keys.add(noteKey(n))
    }
  }
  return keys
}
