import { notesOverlap, snapStepTicks, snapTick, type Note, type SnapDivision, type TimingMap } from '@rcm/core'
import type { Press } from '../input/recorder'
import { getChart, replaceChart, type ProjectDoc } from '../state/doc'

const byTickLane = (a: Note, b: Note): number => a.tick - b.tick || a.lane - b.lane

/** 누름을 현재 스냅에 맞춘 노트로. 한 칸 이상 누르면 hold, 아니면 tap. tick < 0은 버린다. */
export function quantizePresses(presses: Press[], tm: TimingMap, snap: SnapDivision): Note[] {
  const step = snapStepTicks(snap)
  const notes: Note[] = []
  for (const p of presses) {
    const down = tm.msToTick(p.downMs)
    const up = tm.msToTick(p.upMs)
    const tick = snapTick(tm, down, snap)
    if (tick < 0) continue
    if (up - down >= step) {
      const endTick = Math.max(snapTick(tm, up, snap), tick + step)
      notes.push({ tick, lane: p.lane, type: 'hold', endTick })
    } else {
      notes.push({ tick, lane: p.lane, type: 'tap' })
    }
  }
  return notes
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
  return { doc: replaceChart(doc, file, { ...chart, notes: kept.sort(byTickLane) }), added, dropped }
}
