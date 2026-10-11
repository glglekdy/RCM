import { describe, expect, it } from 'vitest'
import { parseChart, serializeChart } from '@rcm/core'
import { previewChart } from '../../src/renderer/src/gameplay/previewChart'

describe('미리보기 데모 채보', () => {
  it('4키 데모 채보가 형식 검사를 통과', () => {
    const { chart } = previewChart()
    expect(chart.tracks.map((t) => t.id)).toEqual(['Note_1', 'Note_2', 'Note_3', 'Note_4'])
    expect(parseChart(serializeChart(chart), 'preview.chart.json').ok).toBe(true)
  })

  it('롱노트와 동시치기를 포함', () => {
    const { chart } = previewChart()
    expect(chart.notes.filter((n) => n.type === 'hold').length).toBeGreaterThanOrEqual(2)
    const ticks = chart.notes.map((n) => n.tick)
    expect(ticks.some((t, i) => ticks.indexOf(t) !== i)).toBe(true)
  })

  it('lengthMs는 마지막 노트 끝 + 1000', () => {
    const { chart, tm, lengthMs } = previewChart()
    const lastEnd = Math.max(...chart.notes.map((n) => tm.tickToMs(n.type === 'hold' ? n.endTick : n.tick)))
    expect(lengthMs).toBe(lastEnd + 1000)
  })
})
