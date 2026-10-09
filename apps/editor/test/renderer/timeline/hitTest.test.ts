import { describe, expect, it } from 'vitest'
import { TimingMap, type Note } from '@rcm/core'
import { hitTestNote, pointerToCell } from '../../../src/renderer/src/editor/timeline/hitTest'
import { layoutTimeline } from '../../../src/renderer/src/editor/timeline/view'

describe('timeline hit-test', () => {
  const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0) // 1 tick = 500/480 ms
  const view = { playheadMs: 0, pxPerMs: 0.48, height: 800 } // 480 tick = 240px
  const layout = layoutTimeline(1000, 4) // lanesX 404

  it('포인터 → 셀', () => {
    expect(pointerToCell(tm, view, layout, 410, 600, 4)).toEqual({ lane: 0, tick: 0 })
    expect(pointerToCell(tm, view, layout, 460, 600 - 230, 4)).toEqual({ lane: 1, tick: 480 })
    expect(pointerToCell(tm, view, layout, 460, 700, 4)).toEqual({ lane: 1, tick: 0 }) // 음수는 0
    expect(pointerToCell(tm, view, layout, 100, 600, 4)).toBeNull()
  })

  it('노트 hit-test', () => {
    const notes: Note[] = [
      { tick: 0, lane: 0, type: 'hold', endTick: 960 },
      { tick: 480, lane: 1, type: 'tap' }
    ]
    expect(hitTestNote(notes, tm, view, layout, 410, 604)).toBe(notes[0]) // 머리
    expect(hitTestNote(notes, tm, view, layout, 410, 600 - 300)).toBe(notes[0]) // 몸통
    expect(hitTestNote(notes, tm, view, layout, 460, 600 - 240 + 4)).toBe(notes[1])
    expect(hitTestNote(notes, tm, view, layout, 460, 600 - 240 + 8)).toBeNull()
  })

  it('겹쳐 보이면 tick이 큰 노트', () => {
    // 확대를 줄이면 1/32 간격(60 tick = 30px → 7.5px)의 두 tap이 겹친다
    const far = { ...view, pxPerMs: 0.12 }
    const notes: Note[] = [
      { tick: 60, lane: 0, type: 'tap' },
      { tick: 0, lane: 0, type: 'tap' }
    ]
    expect(hitTestNote(notes, tm, far, layout, 410, 600 - 4)).toBe(notes[0])
  })
})
