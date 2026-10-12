import { describe, expect, it } from 'vitest'
import { TimingMap, basicTracks } from '@rcm/core'
import {
  TRACK_NAME_HEIGHT,
  TRACK_PX,
  clampPlayheadMs,
  clampZoom,
  inTrackNameBand,
  laneSpan,
  layoutTimeline,
  msToY,
  speedLabel,
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
    expect(l.labelX).toBe(404 + 192 + 8 + 28)
    expect(l.columns[0]).toEqual({ id: 'Note_1', x: 404, width: 48, color: '#f2f2f2' })
    expect(xToLane(l, 404)).toBe(0)
    expect(xToLane(l, 595)).toBe(3)
    expect(xToLane(l, 403)).toBeNull()
    expect(xToLane(l, 596)).toBeNull()
  })
  it('모든 트랙은 같은 폭 (예전 width는 무시)', () => {
    const l = layoutTimeline(1000, [{ id: 'Side_L', width: 'wide' } as never, { id: 'Note_1' }, { id: 'T', kind: 'gimmick' }])
    expect(l.totalWidth).toBe(144)
    expect(l.tracksX).toBe(428)
    expect(l.columns.map((c) => [c.id, c.x, c.width])).toEqual([['Side_L', 428, 48], ['Note_1', 476, 48], ['T', 524, 48]])
    expect(xToLane(l, 475)).toBe(0)
    expect(xToLane(l, 476)).toBe(1)
    expect(xToLane(l, 524)).toBe(2)
    expect(xToLane(l, 572)).toBeNull()
    expect(l.waveX).toBe(428 - 8 - 64)
    expect(l.labelX).toBe(428 + 144 + 8 + 28)
  })
  it('속도 그래프 띠와 라벨 위치', () => {
    const l = layoutTimeline(1000, [{ id: 'Side_L' }, { id: 'Note_1' }, { id: 'T' }])
    expect(l.speedX).toBe(428 + 144 + 8)
    expect(l.labelX).toBe(428 + 144 + 8 + 20 + 8)
  })
  it('변속 칩 문구', () => {
    expect(speedLabel({ tick: 0, speed: 2 })).toBe('×2.0')
    expect(speedLabel({ tick: 960, speed: 3, ease: 'linear' })).toBe('→×3.0')
    expect(speedLabel({ tick: 0, speed: 0 })).toBe('×0 정지')
    expect(speedLabel({ tick: 960, speed: 0, ease: 'linear' })).toBe('×0 정지')
    expect(speedLabel({ tick: 0, speed: 1.25 })).toBe('×1.25')
  })
  it('tick 0 지점은 서서히여도 즉시로 표시 (효과 없음)', () => {
    expect(speedLabel({ tick: 0, speed: 3, ease: 'linear' })).toBe('×3.0')
  })
  it('트랙 폭(고정)과 색', () => {
    expect(TRACK_PX).toBe(48)
    const l = layoutTimeline(1000, [{ id: 'A', color: '#f59e0b' }, { id: 'B' }])
    expect(l.columns.map((c) => c.color)).toEqual(['#f59e0b', '#f2f2f2'])
  })
  it('트랙 이름 줄: 트랙 영역의 위 20px', () => {
    const l = layoutTimeline(1000, basicTracks(4)) // 404~596
    expect(TRACK_NAME_HEIGHT).toBe(20)
    expect(inTrackNameBand(l, 404, 0)).toBe(true)
    expect(inTrackNameBand(l, 595, 19.9)).toBe(true)
    expect(inTrackNameBand(l, 500, 20)).toBe(false)
    // 트랙 밖(파형·라벨 영역)은 이름 줄이 아니다
    expect(inTrackNameBand(l, 403, 10)).toBe(false)
    expect(inTrackNameBand(l, 596, 10)).toBe(false)
  })
  it('트랙 위치 범위의 x 구간: 지금 있는 트랙으로 자르고, 하나도 없으면 null', () => {
    const l = layoutTimeline(1000, basicTracks(4)) // 404, 452, 500, 548 (폭 48)
    expect(laneSpan(l, 1, 2)).toEqual({ x0: 452, x1: 548 })
    // 트랙이 줄어든 뒤의 오래된 범위 (트랙 삭제·Undo 중 사각 선택)
    expect(laneSpan(l, 2, 6)).toEqual({ x0: 500, x1: 596 })
    expect(laneSpan(l, 4, 6)).toBeNull()
    expect(laneSpan(layoutTimeline(1000, []), 0, 0)).toBeNull()
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
