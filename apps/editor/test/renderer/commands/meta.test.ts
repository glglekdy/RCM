import { describe, expect, it } from 'vitest'
import { updateChartMeta, updateSong } from '../../../src/renderer/src/editor/commands/meta'
import { getLaneChart } from '../../../src/renderer/src/editor/state/doc'
import { d0 } from '../fixtures'

const F = 'normal.chart.json'

describe('meta commands', () => {
  it('채보 이름은 비울 수 없음', () => {
    expect(updateChartMeta(d0, F, { name: '' })).toBeNull()
    expect(updateChartMeta(d0, F, { name: '  ' })).toBeNull()
    expect(updateChartMeta(d0, F, { level: 0 })).toBeNull()
    expect(updateChartMeta(d0, F, { level: 100 })).toBeNull()
    const d = updateChartMeta(d0, F, { name: 'HARD', level: 9 })!
    expect(getLaneChart(d, F)).toMatchObject({ name: 'HARD', level: 9 })
  })

  it('곡 정보 변경', () => {
    const d = updateSong(d0, { title: 'X', previewStartMs: 1500 })!
    expect(d.song).toMatchObject({ title: 'X', artist: 'A', previewStartMs: 1500 })
    expect(d.charts).toBe(d0.charts)
    expect(updateSong(d0, { previewStartMs: -1 })).toBeNull()
    expect(updateSong(d0, { audio: 'audio-2.mp3' })!.song.audio).toBe('audio-2.mp3')
  })
})
