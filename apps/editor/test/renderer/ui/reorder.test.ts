import { describe, expect, it } from 'vitest'
import { dropSlot, moveIndex, slotToIndex } from '../../../src/renderer/src/ui/reorder'

describe('reorder', () => {
  it('moveIndex', () => {
    expect(moveIndex(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveIndex(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveIndex(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })

  it('moveIndex는 원래 목록을 바꾸지 않음', () => {
    const list = Object.freeze(['a', 'b', 'c'])
    expect(moveIndex(list, 2, 0)).toEqual(['c', 'a', 'b'])
    expect(list).toEqual(['a', 'b', 'c'])
  })

  it('dropSlot / slotToIndex', () => {
    expect(dropSlot(100 + 17, 100, 36, 4)).toBe(0)
    expect(dropSlot(100 + 19, 100, 36, 4)).toBe(1)
    expect(dropSlot(100 + 999, 100, 36, 4)).toBe(4)
    expect(dropSlot(50, 100, 36, 4)).toBe(0)
    expect(slotToIndex(0, 3)).toBe(2)
    expect(slotToIndex(3, 0)).toBe(0)
  })

  it('놓을 칸을 옮길 위치로 바꾸면 moveIndex 결과가 그 칸에 놓인 순서', () => {
    // 'a'(0)를 c와 d 사이(칸 3)에 놓기
    expect(moveIndex(['a', 'b', 'c', 'd'], 0, slotToIndex(0, 3))).toEqual(['b', 'c', 'a', 'd'])
    // 바로 아래 칸(1)에 놓으면 제자리
    expect(slotToIndex(0, 1)).toBe(0)
    expect(slotToIndex(2, 2)).toBe(2)
  })
})
