import { describe, expect, it } from 'vitest'
import { TimingMap, freeNoteKey, noteKey, basicTracks, type FreeNote, type Note } from '@rcm/core'
import { addFreeChart } from '../../../src/renderer/src/editor/commands/charts'
import { getFreeChart, replaceChart, type ProjectDoc } from '../../../src/renderer/src/editor/state/doc'
import { timelineTargetAt } from '../../../src/renderer/src/editor/timeline/target'
import { layoutFreeTimeline, layoutTimeline } from '../../../src/renderer/src/editor/timeline/view'
import { d0, withNotes } from '../fixtures'

const LANE = 'normal.chart.json'
const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0)
const view = { playheadMs: 0, pxPerMs: 0.48, height: 800 } // 1 tick = 0.5px, tick 0 → y 600
const yOf = (tick: number) => 600 - tick / 2

const laneNote: Note = { tick: 480, track: 'Note_2', type: 'tap' }
const laneDoc: ProjectDoc = {
  ...withNotes(d0, [laneNote]),
  editorData: { ...d0.editorData, markers: [{ ms: 500, label: '' }] }
}
const laneG = { tm, view, layout: layoutTimeline(1000, basicTracks(4)) } // Note_2: 452~500
const waveX = 360
const markerY = 600 - 500 * 0.48

const added = addFreeChart(d0, 'MOBILE', 12, 'directional')!
const FREE = added.file
const freeNote: FreeNote = { tick: 0, type: 'tap', x: 0, width: 3 }
const freeDoc = replaceChart(added.doc, FREE, { ...getFreeChart(added.doc, FREE), notes: [freeNote] })
const freeG = { tm, view, layout: layoutFreeTimeline(1000, 12) } // 칸 c: 284 + 36c ~ 320 + 36c

describe('timelineTargetAt', () => {
  it('레인형 노트 위는 그 노트', () =>
    expect(timelineTargetAt(laneDoc, LANE, laneG, 476, yOf(480))).toEqual({ kind: 'note', key: noteKey(laneNote) }))

  it('레인형 트랙 안 빈 곳은 empty', () =>
    expect(timelineTargetAt(laneDoc, LANE, laneG, 476, yOf(1000)).kind).toBe('empty'))

  it('레인형 트랙 이름 띠는 none', () => expect(timelineTargetAt(laneDoc, LANE, laneG, 476, 5).kind).toBe('none'))

  it('트랙 밖의 마커 위는 그 마커', () =>
    expect(timelineTargetAt(laneDoc, LANE, laneG, waveX, markerY)).toEqual({ kind: 'marker', index: 0 }))

  it('트랙 밖 마커 없는 곳은 none', () =>
    expect(timelineTargetAt(laneDoc, LANE, laneG, waveX, 100).kind).toBe('none'))

  it('자유형 노트 위는 그 노트', () =>
    expect(timelineTargetAt(freeDoc, FREE, freeG, 284 + 36 + 18, yOf(0))).toEqual({
      kind: 'note',
      key: freeNoteKey(freeNote)
    }))

  it('자유형 칸 안 빈 곳은 empty', () =>
    expect(timelineTargetAt(freeDoc, FREE, freeG, 284 + 36 * 8 + 18, yOf(1000)).kind).toBe('empty'))

  it('자유형 칸 밖은 none', () => expect(timelineTargetAt(freeDoc, FREE, freeG, 100, 100).kind).toBe('none'))
})
