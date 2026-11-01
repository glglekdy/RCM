import { describe, expect, it } from 'vitest'
import { sheetHeightPx, stageAfterDrag } from '../../../src/renderer/src/ui/sheetStage'

describe('stageAfterDrag', () => {
  it('반 열린 시트를 많이 내리면 닫힌다', () => expect(stageAfterDrag('half', 300, 1000)).toBe('closed'))
  it('반 열린 시트를 조금 내리면 그대로', () => expect(stageAfterDrag('half', 200, 1000)).toBe('half'))
  it('반 열린 시트를 많이 올리면 끝까지', () => expect(stageAfterDrag('half', -300, 1000)).toBe('full'))
  it('끝까지 연 시트를 조금 내리면 그대로', () => expect(stageAfterDrag('full', 100, 1000)).toBe('full'))
  it('닫힌 시트를 올리면 반', () => expect(stageAfterDrag('closed', -400, 1000)).toBe('half'))
  it('끌기 범위를 넘어도 단계 안에 머문다', () => expect(stageAfterDrag('full', -500, 1000)).toBe('full'))
  it('같은 거리면 작은 쪽', () => expect(stageAfterDrag('half', 250, 1000)).toBe('closed'))
})

describe('sheetHeightPx', () => {
  it('높이', () =>
    expect([sheetHeightPx('closed', 801), sheetHeightPx('half', 801), sheetHeightPx('full', 801)]).toEqual([
      0, 401, 801
    ]))
})
