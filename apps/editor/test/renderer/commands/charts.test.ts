import { describe, expect, it } from 'vitest'
import { basicTracks } from '@rcm/core'
import { d0 } from '../fixtures'
import { getChart } from '../../../src/renderer/src/editor/state/doc'
import { addChart } from '../../../src/renderer/src/editor/commands/charts'

describe('addChart', () => {
  it('난이도 추가: 파일 이름 중복 회피', () => {
    const r = addChart(d0, 'Normal', basicTracks(7))!
    expect(r.file).toBe('normal-2.chart.json')
    expect(getChart(r.doc, r.file).tracks).toEqual(basicTracks(7))
    expect(getChart(r.doc, r.file).level).toBe(1)
    expect(addChart(r.doc, 'NORMAL', basicTracks(4))!.file).toBe('normal-3.chart.json')
  })
  it('사이드 트랙 구성 그대로', () => {
    const tracks = [{ id: 'Side_L', color: '#f59e0b', width: 'wide' as const }, { id: 'Note_1' }]
    expect(getChart(addChart(d0, 'side', tracks)!.doc, 'side.chart.json').tracks).toEqual(tracks)
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
