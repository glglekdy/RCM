import { snapTick, TimingMap, type TempoEstimate } from '@rcm/core'
import type { ProjectDoc } from '../state/doc'
import { addTimingPoint } from './timing'

const SESSION_GAP_MS = 2000

/** 탭을 기록한다. 직전 탭보다 2초 넘게 뒤이거나 앞(되감기)이면 새로 시작한다. */
export function pushTap(taps: number[], ms: number): number[] {
  const last = taps[taps.length - 1]
  if (last === undefined || ms < last || ms - last > SESSION_GAP_MS) return [ms]
  return [...taps, ms]
}

/** 곡 전체를 하나의 BPM으로 바꾸고 첫 박 위치를 offset으로 쓴다. */
export function applyTapWhole(doc: ProjectDoc, est: TempoEstimate): ProjectDoc {
  const first = doc.song.timing[0]
  let offsetMs = Math.round(est.firstBeatMs)
  // 부동소수점 오차로 firstBeatMs가 한 박 가까이(예: 499.9999) 나오면 0으로 본다
  if (offsetMs >= Math.round(est.beatMs)) offsetMs = 0
  return {
    ...doc,
    song: {
      ...doc.song,
      timing: [{ tick: 0, bpm: est.bpm, beatsPerMeasure: first?.beatsPerMeasure ?? 4 }],
      offsetMs
    }
  }
}

/** 첫 탭에 가장 가까운 박부터 새 BPM을 적용한다. 처음이면 첫 지점 BPM만 바꾼다. */
export function applyTapFromHere(
  doc: ProjectDoc,
  est: TempoEstimate,
  firstTapMs: number
): ProjectDoc {
  const tm = new TimingMap(doc.song.timing, doc.song.offsetMs)
  const tick = Math.round(snapTick(tm, tm.msToTick(firstTapMs), 4))
  if (tick <= 0) {
    return {
      ...doc,
      song: {
        ...doc.song,
        timing: doc.song.timing.map((t, i) => (i === 0 ? { ...t, bpm: est.bpm } : t))
      }
    }
  }
  return addTimingPoint(doc, tick, est.bpm) ?? doc
}
