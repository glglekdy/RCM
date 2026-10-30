import { describe, expect, it } from 'vitest'
import { basicTracks, isFreeChart, serializeChart, serializeFreeChart } from '@rcm/core'
import { d0 } from '../fixtures'
import { getChart, getLaneChart } from '../../../src/renderer/src/editor/state/doc'
import { addChart, importCharts } from '../../../src/renderer/src/editor/commands/charts'

describe('addChart', () => {
  it('난이도 추가: 파일 이름 중복 회피', () => {
    const r = addChart(d0, 'Normal', basicTracks(7))!
    expect(r.file).toBe('normal-2.chart.json')
    expect(getLaneChart(r.doc, r.file).tracks).toEqual(basicTracks(7))
    expect(getLaneChart(r.doc, r.file).level).toBe(1)
    expect(addChart(r.doc, 'NORMAL', basicTracks(4))!.file).toBe('normal-3.chart.json')
  })
  it('사이드 트랙 구성 그대로', () => {
    const tracks = [{ id: 'Side_L', color: '#f59e0b', width: 'wide' as const }, { id: 'Note_1' }]
    expect(getLaneChart(addChart(d0, 'side', tracks)!.doc, 'side.chart.json').tracks).toEqual(tracks)
  })
  it('빈 이름·잘못된 트랙은 거부, 금지 문자는 _', () => {
    expect(addChart(d0, '  ', basicTracks(4))).toBeNull()
    expect(addChart(d0, 'x', [])).toBeNull()
    expect(addChart(d0, 'x', basicTracks(17))).toBeNull()
    expect(addChart(d0, 'x', [{ id: 'A' }, { id: 'A' }])).toBeNull()
    expect(addChart(d0, 'x', [{ id: 'bad id' }])).toBeNull()
    expect(addChart(d0, ' A/B ', basicTracks(4))!.file).toBe('a_b.chart.json')
  })
})

describe('importCharts', () => {
  const hard = serializeChart({
    formatVersion: 1,
    name: 'HARD',
    level: 12,
    tracks: basicTracks(4),
    notes: [{ type: 'tap', track: 'Note_1', tick: 480 }]
  })
  const free = serializeFreeChart({
    formatVersion: 1,
    layout: 'free',
    name: 'MOBILE',
    level: 3,
    columns: 12,
    flickMode: 'any',
    notes: []
  })
  it('채보 파일을 새 난이도로 붙임 (노트·레벨 그대로)', () => {
    const r = importCharts(d0, [
      { name: 'hard.chart.json', text: hard },
      { name: 'm.json', text: free }
    ])
    expect(r.failed).toEqual([])
    expect(r.added).toEqual(['hard.chart.json', 'mobile.chart.json'])
    const lane = getLaneChart(r.doc, 'hard.chart.json')
    expect(lane).toMatchObject({ name: 'HARD', level: 12, notes: [{ type: 'tap', track: 'Note_1', tick: 480 }] })
    expect(isFreeChart(getChart(r.doc, 'mobile.chart.json'))).toBe(true)
    expect(r.doc.charts.map((c) => c.file)).toEqual(['normal.chart.json', 'hard.chart.json', 'mobile.chart.json'])
  })
  it('이름이 겹치면 (2)를 붙이고 파일 이름도 피함', () => {
    const normal = serializeChart({ formatVersion: 1, name: 'normal', level: 1, tracks: basicTracks(4), notes: [] })
    const r = importCharts(d0, [
      { name: 'a.chart.json', text: normal },
      { name: 'b.chart.json', text: normal }
    ])
    expect(r.doc.charts.map((c) => [c.file, c.chart.name])).toEqual([
      ['normal.chart.json', 'NORMAL'],
      ['normal (2).chart.json', 'normal (2)'],
      ['normal (3).chart.json', 'normal (3)']
    ])
  })
  it('이름이 비었으면 파일 이름을 씀', () => {
    const blank = serializeChart({ formatVersion: 1, name: ' ', level: 1, tracks: basicTracks(4), notes: [] })
    const r = importCharts(d0, [{ name: 'Extra.chart.json', text: blank }])
    expect(getChart(r.doc, r.added[0]).name).toBe('Extra')
  })
  it('읽지 못한 파일은 건너뛰고 이유를 모음', () => {
    const r = importCharts(d0, [
      { name: 'bad.json', text: '{' },
      { name: 'song.json', text: '{"formatVersion":1,"title":"x"}' },
      { name: 'hard.chart.json', text: hard }
    ])
    expect(r.added).toEqual(['hard.chart.json'])
    expect(r.failed).toHaveLength(2)
    expect(r.failed[0]).toMatch(/^bad\.json: /)
    expect(r.failed[1]).toMatch(/^song\.json: /)
    expect(importCharts(d0, []).doc).toBe(d0)
  })
})
