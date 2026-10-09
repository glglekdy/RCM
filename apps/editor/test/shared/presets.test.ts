import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRESETS,
  hasPresetErrors,
  newPresetId,
  presetErrors,
  presetToChartTracks,
  resolveKeymap,
  sanitizePresets,
  type PresetTrack
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

  it('새 프리셋 id는 겹치지 않는다', () => {
    const a = newPresetId([])
    expect(a).toMatch(/^p-[0-9a-z]+$/)
    expect(newPresetId([{ id: a, name: 'x', tracks: [t('A')] }])).toBe(`${a}-2`)
  })
})
