import { describe, expect, it } from 'vitest'
import { TimingMap } from '@rcm/core'
import {
  clampPlayheadMs,
  clampZoom,
  layoutTimeline,
  msToY,
  stepPlayheadMs,
  xToLane,
  yToMs
} from '../../../src/renderer/src/editor/timeline/view'

describe('timeline view', () => {
  const v = { playheadMs: 1000, pxPerMs: 0.5, height: 800 }
  it('재생선은 아래 1/4', () => expect(msToY(v, 1000)).toBe(600))
  it('미래는 위쪽', () => expect(msToY(v, 1200)).toBe(500))
  it('역변환', () => expect(yToMs(v, msToY(v, 1234))).toBeCloseTo(1234))
  it('레이아웃', () => {
    const l = layoutTimeline(1000, 4)
    expect(l.lanesX).toBe(404)
    expect(l.waveX).toBe(332)
    expect(l.labelX).toBe(404 + 192 + 8)
    expect(xToLane(l, 404)).toBe(0)
    expect(xToLane(l, 595)).toBe(3)
    expect(xToLane(l, 403)).toBeNull()
    expect(xToLane(l, 596)).toBeNull()
  })
  it('줌 범위', () => {
    expect(clampZoom(5)).toBe(2)
    expect(clampZoom(0.001)).toBe(0.05)
  })
  it('재생선 한 칸 이동 (음수 구간 포함)', () => {
    const tm = new TimingMap([{ tick: 0, bpm: 120 }], 300)
    expect(stepPlayheadMs(tm, 300, 4, -1)).toBe(-200)
    expect(stepPlayheadMs(tm, -200, 4, 1)).toBe(300)
  })
  it('재생선 범위: 곡 시작(또는 tick 0) 2초 전 ~ 곡 끝', () => {
    const late = new TimingMap([{ tick: 0, bpm: 120 }], 300)
    expect(clampPlayheadMs(late, -5000, 10000)).toBe(-2000)
    expect(clampPlayheadMs(late, 12000, 10000)).toBe(10000)
    const early = new TimingMap([{ tick: 0, bpm: 120 }], -500)
    expect(clampPlayheadMs(early, -5000, 10000)).toBe(-2500)
  })
})
