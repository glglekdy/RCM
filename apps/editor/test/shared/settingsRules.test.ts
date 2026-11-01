import { describe, expect, it } from 'vitest'
import { SHEET_FILE, frameName, pickedHitEffectOrder } from '../../src/shared/hitEffects'
import { JUDGE_OFFSET_LIMIT, clampJudgeOffset, validateJudgeOffset } from '../../src/shared/settingsRules'

describe('validateJudgeOffset', () => {
  it('한도는 200ms예요', () => {
    expect(JUDGE_OFFSET_LIMIT).toBe(200)
  })

  it.each([0, -200, 200, 15, -37])('%i는 그대로 돌려줘요', (v) => {
    expect(validateJudgeOffset(v)).toBe(v)
  })

  it.each([201, -201, 1.5, '10', Number.NaN, Infinity, null, undefined])('%s는 throw해요', (v) => {
    expect(() => validateJudgeOffset(v)).toThrow('판정 오프셋은 -200~200ms 사이 정수여야 해요')
  })
})

describe('clampJudgeOffset', () => {
  it('범위 안은 반올림', () => expect(clampJudgeOffset(12.6)).toBe(13))
  it('범위 밖은 자른다', () => {
    expect(clampJudgeOffset(500)).toBe(200)
    expect(clampJudgeOffset(-500)).toBe(-200)
  })
  it('숫자가 아니면 0', () => expect(clampJudgeOffset(Number.NaN)).toBe(0))
})

describe('pickedHitEffectOrder / frameName', () => {
  it('시트는 첫 장만, 프레임은 자연 정렬해요', () => {
    expect(pickedHitEffectOrder('sheet', ['b.png', 'a.png'])).toEqual(['b.png'])
    expect(pickedHitEffectOrder('frames', ['f10.png', 'f2.png', 'F1.png'])).toEqual(['F1.png', 'f2.png', 'f10.png'])
  })

  it('프레임 이름은 0001.png부터예요', () => {
    expect(frameName(0)).toBe('0001.png')
    expect(frameName(11)).toBe('0012.png')
    expect(SHEET_FILE).toBe('sheet.png')
  })
})
