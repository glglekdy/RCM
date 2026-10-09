import { describe, expect, it } from 'vitest'
import { TimingMap, type Note } from '@rcm/core'
import {
  hitTestNote,
  notesInRect,
  pointerToCell
} from '../../../src/renderer/src/editor/timeline/hitTest'
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

  it('롱노트 몸통은 그려진 대로 끝 위쪽 반 노트 높이까지 맞는다', () => {
    const notes: Note[] = [{ tick: 0, lane: 0, type: 'hold', endTick: 960 }] // 끝 y = 120
    expect(hitTestNote(notes, tm, view, layout, 410, 120 - 4)).toBe(notes[0])
    expect(hitTestNote(notes, tm, view, layout, 410, 120 - 6)).toBeNull()
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

describe('notesInRect', () => {
  it('사각 선택은 머리 기준', () => {
    const notes: Note[] = [
      { tick: 0, lane: 0, type: 'hold', endTick: 1920 },
      { tick: 480, lane: 2, type: 'tap' },
      { tick: 960, lane: 3, type: 'tap' }
    ]
    expect(notesInRect(notes, 3, 1, 960, 240)).toEqual(new Set(['2:480', '3:960']))
    expect(notesInRect(notes, 0, 0, 480, 1920)).toEqual(new Set())
  })
})
