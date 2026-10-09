import { describe, it, expect } from 'vitest'
import { touchRecent } from '../../src/main/project/settings'

describe('settings', () => {
  it('최근 목록', () => {
    const list = Array.from({ length: 20 }, (_, i) => ({ dir: `d${i}`, lastOpened: i }))
    const next = touchRecent(list, 'd5', 100)
    expect(next[0]).toEqual({ dir: 'd5', lastOpened: 100 })
    expect(next.filter((e) => e.dir === 'd5')).toHaveLength(1)
    expect(touchRecent(list, 'new', 100)).toHaveLength(20)
  })
})
