import { describe, expect, it } from 'vitest'
import { installNoticeKind, isIos } from '../src/renderer/src/web/pwaStore'

const base = { pc: false, standalone: false, ios: false, canPrompt: false }
describe('installNoticeKind', () => {
  it.each([
    [{ pc: true, canPrompt: true }, null],
    [{ standalone: true, ios: true }, null],
    [{ ios: true }, 'ios'],
    [{ canPrompt: true }, 'prompt'],
    [{}, null]
  ])('%j -> %s', (o, want) => {
    expect(installNoticeKind({ ...base, ...o })).toBe(want)
  })
})
describe('isIos', () => {
  it('detects', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Linux; Android 14)', 5)).toBe(false)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 0)).toBe(false)
  })
})
