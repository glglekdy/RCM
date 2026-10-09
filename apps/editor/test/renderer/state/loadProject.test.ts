import { describe, expect, it } from 'vitest'
import { loadProject } from '../../../src/renderer/src/editor/state/loadProject'
import { files } from '../fixtures'

describe('loadProject', () => {
  it('정상 로드, editor.json 없으면 빈 마커', () => {
    const r = loadProject({ ...files(), editorText: null })
    expect(r.ok && r.doc.editorData.markers).toEqual([])
  })
  it('여러 파일 오류를 모두 모음', () => {
    const r = loadProject({ ...files(), songText: '{', charts: [{ file: 'a.chart.json', text: '{' }] })
    expect(!r.ok && r.errors.join('\n')).toContain('song.json')
    expect(!r.ok && r.errors.join('\n')).toContain('a.chart.json')
  })
  it('차트가 없으면 오류', () => {
    const r = loadProject({ ...files(), charts: [] })
    expect(!r.ok && r.errors).toContain('채보 파일(*.chart.json)이 없어요')
  })
})
