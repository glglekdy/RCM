import { describe, expect, it } from 'vitest'
import {
  applyTapFromHere,
  applyTapWhole,
  pushTap
} from '../../../src/renderer/src/editor/commands/tap'
import { d0, withTiming } from '../fixtures'

const est = { bpm: 150, beatMs: 400, firstTapMs: 1100, firstBeatMs: 300, deviationMs: 0, count: 8 }

describe('tap tempo commands', () => {
  it('2초 넘게 쉬거나 되감으면 새 세션', () => {
    expect(pushTap([], 5)).toEqual([5])
    expect(pushTap([0, 400], 800)).toEqual([0, 400, 800])
    expect(pushTap([0, 400], 2401)).toEqual([2401])
    expect(pushTap([0, 400], 100)).toEqual([100])
  })
  it('곡 전체에 적용', () => {
    const d = applyTapWhole(
      withTiming(d0, [{ tick: 0, bpm: 120, beatsPerMeasure: 3 }, { tick: 1920, bpm: 60 }]),
      est
    )
    expect(d.song.timing).toEqual([{ tick: 0, bpm: 150, beatsPerMeasure: 3 }])
    expect(d.song.offsetMs).toBe(300)
  })
  it('한 박 가까이로 나온 첫 박은 0으로 본다', () => {
    const d = applyTapWhole(d0, { ...est, bpm: 120, beatMs: 500, firstBeatMs: 499.9999999 })
    expect(d.song.offsetMs).toBe(0)
  })
  it('이 지점부터 적용: 가장 가까운 박에 BPM 지점 추가', () => {
    const d = applyTapFromHere(d0, est, 2040)
    expect(d.song.timing).toEqual([
      { tick: 0, bpm: 120, beatsPerMeasure: 4 },
      { tick: 1920, bpm: 150 }
    ])
  })
  it('이 지점부터 적용: 처음이면 첫 지점 BPM 교체', () => {
    expect(applyTapFromHere(d0, est, 100).song.timing).toEqual([
      { tick: 0, bpm: 150, beatsPerMeasure: 4 }
    ])
  })
})
