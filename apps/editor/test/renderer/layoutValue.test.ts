import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT } from '@rcm/playfield'
import { withLayoutValue } from '../../src/renderer/src/gameplay/layoutValue'

describe('게임플레이 설정 숫자 입력', () => {
  it('범위 밖 값은 되돌리지 않고 범위로 자른다', () => {
    expect(withLayoutValue(DEFAULT_LAYOUT, 'laneWidth', 250).laneWidth).toBe(200)
    expect(withLayoutValue(DEFAULT_LAYOUT, 'judgeLineFromBottom', -5).judgeLineFromBottom).toBe(0)
    expect(withLayoutValue(DEFAULT_LAYOUT, 'noteHeight', 20.6).noteHeight).toBe(21)
  })
  it('다른 값은 그대로', () => {
    const next = withLayoutValue({ ...DEFAULT_LAYOUT, noteShape: 'circle' }, 'laneWidth', 80)
    expect(next).toEqual({ ...DEFAULT_LAYOUT, noteShape: 'circle', laneWidth: 80 })
  })
})
