import { describe, expect, it } from 'vitest'
import { TimingMap, basicTracks } from '@rcm/core'
import {
  TRACK_PX,
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
    const l = layoutTimeline(1000, basicTracks(4))
    expect(l.tracksX).toBe(404)
    expect(l.totalWidth).toBe(192)
    expect(l.waveX).toBe(332)
    expect(l.labelX).toBe(404 + 192 + 8)
    expect(l.columns[0]).toEqual({ id: 'Note_1', x: 404, width: 48, color: '#f2f2f2' })
    expect(xToLane(l, 404)).toBe(0)
    expect(xToLane(l, 595)).toBe(3)
    expect(xToLane(l, 403)).toBeNull()
    expect(xToLane(l, 596)).toBeNull()
  })
  it('폭이 다른 트랙 레이아웃과 경계', () => {
    const l = layoutTimeline(1000, [{ id: 'Side_L', width: 'wide' }, { id: 'Note_1' }, { id: 'T', width: 'narrow' }])
    expect(l.totalWidth).toBe(160)
    expect(l.tracksX).toBe(420)
    expect(l.columns.map((c) => [c.id, c.x, c.width])).toEqual([['Side_L', 420, 80], ['Note_1', 500, 48], ['T', 548, 32]])
    expect(xToLane(l, 499)).toBe(0)
    expect(xToLane(l, 500)).toBe(1)
    expect(xToLane(l, 547)).toBe(1)
    expect(xToLane(l, 548)).toBe(2)
    expect(xToLane(l, 580)).toBeNull()
    expect(l.waveX).toBe(420 - 8 - 64)
    expect(l.labelX).toBe(420 + 160 + 8)
  })
  it('트랙 폭과 색', () => {
    expect(TRACK_PX).toEqual({ narrow: 32, normal: 48, wide: 80 })
    const l = layoutTimeline(1000, [{ id: 'A', color: '#f59e0b' }, { id: 'B' }])
    expect(l.columns.map((c) => c.color)).toEqual(['#f59e0b', '#f2f2f2'])
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
