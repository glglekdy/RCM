import { describe, expect, it } from 'vitest'
import { noteKey, type Note } from '@rcm/core'
import { d0, withNotes } from '../fixtures'
import { getChart } from '../../../src/renderer/src/editor/state/doc'
import {
  addTrack,
  moveTrack,
  notesOnTrack,
  removeTrack,
  renameTrack,
  updateTrackLook
} from '../../../src/renderer/src/editor/commands/tracks'

const F = 'normal.chart.json'
const tap = (tick: number, track: string): Note => ({ tick, track, type: 'tap' })

describe('track commands', () => {
  it('이름 변경은 노트를 따라가고, Undo하면 되돌아감', () => {
    const base = withNotes(d0, [tap(0, 'Note_1'), tap(0, 'Note_2')])
    const d = renameTrack(base, F, 0, 'Side_L')!
    expect(getChart(d, F).tracks[0]).toEqual({ id: 'Side_L' })
    expect(getChart(d, F).notes.map(noteKey)).toEqual(['Side_L:0', 'Note_2:0'])
    // 이전 문서는 그대로 (Undo 복원 대상)
    expect(getChart(base, F).notes.map(noteKey)).toEqual(['Note_1:0', 'Note_2:0'])
    expect(getChart(base, F).tracks[0]).toEqual({ id: 'Note_1' })
    expect(renameTrack(base, F, 0, 'Note_2')).toBeNull()
    expect(renameTrack(base, F, 0, 'bad id')).toBeNull()
    expect(renameTrack(base, F, 0, 'Note_1')).toBeNull()
  })

  it('이름 변경: 색은 유지', () => {
    const d = updateTrackLook(d0, F, 1, { color: '#f59e0b' })!
    expect(getChart(renameTrack(d, F, 1, 'X')!, F).tracks[1]).toEqual({ id: 'X', color: '#f59e0b' })
  })

  it('순서 변경: 노트는 그대로, 같은 자리는 null', () => {
    const d = moveTrack(d0, F, 0, 3)!
    expect(getChart(d, F).tracks.map((t) => t.id)).toEqual(['Note_2', 'Note_3', 'Note_4', 'Note_1'])
    expect(moveTrack(d0, F, 2, 2)).toBeNull()
  })

  it('순서 변경: 같은 tick 노트는 새 트랙 순서로 정렬', () => {
    const base = withNotes(d0, [tap(0, 'Note_1'), tap(0, 'Note_2')])
    const d = moveTrack(base, F, 0, 3)!
    expect(getChart(d, F).notes.map(noteKey)).toEqual(['Note_2:0', 'Note_1:0'])
  })

  it('삭제: 노트도 삭제, 마지막 트랙 거부', () => {
    const r = removeTrack(withNotes(d0, [tap(0, 'Note_1'), tap(480, 'Note_1'), tap(0, 'Note_2')]), F, 0)!
    expect(r.removed).toBe(2)
    expect(getChart(r.doc, F).tracks.map((t) => t.id)).toEqual(['Note_2', 'Note_3', 'Note_4'])
    expect(getChart(r.doc, F).notes.map(noteKey)).toEqual(['Note_2:0'])
    expect(removeTrack(withNotes(d0, [], 1), F, 0)).toBeNull()
  })

  it('추가와 모양 변경', () => {
    expect(getChart(addTrack(d0, F)!, F).tracks.at(-1)!.id).toBe('Note_5')
    expect(addTrack(withNotes(d0, [], 16), F)).toBeNull()
    expect(getChart(updateTrackLook(d0, F, 0, { color: '#f59e0b' })!, F).tracks[0]).toEqual({
      id: 'Note_1',
      color: '#f59e0b'
    })
    expect(updateTrackLook(d0, F, 0, { color: 'red' })).toBeNull()
  })

  it('모양 변경: 바뀌는 것이 없으면 null (빈 Undo 기록을 만들지 않는다)', () => {
    // 기본값 트랙에 기본값을 지정
    expect(updateTrackLook(d0, F, 0, { color: '#f2f2f2' })).toBeNull()
    expect(updateTrackLook(d0, F, 0, {})).toBeNull()
    const d = updateTrackLook(d0, F, 0, { color: '#f59e0b' })!
    // 이미 지정된 값을 다시 지정 (색은 대소문자 무관)
    expect(updateTrackLook(d, F, 0, { color: '#F59E0B' })).toBeNull()
    // 바뀌면 새 문서
    expect(getChart(updateTrackLook(d, F, 0, { color: '#00ff00' })!, F).tracks[0]).toEqual({
      id: 'Note_1',
      color: '#00ff00'
    })
  })

  it('모양 변경: 기본값으로 되돌리면 필드 삭제, 고치지 않은 필드는 유지', () => {
    const d = updateTrackLook(d0, F, 0, { color: '#f59e0b' })!
    expect(getChart(updateTrackLook(d, F, 0, { color: '#F2F2F2' })!, F).tracks[0]).toEqual({ id: 'Note_1' })
  })

  it('트랙의 노트 수', () => {
    const chart = getChart(withNotes(d0, [tap(0, 'Note_1'), tap(480, 'Note_1'), tap(0, 'Note_2')]), F)
    expect(notesOnTrack(chart, 'Note_1')).toBe(2)
    expect(notesOnTrack(chart, 'Note_4')).toBe(0)
  })
})
