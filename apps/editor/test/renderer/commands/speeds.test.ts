import { describe, expect, it } from 'vitest'
import { ScrollMap, TimingMap } from '@rcm/core'
import {
  addSpeedPoint,
  defaultSpeedAt,
  removeSpeedPoint,
  updateSpeedPoint
} from '../../../src/renderer/src/editor/commands/speeds'
import { getChart, type ProjectDoc } from '../../../src/renderer/src/editor/state/doc'
import { d0, withNotes } from '../fixtures'

const F = 'normal.chart.json'
const speeds = (d: ProjectDoc) => getChart(d, F).speeds

describe('speed commands', () => {
  it('추가: 정렬, 중복·범위 거부', () => {
    let d = addSpeedPoint(d0, F, 1920, 2)!
    d = addSpeedPoint(d, F, 960, 0)!
    expect(speeds(d)).toEqual([
      { tick: 960, speed: 0 },
      { tick: 1920, speed: 2 }
    ])
    expect(addSpeedPoint(d, F, 960, 3)).toBeNull()
    expect(addSpeedPoint(d0, F, 0, 25)).toBeNull()
    expect(addSpeedPoint(d0, F, 0, -1)).toBeNull()
    expect(addSpeedPoint(d0, F, -480, 1)).toBeNull()
    expect(addSpeedPoint(d0, F, 1.5, 1)).toBeNull()
  })

  it('수정: 배율·방식, instant는 필드 삭제, 변화 없거나 범위 밖이면 null', () => {
    const d = addSpeedPoint(d0, F, 960, 2)!
    const lin = updateSpeedPoint(d, F, 0, { ease: 'linear' })!
    expect(speeds(lin)).toEqual([{ tick: 960, speed: 2, ease: 'linear' }])
    expect(speeds(updateSpeedPoint(lin, F, 0, { ease: 'instant' })!)).toEqual([{ tick: 960, speed: 2 }])
    expect(updateSpeedPoint(d, F, 0, { speed: 2 })).toBeNull()
    expect(updateSpeedPoint(d, F, 0, { speed: 25 })).toBeNull()
    expect(updateSpeedPoint(d, F, 0, { speed: -1 })).toBeNull()
    expect(updateSpeedPoint(d, F, 5, { speed: 1 })).toBeNull()
    expect(updateSpeedPoint(d, F, 0, { ease: 'bogus' as never })).toBeNull()
  })

  it('삭제: 마지막 하나면 필드 제거', () => {
    const d = addSpeedPoint(d0, F, 960, 2)!
    const r = removeSpeedPoint(d, F, 0)!
    expect('speeds' in getChart(r, F)).toBe(false)
    expect(removeSpeedPoint(d0, F, 0)).toBeNull()
  })

  it('추가할 때 기본 배율 = 그 위치의 현재 속도', () => {
    const tm = new TimingMap(d0.song.timing, d0.song.offsetMs)
    const d = addSpeedPoint(
      updateSpeedPoint(addSpeedPoint(d0, F, 1920, 3)!, F, 0, { ease: 'linear' })!,
      F,
      0,
      1
    )!
    expect(defaultSpeedAt(getChart(d, F), tm, 960)).toBe(2)
    expect(defaultSpeedAt(getChart(d0, F), tm, 960)).toBe(1)
  })

  it('서서히 구간 안에 추가하면 linear로 나눠 재생이 바뀌지 않는다', () => {
    const tm = new TimingMap(d0.song.timing, d0.song.offsetMs)
    // A(0, ×1) + B(1920, ×3, 서서히)
    const before = updateSpeedPoint(addSpeedPoint(addSpeedPoint(d0, F, 0, 1)!, F, 1920, 3)!, F, 1, {
      ease: 'linear'
    })!
    const after = addSpeedPoint(before, F, 960, defaultSpeedAt(getChart(before, F), tm, 960))!
    expect(speeds(after)).toEqual([
      { tick: 0, speed: 1 },
      { tick: 960, speed: 2, ease: 'linear' },
      { tick: 1920, speed: 3, ease: 'linear' }
    ])
    const a = new ScrollMap(speeds(before), tm)
    const b = new ScrollMap(speeds(after), tm)
    for (let ms = 0; ms <= 3000; ms += 50) {
      expect(b.positionAt(ms)).toBeCloseTo(a.positionAt(ms))
    }
  })

  it('다음 지점이 즉시면 즉시로 추가 (ease 필드 없음)', () => {
    const d = addSpeedPoint(addSpeedPoint(d0, F, 1920, 3)!, F, 960, 2)!
    expect(speeds(d)).toEqual([
      { tick: 960, speed: 2 },
      { tick: 1920, speed: 3 }
    ])
  })

  it('tick 0에는 다음 지점이 서서히여도 즉시로 추가 (효과 없음)', () => {
    const d = updateSpeedPoint(addSpeedPoint(d0, F, 1920, 3)!, F, 0, { ease: 'linear' })!
    expect(speeds(addSpeedPoint(d, F, 0, 1)!)![0]).toEqual({ tick: 0, speed: 1 })
  })

  it('노트·트랙은 그대로 (속도만 바뀜)', () => {
    const base = withNotes(d0, [{ tick: 0, track: 'Note_1', type: 'tap' }])
    const d = addSpeedPoint(base, F, 960, 2)!
    expect(getChart(d, F).notes).toBe(getChart(base, F).notes)
    expect(getChart(d, F).tracks).toBe(getChart(base, F).tracks)
  })
})
