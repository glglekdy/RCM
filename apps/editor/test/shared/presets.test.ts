import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PRESETS,
  hasPresetErrors,
  newPresetId,
  presetErrors,
  presetToChartTracks,
  resolveKeymap,
  sanitizePresets,
  shadowingPreset,
  type PresetTrack,
  type TrackPreset
} from '../../src/shared/presets'

const t = (id: string, key: string | null = null): PresetTrack => ({ id, key })

describe('presets', () => {
  it('기본 프리셋', () => {
    expect(DEFAULT_PRESETS.map((p) => p.name)).toEqual(['4K', '5K', '6K', '7K', '8K', '6K + 사이드'])
    const side = DEFAULT_PRESETS[5]
    expect(side.tracks.map((x) => `${x.id}=${x.key}`)).toEqual([
      'Side_L=ShiftLeft', 'Note_1=KeyS', 'Note_2=KeyD', 'Note_3=KeyF',
      'Note_4=KeyJ', 'Note_5=KeyK', 'Note_6=KeyL', 'Side_R=ShiftRight'
    ])
    expect(DEFAULT_PRESETS.every((p) => !hasPresetErrors(presetErrors(p)))).toBe(true)
  })

  it('키는 위치가 아니라 id로 매칭', () => {
    const r = resolveKeymap([{ id: 'Note_2' }, { id: 'Note_1' }, { id: 'Note_3' }, { id: 'Note_4' }], DEFAULT_PRESETS)
    expect(r.source).toEqual({ kind: 'preset', name: '4K' })
    expect(r.keys.get('Note_1')).toBe('KeyD')
    expect(r.keys.get('Note_2')).toBe('KeyF')
  })

  it('맞는 프리셋이 없으면 자동 배정, 16개 넘으면 null', () => {
    const tracks = Array.from({ length: 17 }, (_, i) => ({ id: `T${i}` }))
    const r = resolveKeymap(tracks, DEFAULT_PRESETS)
    expect(r.source).toEqual({ kind: 'auto' })
    expect(r.keys.get('T0')).toBe('KeyA')
    expect(r.keys.get('T15')).toBe('KeyP')
    expect(r.keys.get('T16')).toBeNull()
  })

  it('검사: 이름·id·키 중복', () => {
    const i = presetErrors({ id: 'x', name: '', tracks: [t('A', 'KeyD'), t('A', 'KeyD'), t('bad id')] })
    expect(i.name).toBeDefined()
    expect(i.tracks[1].id).toBeDefined()
    expect(i.tracks[1].key).toBeDefined()
    expect(i.tracks[2].id).toBeDefined()
    expect(presetErrors({ id: 'x', name: 'P', tracks: [t('A'), t('B')] }).tracks.every((r) => !r.key)).toBe(true)
  })

  it('설정 파일 프리셋 정리', () => {
    expect(sanitizePresets(undefined)).toEqual(DEFAULT_PRESETS)
    expect(sanitizePresets([{ id: 'a', name: '', tracks: [] }])).toEqual(DEFAULT_PRESETS)
    const good = { id: 'a', name: 'A', tracks: [t('Note_1', 'KeyD')] }
    expect(sanitizePresets([good, { id: 'a', name: 'dup', tracks: [t('X')] }, 42])).toEqual([good])
  })

  it('정리 결과는 복사본', () => {
    const r = sanitizePresets(undefined)
    r[0].tracks[0].id = 'Changed'
    expect(DEFAULT_PRESETS[0].tracks[0].id).toBe('Note_1')
  })

  it('채보로 복사할 때 키와 기본값 제거', () => {
    expect(presetToChartTracks(DEFAULT_PRESETS[5])[0]).toEqual({ id: 'Side_L', color: '#f59e0b', width: 'wide' })
    expect(presetToChartTracks(DEFAULT_PRESETS[0])[0]).toEqual({ id: 'Note_1' })
  })

  it('기본 프리셋은 바꿀 수 없다', () => {
    const p = DEFAULT_PRESETS[0]
    expect(() => { p.tracks[0].id = 'x' }).toThrow()
    expect(() => { p.tracks.push({ id: 'y', key: null }) }).toThrow()
    expect(() => { p.name = 'z' }).toThrow()
    expect(p.tracks[0].id).toBe('Note_1')
  })

  it('검사: 트랙 수·색·빈 키', () => {
    expect(presetErrors({ id: 'x', name: 'P', tracks: [] }).count).toBeDefined()
    const many = Array.from({ length: 17 }, (_, i) => t(`T${i}`))
    expect(presetErrors({ id: 'x', name: 'P', tracks: many }).count).toBeDefined()
    const i = presetErrors({
      id: 'x', name: 'P', tracks: [{ id: 'A', color: 'red', key: null }, { id: 'B', key: '' }]
    })
    expect(i.tracks[0].color).toBeDefined()
    expect(i.tracks[1].key).toBeDefined()
    expect(i.count).toBeUndefined()
  })

  it('기본 색은 대소문자 상관없이 생략', () => {
    expect(presetToChartTracks({ id: 'x', name: 'P', tracks: [{ id: 'A', color: '#F2F2F2', key: null }] })).toEqual([{ id: 'A' }])
  })

  it('새 프리셋 id는 겹치지 않는다', () => {
    // 두 호출 사이에 밀리초가 바뀌면 id가 저절로 달라지므로 시각을 고정한다
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    try {
      const a = newPresetId([])
      expect(a).toMatch(/^p-[0-9a-z]+$/)
      expect(newPresetId([{ id: a, name: 'x', tracks: [t('A')] }])).toBe(`${a}-2`)
    } finally {
      now.mockRestore()
    }
  })

  it('프리셋 id가 64자를 넘으면 버림', () => {
    const ok = { id: 'x'.repeat(64), name: 'A', tracks: [t('Note_1', 'KeyD')] }
    const long = { id: 'y'.repeat(65), name: 'B', tracks: [t('Note_1', 'KeyD')] }
    expect(sanitizePresets([ok, long])).toEqual([ok])
  })

  it('트랙 구성이 같은 앞 프리셋', () => {
    const p = (id: string, ids: string[]): TrackPreset => ({ id, name: id.toUpperCase(), tracks: ids.map((x) => t(x)) })
    const list = [
      p('a', ['A', 'B']),
      p('b', ['C']),
      p('c', ['B', 'A']),
      p('d', ['A', 'B', 'C']),
      p('e', ['A', 'B'])
    ]
    expect(shadowingPreset(list, 0)).toBeNull()
    expect(shadowingPreset(list, 1)).toBeNull()
    // 순서가 달라도 id 집합이 같으면 가려진다. 가장 앞의 것을 돌려준다
    expect(shadowingPreset(list, 2)).toBe(list[0])
    expect(shadowingPreset(list, 3)).toBeNull()
    expect(shadowingPreset(list, 4)).toBe(list[0])
    expect(shadowingPreset(list, 9)).toBeNull()
    // 기본 프리셋은 서로 가리지 않는다
    DEFAULT_PRESETS.forEach((_, i) => expect(shadowingPreset(DEFAULT_PRESETS, i)).toBeNull())
  })
})
