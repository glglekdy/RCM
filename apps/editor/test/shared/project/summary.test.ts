import { describe, it, expect } from 'vitest'
import { summarizeProjectFiles } from '../../../src/shared/project/summary'
import { buildNewProject } from '../../../src/shared/project/newProject'

const make = (extra: object) =>
  buildNewProject(
    {
      parentDir: '/p',
      title: '별',
      artist: 'A',
      audioPath: null,
      bpm: 120,
      chartName: 'HARD',
      tracks: [{ id: 't1' }],
      ...extra
    },
    ''
  )

describe('summarizeProjectFiles', () => {
  it('레인형 채보는 트랙 수를 센다', () => {
    const [song, chart] = make({})
    expect(summarizeProjectFiles(song.text, [{ file: chart.name, text: chart.text }])).toEqual({
      title: '별',
      artist: 'A',
      charts: [{ name: 'HARD', trackCount: 1 }]
    })
  })

  it('자유형 채보는 { name, trackCount: 0, columns }', () => {
    const [song, chart] = make({ tracks: [], free: { columns: 5, flickMode: 'any' } })
    expect(summarizeProjectFiles(song.text, [{ file: chart.name, text: chart.text }]).charts).toEqual([
      { name: 'HARD', trackCount: 0, columns: 5 }
    ])
  })

  it('깨진 채보는 건너뛴다', () => {
    const [song, chart] = make({})
    const r = summarizeProjectFiles(song.text, [
      { file: 'bad.chart.json', text: '{' },
      { file: chart.name, text: chart.text }
    ])
    expect(r.charts).toHaveLength(1)
  })

  it('깨진 song은 throw', () => {
    expect(() => summarizeProjectFiles('{', [])).toThrow()
  })
})
