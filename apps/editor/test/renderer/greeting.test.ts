import { describe, expect, it } from 'vitest'
import { DEFAULT_GREETING, pickGreeting } from '../../src/renderer/src/home/greeting'

describe('pickGreeting', () => {
  it('picks by the random value', () => {
    expect(pickGreeting(['a', 'b', 'c'], null, () => 0)).toBe('a')
    expect(pickGreeting(['a', 'b', 'c'], null, () => 0.99)).toBe('c')
  })

  it('avoids the previous greeting when there are others', () => {
    expect(pickGreeting(['a', 'b'], 'a', () => 0)).toBe('b')
    expect(pickGreeting(['a'], 'a', () => 0)).toBe('a')
  })

  it('skips blank and non-string entries and trims', () => {
    expect(pickGreeting(['  ', 3, null, ' hi '], null, () => 0)).toBe('hi')
  })

  it('falls back to the default when nothing is usable', () => {
    expect(pickGreeting([], null)).toBe(DEFAULT_GREETING)
    expect(pickGreeting({ not: 'a list' }, null)).toBe(DEFAULT_GREETING)
    expect(pickGreeting(['', '   '], null)).toBe(DEFAULT_GREETING)
  })

  it('stays in range when random returns 1', () => {
    expect(pickGreeting(['a', 'b'], null, () => 1)).toBe('b')
  })
})
