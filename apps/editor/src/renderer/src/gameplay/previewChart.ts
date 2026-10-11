import { basicTracks, TICKS_PER_BEAT, TimingMap, type Chart, type Note } from '@rcm/core'

const BEAT = TICKS_PER_BEAT
const MEASURE = BEAT * 4
const REPEAT = 4
/** 마지막 노트가 끝난 뒤 다시 시작하기까지 */
const TAIL_MS = 1000

/** 한 묶음(4마디): 4분 단타 → 8분 계단 → 동시치기 → 2박 롱노트 둘. `at`은 묶음 시작 tick. */
function phrase(at: number): Note[] {
  const notes: Note[] = []
  const tap = (tick: number, lane: number) => notes.push({ tick: at + tick, track: `Note_${lane}`, type: 'tap' })
  for (let k = 0; k < 4; k++) tap(k * BEAT, k + 1)
  ;[1, 2, 3, 4, 4, 3, 2, 1].forEach((lane, k) => tap(MEASURE + (k * BEAT) / 2, lane))
  for (const [beat, a, b] of [
    [0, 1, 4],
    [2, 2, 3]
  ]) {
    tap(MEASURE * 2 + beat * BEAT, a)
    tap(MEASURE * 2 + beat * BEAT, b)
  }
  for (const lane of [2, 3]) {
    notes.push({ tick: at + MEASURE * 3, track: `Note_${lane}`, type: 'hold', endTick: at + MEASURE * 3 + BEAT * 2 })
  }
  return notes
}

/** 설정 미리보기용 4키 데모 채보 (120BPM, 4마디 패턴 반복). */
export function previewChart(): { chart: Chart; tm: TimingMap; lengthMs: number } {
  const timing = [{ tick: 0, bpm: 120, beatsPerMeasure: 4 }]
  const tm = new TimingMap(timing, 0)
  const notes = Array.from({ length: REPEAT }, (_, i) => phrase(MEASURE * 4 * i)).flat()
  notes.sort((a, b) => a.tick - b.tick || a.track.localeCompare(b.track))
  const chart: Chart = { formatVersion: 1, name: 'PREVIEW', level: 1, tracks: basicTracks(4), notes }
  const lastEnd = Math.max(...notes.map((n) => tm.tickToMs(n.type === 'hold' ? n.endTick : n.tick)))
  return { chart, tm, lengthMs: lastEnd + TAIL_MS }
}
