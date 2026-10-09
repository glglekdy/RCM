import { describe, expect, it } from 'vitest'
import { getChart, replaceChart } from '../../../src/renderer/src/editor/state/doc'
import { dirtyFiles, savedRefsOf } from '../../../src/renderer/src/editor/state/dirty'
import { d0 } from '../fixtures'

describe('dirtyFiles', () => {
  it('바뀐 파일만, 되돌리면 깨끗', () => {
    const saved = savedRefsOf(d0)
    expect(dirtyFiles(d0, saved)).toEqual([])
    const d1 = { ...d0, song: { ...d0.song, title: 'x' } }
    expect(dirtyFiles(d1, saved).map((f) => f.name)).toEqual(['song.json'])
    expect(dirtyFiles(d0, saved)).toEqual([])
  })
  it('차트 하나만', () => {
    const d1 = replaceChart(d0, 'normal.chart.json', { ...getChart(d0, 'normal.chart.json'), level: 3 })
    expect(dirtyFiles(d1, savedRefsOf(d0)).map((f) => f.name)).toEqual(['normal.chart.json'])
  })
  it('replaceChart는 다른 부분의 참조를 유지', () => {
    const d1 = replaceChart(d0, 'normal.chart.json', { ...getChart(d0, 'normal.chart.json'), level: 3 })
    expect(d1.song).toBe(d0.song)
    expect(d1.editorData).toBe(d0.editorData)
  })
})
