import { describe, expect, it } from 'vitest'
import { PlaybackClock } from '../../../src/renderer/src/editor/audio/playbackClock'

describe('PlaybackClock', () => {
  it('rate 1: 준비 시간은 음수 위치에서 흐른다', () => {
    const c = new PlaybackClock()
    c.start(10, -1500, 1)
    expect(c.positionMs(10)).toBe(-1500)
    expect(c.positionMs(11)).toBe(-500)
    expect(c.ctxTimeAt(0)).toBe(11.5)
  })

  it('rate 2: ctx 1초에 곡 2초', () => {
    const c = new PlaybackClock()
    c.start(10, 0, 2)
    expect(c.positionMs(11)).toBe(2000)
  })

  it('도중에 바꾸면 그 순간 위치가 이어진다', () => {
    const c = new PlaybackClock()
    c.start(10, 0, 2)
    c.setRate(11, 0.5)
    expect(c.positionMs(11)).toBe(2000)
    expect(c.positionMs(13)).toBe(3000)
    expect(c.ctxTimeAt(3000)).toBe(13)
    expect(c.rate).toBe(0.5)
  })

  it('같은 순간에 여러 번 바꿔도 위치가 튀지 않는다', () => {
    const c = new PlaybackClock()
    c.start(0, 0, 1)
    for (const r of [1.1, 1.2, 1.3, 1.4, 1.5]) c.setRate(4, r)
    expect(c.positionMs(4)).toBe(4000)
  })
})
