import { describe, expect, it } from 'vitest'
import { createGestureRouter, type GestureEffect, type GesturePointer } from '../../../src/renderer/src/editor/timeline/gesture'

const touch = (id: number, x: number, y: number): GesturePointer => ({ id, kind: 'touch', x, y, button: 0, shift: false })
const mouse = (x: number, y: number, button = 0): GesturePointer => ({ id: 1, kind: 'mouse', x, y, button, shift: false })
const types = (effects: GestureEffect[]) => effects.map((e) => e.type)

describe('GestureRouter', () => {
  it('마우스는 바로 도구로 넘긴다', () => {
    const r = createGestureRouter()
    expect(types(r.down(mouse(10, 10), 'draw'))).toEqual(['tool-down'])
    expect(types(r.move(mouse(10, 50)))).toEqual(['tool-move'])
    expect(types(r.up(mouse(10, 50)))).toEqual(['tool-up'])
  })
  it('마우스 오른쪽 버튼은 이동 도구여도 도구로 넘긴다', () => {
    const r = createGestureRouter()
    expect(types(r.down(mouse(10, 10, 2), 'pan'))).toEqual(['tool-down'])
  })
  it('이동 도구의 마우스 왼쪽 끌기는 스크롤이다', () => {
    const r = createGestureRouter()
    expect(r.down(mouse(10, 10), 'pan')).toEqual([])
    expect(r.move(mouse(10, 40))).toEqual([{ type: 'pan', dy: 30 }])
  })
  it('그리기 도구의 한 손가락은 바로 도구로 넘긴다', () => {
    const r = createGestureRouter()
    expect(types(r.down(touch(1, 10, 10), 'draw'))).toEqual(['tool-down'])
    expect(types(r.move(touch(1, 10, 60)))).toEqual(['tool-move'])
    expect(types(r.up(touch(1, 10, 60)))).toEqual(['tool-up'])
  })
  it('이동 도구는 8px까지 움직여도 스크롤하지 않고, 떼면 탭이다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'pan')
    expect(r.move(touch(1, 10, 18))).toEqual([])
    expect(r.up(touch(1, 10, 18))).toEqual([{ type: 'tap', x: 10, y: 18 }])
  })
  it('이동 도구로 8px 넘게 끌면 누른 곳부터 스크롤한다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'pan')
    expect(r.move(touch(1, 10, 30))).toEqual([{ type: 'pan', dy: 20 }])
    expect(r.move(touch(1, 10, 25))).toEqual([{ type: 'pan', dy: -5 }])
    expect(r.up(touch(1, 10, 25))).toEqual([])
  })
  it('두 번째 손가락이 오면 도구를 취소하고 핀치로 바뀐다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 100, 100), 'draw')
    expect(types(r.down(touch(2, 100, 200), 'draw'))).toEqual(['tool-cancel'])
    expect(r.move(touch(2, 100, 300))).toEqual([
      { type: 'pan', dy: 50 },
      { type: 'zoom', scale: 2, anchorY: 200 }
    ])
  })
  it('핀치 중 한 손가락을 떼면 남은 손가락은 아무 일도 하지 않는다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 100, 100), 'draw')
    r.down(touch(2, 100, 200), 'draw')
    expect(r.up(touch(2, 100, 200))).toEqual([])
    expect(r.move(touch(1, 100, 150))).toEqual([])
    expect(r.up(touch(1, 100, 150))).toEqual([])
    expect(r.active).toBe(false)
  })
  it('세 번째 손가락은 무시한다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 100, 100), 'draw')
    r.down(touch(2, 100, 200), 'draw')
    expect(r.down(touch(3, 50, 50), 'draw')).toEqual([])
    expect(r.move(touch(3, 50, 90))).toEqual([])
  })
  it('선택 도구로 길게 누르면 도구를 취소하고 메뉴를 연다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'select')
    r.move(touch(1, 14, 13))
    expect(r.longPress(1)).toEqual([{ type: 'tool-cancel' }, { type: 'long-press', x: 14, y: 13 }])
    expect(r.move(touch(1, 60, 60))).toEqual([])
    expect(r.up(touch(1, 60, 60))).toEqual([])
  })
  it('이동 도구로 길게 누르면 메뉴를 연다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'pan')
    expect(r.longPress(1)).toEqual([{ type: 'long-press', x: 10, y: 10 }])
    expect(r.up(touch(1, 10, 10))).toEqual([])
  })
  it('8px 넘게 움직인 뒤에는 길게 누르기가 아니다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'select')
    r.move(touch(1, 10, 30))
    expect(r.longPress(1)).toEqual([])
  })
  it('그리기 도구에는 길게 누르기가 없다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'draw')
    expect(r.longPress(1)).toEqual([])
  })
  it('이미 뗀 손가락의 길게 누르기는 무시한다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'pan')
    r.up(touch(1, 10, 10))
    expect(r.longPress(1)).toEqual([])
  })
  it('도구로 넘기던 포인터가 취소되면 도구를 취소한다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'draw')
    expect(r.cancel(1)).toEqual([{ type: 'tool-cancel' }])
    expect(r.active).toBe(false)
  })
  it('마우스를 누른 중의 터치는 무시한다', () => {
    const r = createGestureRouter()
    r.down(mouse(10, 10), 'draw')
    expect(r.down(touch(5, 50, 50), 'draw')).toEqual([])
  })
  it('터치로 누른 뒤에는 contextmenu를 막는다', () => {
    const r = createGestureRouter()
    r.down(touch(1, 10, 10), 'select')
    expect(r.allowsContextMenu()).toBe(false)
    r.up(touch(1, 10, 10))
    r.down(mouse(10, 10, 2), 'select')
    expect(r.allowsContextMenu()).toBe(true)
  })
})
