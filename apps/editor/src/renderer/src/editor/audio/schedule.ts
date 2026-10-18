import { noteStartTicks, type AnyChart, type TimingMap } from '@rcm/core'

/** 시작 위치가 음수면 그만큼 기다렸다가 곡 처음부터, 아니면 즉시 해당 오프셋부터 재생한다. */
export function playbackStartParams(fromMs: number): { delaySec: number; offsetSec: number } {
  if (fromMs < 0) return { delaySec: -fromMs / 1000, offsetSec: 0 }
  return { delaySec: 0, offsetSec: fromMs / 1000 }
}

/** 노트 시작 시각(ms) 목록. 오름차순, 같은 ms는 하나만. */
export function hitTimesForChart(chart: AnyChart, tm: TimingMap): number[] {
  const times = noteStartTicks(chart).map((t) => tm.tickToMs(t))
  times.sort((a, b) => a - b)
  return times.filter((t, i) => i === 0 || t !== times[i - 1])
}

/** `cursor`부터 훑어 [fromMs, untilMs)에 드는 hit를 모은다. fromMs보다 앞은 건너뛴다. */
export function collectDueHits(
  hits: number[],
  cursor: number,
  fromMs: number,
  untilMs: number
): { due: number[]; cursor: number } {
  const due: number[] = []
  let i = cursor
  while (i < hits.length && hits[i] < untilMs) {
    if (hits[i] >= fromMs) due.push(hits[i])
    i++
  }
  return { due, cursor: i }
}
