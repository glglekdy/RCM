import { describe, expect, it } from 'vitest'
import { Recorder } from '../../../src/renderer/src/editor/input/recorder'

describe('Recorder', () => {
  it('키 반복은 하나의 누름', () => {
    const r = new Recorder(4)
    r.keyDown('KeyD', 100)
    r.keyDown('KeyD', 130)
    r.keyDown('KeyD', 160)
    r.keyUp('KeyD', 900)
    expect(r.finish(1000)).toEqual([{ lane: 0, downMs: 100, upMs: 900 }])
  })
  it('끝날 때 눌려 있던 키', () => {
    const r = new Recorder(4)
    r.keyDown('KeyK', 200)
    expect(r.finish(700)).toEqual([{ lane: 3, downMs: 200, upMs: 700 }])
  })
  it('모두 떼기 (창 포커스를 잃을 때)', () => {
    const r = new Recorder(7)
    r.keyDown('Space', 100)
    r.keyDown('KeyS', 150)
    r.releaseAll(400)
    expect(r.pressed().size).toBe(0)
    r.keyDown('Space', 500)
    expect(r.finish(600)).toEqual([
      { lane: 3, downMs: 100, upMs: 400 },
      { lane: 0, downMs: 150, upMs: 400 },
      { lane: 3, downMs: 500, upMs: 600 }
    ])
  })
  it('레인 키가 아니면 무시', () => {
    const r = new Recorder(4)
    r.keyDown('KeyA', 0)
    r.keyUp('KeyA', 10)
    expect(r.finish(20)).toEqual([])
  })
})
