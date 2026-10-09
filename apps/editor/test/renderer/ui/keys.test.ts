import { describe, expect, it } from 'vitest'
import { isSubmitEnter } from '../../../src/renderer/src/ui/keys'

const ev = (key: string, isComposing = false, keyCode = key === 'Enter' ? 13 : 0) => ({
  key,
  keyCode,
  nativeEvent: { isComposing }
})

describe('isSubmitEnter', () => {
  it('보통 Enter는 제출', () => expect(isSubmitEnter(ev('Enter'))).toBe(true))
  it('다른 키는 제출 아님', () => expect(isSubmitEnter(ev('a'))).toBe(false))
  it('한글 조합 중 Enter(isComposing)는 무시', () =>
    expect(isSubmitEnter(ev('Enter', true))).toBe(false))
  it('IME 처리 중 keyCode 229는 무시', () => expect(isSubmitEnter(ev('Enter', false, 229))).toBe(false))
})
