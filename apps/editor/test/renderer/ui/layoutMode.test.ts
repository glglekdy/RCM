import { describe, expect, it } from 'vitest'
import { layoutMode, nextLayoutMode } from '../../../src/renderer/src/ui/layoutMode'

describe('layoutMode', () => {
  it('폰 세로', () => expect(layoutMode(390, 844, false)).toBe('phone-portrait'))
  it('폰 가로', () => expect(layoutMode(844, 390, false)).toBe('phone-landscape'))
  it('정사각형 좁은 창은 세로', () => expect(layoutMode(600, 600, false)).toBe('phone-portrait'))
  it('폭 700 이상 세로는 데스크톱(태블릿)', () =>
    expect(layoutMode(768, 1024, false)).toBe('desktop'))
  it('높이 500 이상 가로는 데스크톱', () => expect(layoutMode(1024, 500, false)).toBe('desktop'))
  it('PC 앱은 늘 데스크톱', () => expect(layoutMode(390, 844, true)).toBe('desktop'))
})

describe('nextLayoutMode', () => {
  it('입력 중 높이만 줄면 모드를 유지한다', () =>
    expect(
      nextLayoutMode('phone-portrait', 360, 360, 340, { pinnedDesktop: false, typing: true })
    ).toBe('phone-portrait'))
  it('입력 중이어도 폭이 바뀌면(회전) 다시 판정한다', () =>
    expect(
      nextLayoutMode('phone-portrait', 390, 844, 390, { pinnedDesktop: false, typing: true })
    ).toBe('phone-landscape'))
  it('입력 중이 아니면 높이 변화로도 다시 판정한다', () =>
    expect(
      nextLayoutMode('phone-portrait', 360, 360, 340, { pinnedDesktop: false, typing: false })
    ).toBe('phone-landscape'))
})
