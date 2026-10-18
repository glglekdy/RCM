import { describe, expect, it } from 'vitest'
import { TimingMap, basicTracks } from '@rcm/core'
import { d0, withNotes } from '../fixtures'
import { addChart } from '../../../src/renderer/src/editor/commands/charts'
import {
  applyRecording,
  mergeRecorded,
  quantizePresses,
  recordingMessage
} from '../../../src/renderer/src/editor/commands/record'
import { getLaneChart } from '../../../src/renderer/src/editor/state/doc'

// d0: 120 BPM, offset 0 → 1 tick = 500/480 ms, 1/16 한 칸 = 120 tick = 125ms
const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0)

describe('recording commands', () => {
  it('스냅 정렬, 짧으면 tap, 한 칸 이상이면 hold', () => {
    expect(quantizePresses([{ track: 'Note_1', downMs: 510, upMs: 560 }], tm, 16).notes).toEqual([
      { tick: 480, track: 'Note_1', type: 'tap' }
    ])
    expect(quantizePresses([{ track: 'Note_2', downMs: 500, upMs: 1000 }], tm, 16).notes).toEqual([
      { tick: 480, track: 'Note_2', type: 'hold', endTick: 960 }
    ])
  })
  it('음수 tick 버리고 개수를 셈', () => {
    const presses = [
      { track: 'Note_1', downMs: -300, upMs: -250 },
      { track: 'Note_2', downMs: -600, upMs: -100 },
      { track: 'Note_3', downMs: -50, upMs: 0 } // 0으로 정렬되어 남는다
    ]
    expect(quantizePresses(presses, tm, 16)).toEqual({
      notes: [{ tick: 0, track: 'Note_3', type: 'tap' }],
      early: 2
    })
    const r = applyRecording(d0, { file: 'normal.chart.json', snap: 16 }, tm, presses)
    expect(r).toMatchObject({ added: 1, dropped: 0, early: 2 })
  })
  it('녹음 결과 안내 문구', () => {
    expect(recordingMessage({ added: 3, dropped: 0, early: 0 })).toBe('3개 노트 추가')
    expect(recordingMessage({ added: 3, dropped: 1, early: 0 })).toBe('3개 노트 추가 · 1개는 겹쳐서 버림')
    expect(recordingMessage({ added: 3, dropped: 1, early: 2 })).toBe(
      '3개 노트 추가 · 1개는 겹쳐서 버림 · 2개는 곡 시작 전이라 버림'
    )
    expect(recordingMessage({ added: 0, dropped: 0, early: 0 })).toBe('추가된 노트가 없어요')
    expect(recordingMessage({ added: 0, dropped: 0, early: 2 })).toBe(
      '추가된 노트가 없어요 · 2개는 곡 시작 전이라 버림'
    )
  })
  it('겹치면 기존 유지', () => {
    const d = withNotes(d0, [{ tick: 480, track: 'Note_1', type: 'tap' }])
    const r = mergeRecorded(d, 'normal.chart.json', [
      { tick: 480, track: 'Note_1', type: 'tap' },
      { tick: 480, track: 'Note_2', type: 'tap' },
      { tick: 480, track: 'Note_2', type: 'tap' }
    ])
    expect(r.added).toBe(1)
    expect(r.dropped).toBe(2)
  })
  it('녹음 시작 때의 채보·스냅으로 합친다', () => {
    const hard = addChart(d0, 'HARD', basicTracks(4))!
    // 600ms = 576 tick: 1/4이면 480, 1/16이면 600
    const r = applyRecording(hard.doc, { file: 'normal.chart.json', snap: 4 }, tm, [
      { track: 'Note_3', downMs: 600, upMs: 650 }
    ])
    expect(r.added).toBe(1)
    expect(getLaneChart(r.doc, 'normal.chart.json').notes).toEqual([{ tick: 480, track: 'Note_3', type: 'tap' }])
    expect(getLaneChart(r.doc, hard.file).notes).toEqual([])
  })
})
