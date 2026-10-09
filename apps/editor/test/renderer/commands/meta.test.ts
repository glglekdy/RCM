import { describe, expect, it } from 'vitest'
import {
  setChartLanes,
  updateChartMeta,
  updateSong
} from '../../../src/renderer/src/editor/commands/meta'
import { getChart } from '../../../src/renderer/src/editor/state/doc'
import { d0, withNotes } from '../fixtures'

const F = 'normal.chart.json'

describe('meta commands', () => {
  it('레인 수 줄이기', () => {
    const d = withNotes(
      d0,
      [
        { tick: 0, lane: 6, type: 'tap' },
        { tick: 0, lane: 1, type: 'tap' }
      ],
      7
    )
    const r = setChartLanes(d, F, 4)!
    expect(r.removed).toBe(1)
    expect(getChart(r.doc, F).lanes).toBe(4)
    expect(getChart(r.doc, F).notes).toHaveLength(1)
    expect(setChartLanes(d, F, 9)).toBeNull()
    expect(setChartLanes(d, F, 3)).toBeNull()
  })

  it('레인 수 늘리기는 노트를 지우지 않음', () => {
    const r = setChartLanes(d0, F, 6)!
    expect(r.removed).toBe(0)
    expect(getChart(r.doc, F).lanes).toBe(6)
  })

  it('채보 이름은 비울 수 없음', () => {
    expect(updateChartMeta(d0, F, { name: '' })).toBeNull()
    expect(updateChartMeta(d0, F, { name: '  ' })).toBeNull()
    expect(updateChartMeta(d0, F, { level: 0 })).toBeNull()
    expect(updateChartMeta(d0, F, { level: 100 })).toBeNull()
    const d = updateChartMeta(d0, F, { name: 'HARD', level: 9 })!
    expect(getChart(d, F)).toMatchObject({ name: 'HARD', level: 9 })
  })

  it('곡 정보 변경', () => {
    const d = updateSong(d0, { title: 'X', previewStartMs: 1500 })!
    expect(d.song).toMatchObject({ title: 'X', artist: 'A', previewStartMs: 1500 })
    expect(d.charts).toBe(d0.charts)
    expect(updateSong(d0, { previewStartMs: -1 })).toBeNull()
  })
})
