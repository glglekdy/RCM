import { describe, expect, it } from 'vitest'
import { MAX_STAGGER_INDEX, stagger } from '../../../src/renderer/src/ui/motion'

describe('stagger', () => {
  it('순번을 CSS 변수 --i로 넘긴다', () => {
    expect(stagger(0)).toEqual({ '--i': 0 })
    expect(stagger(3)).toEqual({ '--i': 3 })
  })

  it('긴 목록도 마지막 줄이 너무 늦지 않게 순번을 자른다', () => {
    expect(MAX_STAGGER_INDEX).toBe(12)
    expect(stagger(12)).toEqual({ '--i': 12 })
    expect(stagger(40)).toEqual({ '--i': 12 })
  })

  it('음수나 소수는 0 이상 정수로', () => {
    expect(stagger(-2)).toEqual({ '--i': 0 })
    expect(stagger(2.7)).toEqual({ '--i': 2 })
  })
})
