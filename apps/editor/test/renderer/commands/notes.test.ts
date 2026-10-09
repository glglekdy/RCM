import { describe, expect, it } from 'vitest'
import { basicTracks, noteKey, type Note } from '@rcm/core'
import { d0, withNotes } from '../fixtures'
import { getChart, replaceChart } from '../../../src/renderer/src/editor/state/doc'
import {
  addNote,
  copyNotes,
  mirrorNotes,
  moveNotes,
  pasteClip,
  removeNotes
} from '../../../src/renderer/src/editor/commands/notes'

const F = 'normal.chart.json'
const tap = (tick: number, track: string): Note => ({ tick, track, type: 'tap' })

describe('note editing commands', () => {
  it('추가: 겹침·범위 거부', () => {
    const d = addNote(d0, F, { tick: 0, track: 'Note_1', type: 'hold', endTick: 960 })!
    expect(addNote(d, F, tap(480, 'Note_1'))).toBeNull()
    expect(addNote(d, F, tap(480, 'Note_2'))).not.toBeNull()
    expect(addNote(d0, F, tap(0, 'Note_5'))).toBeNull()
    expect(addNote(d0, F, tap(-120, 'Note_1'))).toBeNull()
    expect(addNote(d0, F, { tick: 480, track: 'Note_1', type: 'hold', endTick: 480 })).toBeNull()
  })
  it('추가: 정렬 유지', () => {
    const d = addNote(withNotes(d0, [tap(480, 'Note_1')]), F, tap(0, 'Note_2'))!
    expect(getChart(d, F).notes.map(noteKey)).toEqual(['Note_2:0', 'Note_1:480'])
  })
  it('추가: 같은 tick은 트랙 순서로 정렬', () => {
    const d = addNote(withNotes(d0, [tap(0, 'Note_3')]), F, tap(0, 'Note_1'))!
    expect(getChart(d, F).notes.map(noteKey)).toEqual(['Note_1:0', 'Note_3:0'])
  })
  it('삭제', () => {
    const d = withNotes(d0, [tap(0, 'Note_1'), tap(480, 'Note_1')])
    expect(getChart(removeNotes(d, F, new Set(['Note_1:0']))!, F).notes.map(noteKey)).toEqual([
      'Note_1:480'
    ])
    expect(removeNotes(d, F, new Set(['Note_4:0']))).toBeNull()
  })
  it('이동: 자기들끼리는 겹침 아님, 음수 tick 거부', () => {
    const d = withNotes(d0, [tap(0, 'Note_1'), tap(480, 'Note_1')])
    const r = moveNotes(d, F, new Set(['Note_1:0', 'Note_1:480']), 480, 1)!
    expect([...r.keys].sort()).toEqual(['Note_2:480', 'Note_2:960'])
    expect(moveNotes(d, F, new Set(['Note_1:0']), -480, 0)).toBeNull()
    expect(moveNotes(d, F, new Set(['Note_1:0']), 480, 0)).toBeNull()
    expect(moveNotes(d, F, new Set(['Note_1:0']), 0, 4)).toBeNull()
  })
  it('이동: 트랙 범위 밖이면 거부', () => {
    const d = withNotes(d0, [tap(0, 'Note_4')])
    expect(moveNotes(d, F, new Set(['Note_4:0']), 0, 1)).toBeNull()
    expect([...moveNotes(d, F, new Set(['Note_4:0']), 0, -3)!.keys]).toEqual(['Note_1:0'])
  })
  it('좌우 반전 (7키)', () => {
    const d = withNotes(d0, [tap(0, 'Note_1'), tap(0, 'Note_4')], 7)
    expect(
      getChart(mirrorNotes(d, F, new Set(['Note_1:0', 'Note_4:0']))!.doc, F).notes.map(noteKey)
    ).toEqual(['Note_4:0', 'Note_7:0'])
  })
  it('8트랙 반전: 사이드끼리 교체', () => {
    const tracks = [{ id: 'Side_L' }, ...basicTracks(6), { id: 'Side_R' }]
    const d = replaceChart(d0, F, {
      ...getChart(d0, F),
      tracks,
      notes: [tap(0, 'Side_L'), tap(0, 'Note_2')]
    })
    expect(
      getChart(mirrorNotes(d, F, new Set(['Side_L:0', 'Note_2:0']))!.doc, F)
        .notes.map(noteKey)
        .sort()
    ).toEqual(['Note_5:0', 'Side_R:0'])
  })
  it('좌우 반전: 선택 안 된 노트와 겹치면 거부', () => {
    const d = withNotes(d0, [tap(0, 'Note_1'), tap(0, 'Note_4')])
    expect(mirrorNotes(d, F, new Set(['Note_1:0']))).toBeNull()
  })
  it('복사·붙여넣기는 첫 노트가 재생선 위치', () => {
    const clip = copyNotes(
      getChart(withNotes(d0, [tap(960, 'Note_2'), tap(1440, 'Note_3')]), F),
      new Set(['Note_2:960', 'Note_3:1440'])
    )!
    expect(clip.notes.map(noteKey)).toEqual(['Note_2:0', 'Note_3:480'])
    const r = pasteClip(d0, F, clip, 1920)!
    expect(getChart(r.doc, F).notes.map(noteKey)).toEqual(['Note_2:1920', 'Note_3:2400'])
  })
  it('복사: 롱노트 길이 유지, 빈 선택은 null', () => {
    const d = withNotes(d0, [{ tick: 480, track: 'Note_1', type: 'hold', endTick: 960 }])
    const clip = copyNotes(getChart(d, F), new Set(['Note_1:480']))!
    expect(clip.notes[0]).toEqual({ tick: 0, track: 'Note_1', type: 'hold', endTick: 480 })
    expect(copyNotes(getChart(d, F), new Set())).toBeNull()
  })
  it('붙여넣기: 없는 트랙·겹침 거부', () => {
    expect(pasteClip(d0, F, { notes: [tap(0, 'Note_7')] }, 0)).toBeNull()
    expect(pasteClip(withNotes(d0, [tap(0, 'Note_1')]), F, { notes: [tap(0, 'Note_1')] }, 0)).toBeNull()
  })
  it('다른 트랙 구성으로 붙여넣기 거부', () => {
    expect(pasteClip(d0, F, { notes: [tap(0, 'Side_L'), tap(0, 'Note_1')] }, 0)).toBeNull()
    expect(getChart(d0, F).notes).toEqual([])
  })
})
