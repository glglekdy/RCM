import { describe, expect, it } from 'vitest'
import { Recorder } from '../../../src/renderer/src/editor/input/recorder'

const keys4 = (): Map<string, string[]> =>
  new Map([
    ['Note_1', ['KeyD']],
    ['Note_2', ['KeyF']],
    ['Note_3', ['KeyJ']],
    ['Note_4', ['KeyK']]
  ])

describe('Recorder', () => {
  it('키 반복은 하나의 누름', () => {
    const r = new Recorder(keys4())
    r.keyDown('KeyD', 100)
    r.keyDown('KeyD', 130)
    r.keyDown('KeyD', 160)
    r.keyUp('KeyD', 900)
    expect(r.finish(1000)).toEqual([{ track: 'Note_1', downMs: 100, upMs: 900 }])
  })
  it('키 반복은 하나의 누름, 트랙 id로 기록', () => {
    const r = new Recorder(new Map([['Note_1', ['KeyD']], ['Side_L', ['ShiftLeft']]]))
    r.keyDown('ShiftLeft', 100)
    r.keyDown('ShiftLeft', 130)
    r.keyUp('ShiftLeft', 900)
    expect(r.finish(1000)).toEqual([{ track: 'Side_L', downMs: 100, upMs: 900 }])
  })
  it('끝날 때 눌려 있던 키', () => {
    const r = new Recorder(keys4())
    r.keyDown('KeyK', 200)
    expect(r.pressed()).toEqual(new Map([['Note_4', 200]]))
    expect(r.finish(700)).toEqual([{ track: 'Note_4', downMs: 200, upMs: 700 }])
  })
  it('모두 떼기 (창 포커스를 잃을 때)', () => {
    const r = new Recorder(
      new Map([
        ['Note_1', ['KeyS']],
        ['Note_4', ['Space']]
      ])
    )
    r.keyDown('Space', 100)
    r.keyDown('KeyS', 150)
    r.releaseAll(400)
    expect(r.pressed().size).toBe(0)
    r.keyDown('Space', 500)
    expect(r.finish(600)).toEqual([
      { track: 'Note_4', downMs: 100, upMs: 400 },
      { track: 'Note_1', downMs: 150, upMs: 400 },
      { track: 'Note_4', downMs: 500, upMs: 600 }
    ])
  })
  it('트랙 키가 아니면 무시 (키 없는 트랙 포함)', () => {
    const r = new Recorder(new Map([['Note_1', ['KeyD']], ['Note_2', []]]))
    r.keyDown('KeyA', 0)
    r.keyUp('KeyA', 10)
    expect(r.finish(20)).toEqual([])
  })
  it('보조 키: 어느 키로든 누르고, 두 키를 모두 떼야 한 번의 누름이 끝난다', () => {
    const r = new Recorder(new Map([['Note_3', ['Space', 'KeyB']]]))
    r.keyDown('KeyB', 100)
    r.keyUp('KeyB', 200)
    r.keyDown('Space', 300)
    r.keyDown('KeyB', 350)
    r.keyUp('Space', 400)
    expect(r.pressed()).toEqual(new Map([['Note_3', 300]]))
    r.keyUp('KeyB', 500)
    expect(r.finish(600)).toEqual([
      { track: 'Note_3', downMs: 100, upMs: 200 },
      { track: 'Note_3', downMs: 300, upMs: 500 }
    ])
  })
})
