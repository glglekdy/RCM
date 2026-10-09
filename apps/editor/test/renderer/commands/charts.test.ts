import { describe, expect, it } from 'vitest'
import { d0 } from '../fixtures'
import { getChart } from '../../../src/renderer/src/editor/state/doc'
import { addChart } from '../../../src/renderer/src/editor/commands/charts'

describe('addChart', () => {
  it('난이도 추가: 파일 이름 중복 회피', () => {
    const r = addChart(d0, 'Normal', 7)!
    expect(r.file).toBe('normal-2.chart.json')
    expect(getChart(r.doc, r.file).lanes).toBe(7)
    expect(getChart(r.doc, r.file).level).toBe(1)
    expect(addChart(r.doc, 'NORMAL', 4)!.file).toBe('normal-3.chart.json')
  })
  it('빈 이름·레인 범위 밖은 거부, 금지 문자는 _', () => {
    expect(addChart(d0, '  ', 4)).toBeNull()
    expect(addChart(d0, 'x', 3)).toBeNull()
    expect(addChart(d0, 'x', 9)).toBeNull()
    expect(addChart(d0, ' A/B ', 4)!.file).toBe('a_b.chart.json')
  })
})
