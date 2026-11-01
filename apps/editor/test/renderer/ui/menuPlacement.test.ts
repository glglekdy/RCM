import { describe, expect, it } from 'vitest'
import { placeMenu } from '../../../src/renderer/src/ui/menuPlacement'

const menu = { width: 160, height: 120 }
const viewport = { width: 400, height: 800 }

describe('placeMenu', () => {
  it('우클릭 메뉴는 누른 점에 바로 띄운다', () => {
    expect(placeMenu(50, 60, menu, viewport)).toEqual({ left: 50, top: 60 })
  })
  it('우클릭 메뉴는 화면 가장자리 안으로 옮긴다', () => {
    expect(placeMenu(390, 790, menu, viewport)).toEqual({ left: 400 - 160 - 8, top: 800 - 120 - 8 })
    expect(placeMenu(-10, -10, menu, viewport)).toEqual({ left: 8, top: 8 })
  })
  it('길게 눌러 띄운 메뉴는 누른 점에서 떨어뜨린다', () => {
    expect(placeMenu(50, 60, menu, viewport, true)).toEqual({ left: 58, top: 68 })
  })
  it('오른쪽 가장자리에서는 왼쪽으로 옮겨도 점 아래에 두어 점을 덮지 않는다', () => {
    expect(placeMenu(390, 100, menu, viewport, true)).toEqual({ left: 400 - 160 - 8, top: 108 })
  })
  it('아래 가장자리에서 점을 덮게 되면 점 위에 둔다', () => {
    expect(placeMenu(390, 790, menu, viewport, true)).toEqual({ left: 400 - 160 - 8, top: 790 - 8 - 120 })
  })
  it('키가 커서 점 위에 들어가지 않는 메뉴도 점을 덮지 않으면 그대로 둔다', () => {
    const tall = { width: 100, height: 700 }
    expect(placeMenu(50, 400, tall, viewport, true)).toEqual({ left: 58, top: 800 - 700 - 8 })
  })
  it('점 위에 들어가지 않고 점을 덮으면 점 왼쪽에 둔다', () => {
    const tall = { width: 100, height: 700 }
    expect(placeMenu(350, 400, tall, viewport, true)).toEqual({ left: 350 - 8 - 100, top: 800 - 700 - 8 })
  })
  it('어디에도 들어가지 않으면 화면 안에만 둔다', () => {
    const huge = { width: 380, height: 780 }
    expect(placeMenu(200, 400, huge, viewport, true)).toEqual({ left: 400 - 380 - 8, top: 800 - 780 - 8 })
  })
})
