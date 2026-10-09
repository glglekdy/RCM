import { describe, expect, it } from 'vitest'
import { History } from '../../../src/renderer/src/editor/state/history'
import { d0 } from '../fixtures'

const d1 = { ...d0, song: { ...d0.song, title: '1' } }
const d2 = { ...d0, song: { ...d0.song, title: '2' } }
const d3 = { ...d0, song: { ...d0.song, title: '3' } }

describe('History', () => {
  it('undo/redo, 새 commit은 redo 삭제', () => {
    const h = new History()
    h.commit({ label: 'a', before: d0, after: d1 })
    h.commit({ label: 'b', before: d1, after: d2 })
    expect(h.undo()!.before).toBe(d1)
    expect(h.canRedo).toBe(true)
    h.commit({ label: 'c', before: d1, after: d3 })
    expect(h.canRedo).toBe(false)
  })
  it('최대 개수', () => {
    const h = new History(2)
    ;['a', 'b', 'c'].forEach((label) => h.commit({ label, before: d0, after: d0 }))
    expect(h.undo()!.label).toBe('c')
    expect(h.undo()!.label).toBe('b')
    expect(h.undo()).toBeNull()
  })
})
