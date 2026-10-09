import {
  compareNotes,
  notesOverlap,
  snapStepTicks,
  snapTick,
  type Note,
  type SnapDivision,
  type TimingMap
} from '@rcm/core'
import type { Press } from '../input/recorder'
import { getChart, replaceChart, type ProjectDoc } from '../state/doc'

/**
 * 누름을 현재 스냅에 맞춘 노트로. 한 칸 이상 누르면 hold, 아니면 tap.
 * tick < 0(곡 시작 전)은 버리고 그 개수를 `early`로 돌려준다.
 */
export function quantizePresses(
  presses: Press[],
  tm: TimingMap,
  snap: SnapDivision
): { notes: Note[]; early: number } {
  const step = snapStepTicks(snap)
  const notes: Note[] = []
  let early = 0
  for (const p of presses) {
    const down = tm.msToTick(p.downMs)
    const up = tm.msToTick(p.upMs)
    const tick = snapTick(tm, down, snap)
    if (tick < 0) {
      early++
      continue
    }
    if (up - down >= step) {
      const endTick = Math.max(snapTick(tm, up, snap), tick + step)
      notes.push({ tick, track: p.track, type: 'hold', endTick })
    } else {
      notes.push({ tick, track: p.track, type: 'tap' })
    }
  }
  return { notes, early }
}

/** 녹음을 시작할 때 정해 둔 대상 채보와 스냅. 녹음 중 바뀐 상태 대신 이 값으로 합친다. */
export interface RecordSession {
  file: string
  snap: SnapDivision
}

/** 누름을 세션의 스냅으로 정렬해 세션의 채보에 합친다. */
export function applyRecording(
  doc: ProjectDoc,
  session: RecordSession,
  tm: TimingMap,
  presses: Press[]
): { doc: ProjectDoc; added: number; dropped: number; early: number } {
  const { notes, early } = quantizePresses(presses, tm, session.snap)
  return { ...mergeRecorded(doc, session.file, notes), early }
}

/** 녹음을 끝낸 뒤 보여 줄 안내 문구. */
export function recordingMessage(r: { added: number; dropped: number; early: number }): string {
  return [
    r.added > 0 ? `${r.added}개 노트 추가` : '추가된 노트가 없어요',
    r.dropped > 0 ? `${r.dropped}개는 겹쳐서 버림` : '',
    r.early > 0 ? `${r.early}개는 곡 시작 전이라 버림` : ''
  ]
    .filter((s) => s !== '')
    .join(' · ')
}

/** 녹음한 노트를 채보에 합친다. 기존 노트나 앞서 넣은 녹음 노트와 겹치면 버린다. */
export function mergeRecorded(
  doc: ProjectDoc,
  file: string,
  notes: Note[]
): { doc: ProjectDoc; added: number; dropped: number } {
  const chart = getChart(doc, file)
  const kept = [...chart.notes]
  let added = 0
  for (const n of notes) {
    if (kept.some((o) => notesOverlap(o, n))) continue
    kept.push(n)
    added++
  }
  const dropped = notes.length - added
  if (added === 0) return { doc, added, dropped }
  const sorted = kept.sort(compareNotes(chart.tracks))
  return { doc: replaceChart(doc, file, { ...chart, notes: sorted }), added, dropped }
}
