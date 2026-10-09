import { TICKS_PER_BEAT, type TimingMap, type TimingPoint } from '@rcm/core'
import type { ProjectDoc } from '../state/doc'

function withTimingPoints(doc: ProjectDoc, timing: TimingPoint[]): ProjectDoc {
  return { ...doc, song: { ...doc.song, timing } }
}

export function setOffset(doc: ProjectDoc, offsetMs: number): ProjectDoc | null {
  if (!Number.isFinite(offsetMs)) return null
  return { ...doc, song: { ...doc.song, offsetMs } }
}

/** tick 위치에 BPM 지점을 넣는다. 같은 tick이 있으면 BPM만 바꾼다. */
export function addTimingPoint(doc: ProjectDoc, tick: number, bpm: number): ProjectDoc | null {
  if (!Number.isInteger(tick) || tick < 0 || !Number.isFinite(bpm) || bpm <= 0) return null
  const timing = doc.song.timing
  const at = timing.findIndex((t) => t.tick === tick)
  if (at >= 0) return withTimingPoints(doc, timing.map((t, i) => (i === at ? { ...t, bpm } : t)))
  return withTimingPoints(doc, [...timing, { tick, bpm }].sort((a, b) => a.tick - b.tick))
}

export function updateTimingPoint(
  doc: ProjectDoc,
  index: number,
  patch: { bpm?: number; beatsPerMeasure?: number }
): ProjectDoc | null {
  const timing = doc.song.timing
  if (!Number.isInteger(index) || index < 0 || index >= timing.length) return null
  if (patch.bpm !== undefined && !(Number.isFinite(patch.bpm) && patch.bpm > 0)) return null
  const b = patch.beatsPerMeasure
  if (b !== undefined && !(Number.isInteger(b) && b >= 1 && b <= 16)) return null
  return withTimingPoints(doc, timing.map((t, i) => (i === index ? { ...t, ...patch } : t)))
}

export function removeTimingPoint(doc: ProjectDoc, index: number): ProjectDoc | null {
  const timing = doc.song.timing
  if (!Number.isInteger(index) || index <= 0 || index >= timing.length) return null
  return withTimingPoints(
    doc,
    timing.filter((_, i) => i !== index)
  )
}

/**
 * tick의 "마디:박" (둘 다 1부터). 구간마다 마디가 새로 시작하므로
 * 앞 구간들의 마디 수(남는 부분은 한 마디로 센다)를 더해 간다.
 */
export function measureBeatAt(tm: TimingMap, tick: number): { measure: number; beat: number } {
  const seg = tm.segmentAt(tick)
  let before = 0
  for (let s = seg; s.index > 0; ) {
    s = tm.segmentAt(s.startTick - 1)
    before += Math.ceil((s.endTick - s.startTick) / (s.beatsPerMeasure * TICKS_PER_BEAT))
  }
  const measureTicks = seg.beatsPerMeasure * TICKS_PER_BEAT
  const rel = Math.max(0, tick - seg.startTick)
  return {
    measure: before + Math.floor(rel / measureTicks) + 1,
    beat: Math.floor((rel % measureTicks) / TICKS_PER_BEAT) + 1
  }
}
