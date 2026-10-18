import { describe, expect, it } from 'vitest'
import { getLaneChart, replaceChart } from '../../../src/renderer/src/editor/state/doc'
import {
  dirtyFiles,
  isDirty,
  removedFiles,
  savedRefsOf
} from '../../../src/renderer/src/editor/state/dirty'
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
    const d1 = replaceChart(d0, 'normal.chart.json', { ...getLaneChart(d0, 'normal.chart.json'), level: 3 })
    expect(dirtyFiles(d1, savedRefsOf(d0)).map((f) => f.name)).toEqual(['normal.chart.json'])
  })
  it('저장된 채보가 문서에서 사라지면 dirty이고 지울 파일로 나옴', () => {
    const hard = { file: 'hard.chart.json', chart: { ...getLaneChart(d0, 'normal.chart.json'), name: 'HARD' } }
    const withHard = { ...d0, charts: [...d0.charts, hard] }
    const saved = savedRefsOf(withHard)
    expect(isDirty(d0, saved)).toBe(true)
    expect(removedFiles(d0, saved)).toEqual(['hard.chart.json'])
    expect(dirtyFiles(d0, saved)).toEqual([])
    expect(isDirty(withHard, saved)).toBe(false)
    expect(removedFiles(withHard, saved)).toEqual([])
  })
  it('대소문자만 다른 이름이 문서에 있으면 지우지 않음 (Windows에서는 같은 파일)', () => {
    const upper = { file: 'HARD.chart.json', chart: { ...getLaneChart(d0, 'normal.chart.json'), name: 'HARD' } }
    const saved = savedRefsOf({ ...d0, charts: [...d0.charts, upper] })
    const lower = { ...d0, charts: [...d0.charts, { ...upper, file: 'hard.chart.json' }] }
    expect(removedFiles(lower, saved)).toEqual([])
    expect(isDirty(lower, saved)).toBe(true)
    expect(dirtyFiles(lower, saved).map((f) => f.name)).toEqual(['hard.chart.json'])
  })
  it('replaceChart는 다른 부분의 참조를 유지', () => {
    const d1 = replaceChart(d0, 'normal.chart.json', { ...getLaneChart(d0, 'normal.chart.json'), level: 3 })
    expect(d1.song).toBe(d0.song)
    expect(d1.editorData).toBe(d0.editorData)
  })
})
