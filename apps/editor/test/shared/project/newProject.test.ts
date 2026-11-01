import { describe, it, expect } from 'vitest'
import type { CreateProjectOptions } from '../../../src/shared/api'
import { buildNewProject, validateCreateProjectOptions, type CreateRules } from '../../../src/shared/project/newProject'

const rules: CreateRules = {
  isParentDir: (v): v is string => typeof v === 'string' && v.startsWith('/'),
  isAudioSource: (v): v is string => typeof v === 'string' && v.endsWith('.ogg')
}

const base: CreateProjectOptions = {
  parentDir: '/p',
  title: '별',
  artist: 'A',
  audioPath: null,
  bpm: 120,
  chartName: 'HARD',
  tracks: [{ id: 't1' }, { id: 't2' }]
}

describe('buildNewProject', () => {
  it('파일 세 개: song.json, 첫 채보, editor.json', () => {
    expect(buildNewProject(base, '').map((f) => f.name)).toEqual(['song.json', 'hard.chart.json', 'editor.json'])
  })

  it('song.json에 제목·BPM·음악 이름이 들어간다', () => {
    const song = JSON.parse(buildNewProject(base, '별 (RCM).ogg')[0].text)
    expect(song.title).toBe('별')
    expect(song.audio).toBe('별 (RCM).ogg')
    expect(song.timing[0].bpm).toBe(120)
  })

  it('레인형 채보는 tracks를 가진다', () => {
    const text = buildNewProject(base, '')[1].text
    expect(text).toContain('"tracks"')
    expect(text).not.toContain('"layout": "free"')
  })

  it('자유형 채보는 layout free와 columns를 가진다', () => {
    const text = buildNewProject({ ...base, tracks: [], free: { columns: 5, flickMode: 'any' } }, '')[1].text
    expect(text).toContain('"layout": "free"')
    expect(text).toContain('"columns"')
  })

  it('채보 파일 이름에 쓸 수 없는 글자는 바꾼다', () => {
    expect(buildNewProject({ ...base, chartName: 'A/B' }, '')[1].name).toBe('a_b.chart.json')
  })
})

describe('validateCreateProjectOptions', () => {
  it('올바른 옵션은 알려진 키만 돌려준다', () => {
    const v = validateCreateProjectOptions({ ...base, extra: 1 }, rules)
    expect(v).toEqual(base)
  })

  it('음악 경로 검사는 rules에 맡긴다', () => {
    expect(() => validateCreateProjectOptions({ ...base, audioPath: '/a.flac' }, rules)).toThrow(
      '음악 파일은 ogg, mp3, wav만 쓸 수 있어요'
    )
    expect(validateCreateProjectOptions({ ...base, audioPath: '/a.ogg' }, rules).audioPath).toBe('/a.ogg')
  })

  it('저장 위치 검사는 rules에 맡긴다', () => {
    expect(() => validateCreateProjectOptions({ ...base, parentDir: 'rel' }, rules)).toThrow('저장 위치가 올바르지 않아요')
  })

  it('나머지 검사 문구는 PC와 같다', () => {
    expect(() => validateCreateProjectOptions(null, rules)).toThrow('새 프로젝트 옵션이 올바르지 않아요')
    expect(() => validateCreateProjectOptions({ ...base, title: ' ' }, rules)).toThrow('제목을(를) 입력해 주세요')
    expect(() => validateCreateProjectOptions({ ...base, bpm: 0 }, rules)).toThrow('BPM은 0보다 큰 숫자여야 해요')
    expect(() => validateCreateProjectOptions({ ...base, free: { columns: 99, flickMode: 'any' } }, rules)).toThrow(
      '칸 수는'
    )
  })
})
