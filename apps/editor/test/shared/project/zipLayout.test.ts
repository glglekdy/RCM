import { describe, it, expect } from 'vitest'
import { projectEntries, projectPrefix } from '../../../src/shared/project/zipLayout'

describe('projectPrefix', () => {
  it('ZIP 바로 안 또는 폴더 하나 안의 song.json', () => {
    expect(projectPrefix(['song.json'])).toBe('')
    expect(projectPrefix(['My Song/', 'My Song/song.json'])).toBe('My Song/')
  })

  it('없거나 여러 개면 throw', () => {
    expect(() => projectPrefix(['a.txt'])).toThrow('RCM 프로젝트가 아니에요 (song.json이 없어요)')
    expect(() => projectPrefix(['a/song.json', 'b/song.json'])).toThrow('프로젝트가 여러 개 들어 있어요')
  })
})

describe('projectEntries', () => {
  it('__MACOSX 안의 song.json은 무시한다', () => {
    const r = projectEntries(['__MACOSX/My Song/song.json', 'My Song/song.json'])
    expect(r.prefix).toBe('My Song/')
  })

  it('prefix 바로 아래 프로젝트 파일만 (하위 폴더·다른 파일 제외)', () => {
    const r = projectEntries([
      'My Song/song.json',
      'My Song/hard.chart.json',
      'My Song/a (RCM).ogg',
      'My Song/readme.txt',
      'My Song/sub/x.chart.json',
      'Other/y.chart.json'
    ])
    expect(r).toEqual({
      prefix: 'My Song/',
      files: ['My Song/song.json', 'My Song/hard.chart.json', 'My Song/a (RCM).ogg']
    })
  })

  it('루트 ZIP', () => {
    expect(projectEntries(['song.json', 'editor.json', 'a/b.chart.json'])).toEqual({
      prefix: '',
      files: ['song.json', 'editor.json']
    })
  })
})
