import { describe, expect, it } from 'vitest'
import { TimingMap, basicTracks, type Note } from '@rcm/core'
import {
  hitTestNote,
  notesInRect,
  pointerToCell
} from '../../../src/renderer/src/editor/timeline/hitTest'
import { layoutTimeline } from '../../../src/renderer/src/editor/timeline/view'

describe('timeline hit-test', () => {
  const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0) // 1 tick = 500/480 ms
  const view = { playheadMs: 0, pxPerMs: 0.48, height: 800 } // 480 tick = 240px
  const layout = layoutTimeline(1000, basicTracks(4)) // tracksX 404

  it('포인터 → 셀', () => {
    expect(pointerToCell(tm, view, layout, 410, 600, 4)).toEqual({ lane: 0, track: 'Note_1', tick: 0 })
    expect(pointerToCell(tm, view, layout, 460, 600 - 230, 4)).toEqual({ lane: 1, track: 'Note_2', tick: 480 })
    // tick 0보다 반 칸 이내 아래(−200 tick, 1/4 한 칸 = 480)는 스냅하면 0이다
    expect(pointerToCell(tm, view, layout, 460, 700, 4)).toEqual({ lane: 1, track: 'Note_2', tick: 0 })
    expect(pointerToCell(tm, view, layout, 100, 600, 4)).toBeNull()
  })

  it('스냅하면 tick 0보다 앞이 되는 곳은 셀이 없다 (0에 놓지 않는다)', () => {
    // y 900 = −625ms = −600 tick → 1/4 스냅 −480
    expect(pointerToCell(tm, view, layout, 460, 900, 4)).toBeNull()
    // 1/16(한 칸 120 tick): y 620 = −40 tick → 0, y 640 = −80 tick → −120
    expect(pointerToCell(tm, view, layout, 460, 620, 16)).toEqual({ lane: 1, track: 'Note_2', tick: 0 })
    expect(pointerToCell(tm, view, layout, 460, 640, 16)).toBeNull()
  })

  it('노트 hit-test', () => {
    const notes: Note[] = [
      { tick: 0, track: 'Note_1', type: 'hold', endTick: 960 },
      { tick: 480, track: 'Note_2', type: 'tap' }
    ]
    expect(hitTestNote(notes, tm, view, layout, 410, 604)).toBe(notes[0]) // 머리
    expect(hitTestNote(notes, tm, view, layout, 410, 600 - 300)).toBe(notes[0]) // 몸통
    expect(hitTestNote(notes, tm, view, layout, 460, 600 - 240 + 4)).toBe(notes[1])
    expect(hitTestNote(notes, tm, view, layout, 460, 600 - 240 + 8)).toBeNull()
  })

  it('롱노트 몸통은 그려진 대로 끝 위쪽 반 노트 높이까지 맞는다', () => {
    const notes: Note[] = [{ tick: 0, track: 'Note_1', type: 'hold', endTick: 960 }] // 끝 y = 120
    expect(hitTestNote(notes, tm, view, layout, 410, 120 - 4)).toBe(notes[0])
    expect(hitTestNote(notes, tm, view, layout, 410, 120 - 6)).toBeNull()
  })

  it('겹쳐 보이면 tick이 큰 노트', () => {
    // 확대를 줄이면 1/32 간격(60 tick = 30px → 7.5px)의 두 tap이 겹친다
    const far = { ...view, pxPerMs: 0.12 }
    const notes: Note[] = [
      { tick: 60, track: 'Note_1', type: 'tap' },
      { tick: 0, track: 'Note_1', type: 'tap' }
    ]
    expect(hitTestNote(notes, tm, far, layout, 410, 600 - 4)).toBe(notes[0])
  })

  it('트랙 두 개: 열 위치로 트랙을 찾는다', () => {
    const side = layoutTimeline(1000, [{ id: 'Side_L' }, { id: 'Note_1' }]) // 452~500, 500~548
    const notes: Note[] = [
      { tick: 0, track: 'Side_L', type: 'tap' },
      { tick: 0, track: 'Note_1', type: 'tap' }
    ]
    expect(pointerToCell(tm, view, side, 495, 600, 4)).toEqual({ lane: 0, track: 'Side_L', tick: 0 })
    expect(hitTestNote(notes, tm, view, side, 495, 600)).toBe(notes[0])
    expect(hitTestNote(notes, tm, view, side, 505, 600)).toBe(notes[1])
  })
})

describe('notesInRect', () => {
  it('사각 선택은 머리 기준', () => {
    const notes: Note[] = [
      { tick: 0, track: 'Note_1', type: 'hold', endTick: 1920 },
      { tick: 480, track: 'Note_3', type: 'tap' },
      { tick: 960, track: 'Note_4', type: 'tap' }
    ]
    const tracks = basicTracks(4)
    expect(notesInRect(notes, tracks, 3, 1, 960, 240)).toEqual(new Set(['Note_3:480', 'Note_4:960']))
    expect(notesInRect(notes, tracks, 0, 0, 480, 1920)).toEqual(new Set())
  })
})
