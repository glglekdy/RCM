import {
  noteKey,
  snapTick,
  trackIndex,
  type Note,
  type SnapDivision,
  type TimingMap,
  type Track
} from '@rcm/core'
import { msToY, xToLane, yToMs, type TimelineLayout, type TimelineView } from './view'

/** 노트 머리의 높이(px). 세로 중앙이 노트의 시각이다. */
export const NOTE_HEIGHT = 10

/**
 * 화면 좌표가 가리키는 트랙(위치와 id)과 스냅된 tick. 트랙 밖이거나, 스냅한 tick이 0보다 앞(곡 시작 전)이면 null.
 * tick 0보다 반 칸 이내로 아래는 스냅하면 0이 되므로 tick 0 셀이다.
 */
export function pointerToCell(
  tm: TimingMap,
  view: TimelineView,
  layout: TimelineLayout,
  x: number,
  y: number,
  snap: SnapDivision
): { lane: number; track: string; tick: number } | null {
  const lane = xToLane(layout, x)
  if (lane === null) return null
  const tick = snapTick(tm, tm.msToTick(yToMs(view, y)), snap)
  if (tick < 0) return null
  // -0을 0으로
  return { lane, track: layout.columns[lane].id, tick: Math.max(0, tick) }
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
  const track = layout.columns[lane].id
  let best: Note | null = null
  for (const note of notes) {
    if (note.track !== track || (best && note.tick <= best.tick)) continue
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

/**
 * y가 롱노트 끝(위쪽) 손잡이 위인지. 손잡이는 끝 y에서 노트 높이만큼이고,
 * 짧은 롱노트는 머리와 끝의 가운데보다 위만 손잡이다 (아래는 머리).
 */
export function onHoldEnd(note: Note, tm: TimingMap, view: TimelineView, y: number): boolean {
  if (note.type !== 'hold') return false
  const yHead = msToY(view, tm.tickToMs(note.tick))
  const yEnd = msToY(view, tm.tickToMs(note.endTick))
  return y >= yEnd - NOTE_HEIGHT / 2 && y <= Math.min(yEnd + NOTE_HEIGHT / 2, (yEnd + yHead) / 2)
}

/** 사각 선택 범위: 트랙 위치와 tick 모두 양 끝 포함. */
export interface SelectRect {
  lane0: number
  lane1: number
  tick0: number
  tick1: number
}

/** 머리가 범위 안(양 끝 포함, 인자 순서 무관)인 노트 키. lane은 `tracks`에서의 트랙 위치. */
export function notesInRect(
  notes: Note[],
  tracks: readonly Track[],
  lane0: number,
  lane1: number,
  tick0: number,
  tick1: number
): Set<string> {
  const [laneLo, laneHi] = lane0 <= lane1 ? [lane0, lane1] : [lane1, lane0]
  const [tickLo, tickHi] = tick0 <= tick1 ? [tick0, tick1] : [tick1, tick0]
  const keys = new Set<string>()
  for (const n of notes) {
    const lane = trackIndex(tracks, n.track)
    if (lane >= 0 && lane >= laneLo && lane <= laneHi && n.tick >= tickLo && n.tick <= tickHi) {
      keys.add(noteKey(n))
    }
  }
  return keys
}
