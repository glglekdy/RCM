import { describe, expect, it } from 'vitest'
import { TimingMap } from '@rcm/core'
import {
  addTimingPoint,
  measureBeatAt,
  removeTimingPoint,
  setOffset,
  updateTimingPoint
} from '../../../src/renderer/src/editor/commands/timing'
import { getChart } from '../../../src/renderer/src/editor/state/doc'
import { d0, withNotes, withTiming } from '../fixtures'

describe('timing commands', () => {
  it('BPM 지점 추가: 정렬, 같은 tick은 교체', () => {
    let d = addTimingPoint(d0, 1920, 90)!
    d = addTimingPoint(d, 960, 100)!
    expect(d.song.timing.map((t) => t.tick)).toEqual([0, 960, 1920])
    d = addTimingPoint(d, 960, 110)!
    expect(d.song.timing[1].bpm).toBe(110)
    expect(addTimingPoint(d0, -1, 100)).toBeNull()
    expect(addTimingPoint(d0, 480, 0)).toBeNull()
  })

  it('같은 tick 교체 시 박자 수는 유지', () => {
    const d = withTiming(d0, [
      { tick: 0, bpm: 120, beatsPerMeasure: 4 },
      { tick: 960, bpm: 100, beatsPerMeasure: 3 }
    ])
    expect(addTimingPoint(d, 960, 90)!.song.timing[1]).toEqual({
      tick: 960,
      bpm: 90,
      beatsPerMeasure: 3
    })
  })

  it('첫 지점 삭제 불가, 잘못된 값 거부', () => {
    expect(removeTimingPoint(d0, 0)).toBeNull()
    expect(updateTimingPoint(d0, 0, { bpm: 0 })).toBeNull()
    expect(updateTimingPoint(d0, 0, { beatsPerMeasure: 0 })).toBeNull()
    expect(updateTimingPoint(d0, 0, { beatsPerMeasure: 17 })).toBeNull()
    expect(updateTimingPoint(d0, 0, { beatsPerMeasure: 3.5 })).toBeNull()
    expect(updateTimingPoint(d0, 5, { bpm: 100 })).toBeNull()
    expect(updateTimingPoint(d0, 0, { beatsPerMeasure: 3 })!.song.timing[0].beatsPerMeasure).toBe(3)
  })

  it('지점 삭제', () => {
    const d = addTimingPoint(d0, 960, 100)!
    expect(removeTimingPoint(d, 1)!.song.timing).toHaveLength(1)
  })

  it('타이밍이 바뀌어도 노트 tick 유지', () => {
    const base = withNotes(d0, [{ tick: 960, track: 'Note_1', type: 'tap' }])
    const d = setOffset(base, 250)!
    expect(getChart(d, 'normal.chart.json').notes[0].tick).toBe(960)
    expect(d.charts).toBe(base.charts) // 차트 참조 그대로 → 차트는 dirty 아님
    expect(setOffset(base, NaN)).toBeNull()
  })

  it('마디:박은 1부터, 구간마다 마디가 새로 시작', () => {
    const d = withTiming(d0, [
      { tick: 0, bpm: 120, beatsPerMeasure: 4 },
      { tick: 2880, bpm: 90, beatsPerMeasure: 3 } // 1.5마디 지점 → 앞 구간은 2마디로 센다
    ])
    const tm = new TimingMap(d.song.timing, 0)
    expect(measureBeatAt(tm, 0)).toEqual({ measure: 1, beat: 1, offset: 0 })
    expect(measureBeatAt(tm, 960)).toEqual({ measure: 1, beat: 3, offset: 0 })
    expect(measureBeatAt(tm, 2880)).toEqual({ measure: 3, beat: 1, offset: 0 })
    expect(measureBeatAt(tm, 2880 + 480 * 4)).toEqual({ measure: 4, beat: 2, offset: 0 })
  })

  it('박 사이 위치는 박 안의 tick 수 (offset)', () => {
    const tm = new TimingMap([{ tick: 0, bpm: 120, beatsPerMeasure: 4 }], 0)
    expect(measureBeatAt(tm, 480 * 4 + 480 + 240)).toEqual({ measure: 2, beat: 2, offset: 240 })
  })
})
