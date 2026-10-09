import { describe, expect, it } from 'vitest'
import { noteKey, type Note } from '@rcm/core'
import { d0, withNotes } from '../fixtures'
import { getChart } from '../../../src/renderer/src/editor/state/doc'
import {
  addNote,
  copyNotes,
  mirrorNotes,
  moveNotes,
  pasteClip,
  removeNotes
} from '../../../src/renderer/src/editor/commands/notes'

const F = 'normal.chart.json'
const tap = (tick: number, lane: number): Note => ({ tick, lane, type: 'tap' })

describe('note editing commands', () => {
  it('추가: 겹침·범위 거부', () => {
    const d = addNote(d0, F, { tick: 0, lane: 0, type: 'hold', endTick: 960 })!
    expect(addNote(d, F, tap(480, 0))).toBeNull()
    expect(addNote(d, F, tap(480, 1))).not.toBeNull()
    expect(addNote(d0, F, tap(0, 4))).toBeNull()
    expect(addNote(d0, F, tap(-120, 0))).toBeNull()
    expect(addNote(d0, F, { tick: 480, lane: 0, type: 'hold', endTick: 480 })).toBeNull()
  })
  it('추가: 정렬 유지', () => {
    const d = addNote(withNotes(d0, [tap(480, 0)]), F, tap(0, 1))!
    expect(getChart(d, F).notes.map(noteKey)).toEqual(['1:0', '0:480'])
  })
  it('삭제', () => {
    const d = withNotes(d0, [tap(0, 0), tap(480, 0)])
    expect(getChart(removeNotes(d, F, new Set(['0:0']))!, F).notes.map(noteKey)).toEqual(['0:480'])
    expect(removeNotes(d, F, new Set(['3:0']))).toBeNull()
  })
  it('이동: 자기들끼리는 겹침 아님, 음수 tick 거부', () => {
    const d = withNotes(d0, [tap(0, 0), tap(480, 0)])
    const r = moveNotes(d, F, new Set(['0:0', '0:480']), 480, 1)!
    expect([...r.keys].sort()).toEqual(['1:480', '1:960'])
    expect(moveNotes(d, F, new Set(['0:0']), -480, 0)).toBeNull()
    expect(moveNotes(d, F, new Set(['0:0']), 480, 0)).toBeNull()
    expect(moveNotes(d, F, new Set(['0:0']), 0, 4)).toBeNull()
  })
  it('좌우 반전 (7키)', () => {
    const d = withNotes(d0, [tap(0, 0), tap(0, 3)], 7)
    expect(
      getChart(mirrorNotes(d, F, new Set(['0:0', '3:0']))!.doc, F).notes.map(noteKey)
    ).toEqual(['3:0', '6:0'])
  })
  it('좌우 반전: 선택 안 된 노트와 겹치면 거부', () => {
    const d = withNotes(d0, [tap(0, 0), tap(0, 3)])
    expect(mirrorNotes(d, F, new Set(['0:0']))).toBeNull()
  })
  it('복사·붙여넣기는 첫 노트가 재생선 위치', () => {
    const clip = copyNotes(
      getChart(withNotes(d0, [tap(960, 1), tap(1440, 2)]), F),
      new Set(['1:960', '2:1440'])
    )!
    expect(clip.notes.map(noteKey)).toEqual(['1:0', '2:480'])
    const r = pasteClip(d0, F, clip, 1920)!
    expect(getChart(r.doc, F).notes.map(noteKey)).toEqual(['1:1920', '2:2400'])
  })
  it('복사: 롱노트 길이 유지, 빈 선택은 null', () => {
    const d = withNotes(d0, [{ tick: 480, lane: 0, type: 'hold', endTick: 960 }])
    const clip = copyNotes(getChart(d, F), new Set(['0:480']))!
    expect(clip.notes[0]).toEqual({ tick: 0, lane: 0, type: 'hold', endTick: 480 })
    expect(copyNotes(getChart(d, F), new Set())).toBeNull()
  })
  it('붙여넣기: 레인 넘침·겹침 거부', () => {
    expect(pasteClip(d0, F, { notes: [tap(0, 6)] }, 0)).toBeNull()
    expect(pasteClip(withNotes(d0, [tap(0, 0)]), F, { notes: [tap(0, 0)] }, 0)).toBeNull()
  })
})
