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
    expect(DEFAULT_PRESETS.map((p) => p.name)).toEqual(['4K', '5K', '6K', '8K'])
    expect(DEFAULT_PRESETS.map((p) => p.id)).toEqual(['4k', '5k', '6k', '8k'])
    expect(DEFAULT_PRESETS[3].tracks.map((x) => `${x.id}=${x.key}`)).toEqual([
      'Note_1=KeyA', 'Note_2=KeyS', 'Note_3=KeyD', 'Note_4=KeyF',
      'Note_5=KeyJ', 'Note_6=KeyK', 'Note_7=KeyL', 'Note_8=Semicolon'
    ])
    expect(DEFAULT_PRESETS.every((p) => !hasPresetErrors(presetErrors(p)))).toBe(true)
  })

  it('키는 위치가 아니라 id로 매칭', () => {
    const r = resolveKeymap([{ id: 'Note_2' }, { id: 'Note_1' }, { id: 'Note_3' }, { id: 'Note_4' }], DEFAULT_PRESETS)
    expect(r.source).toEqual({ kind: 'preset', name: '4K' })
    expect(r.keys.get('Note_1')).toEqual(['KeyD'])
    expect(r.keys.get('Note_2')).toEqual(['KeyF'])
  })

  it('맞는 프리셋이 없으면 자동 배정, 16개 넘으면 키 없음', () => {
    const tracks = Array.from({ length: 17 }, (_, i) => ({ id: `T${i}` }))
    const r = resolveKeymap(tracks, DEFAULT_PRESETS)
    expect(r.source).toEqual({ kind: 'auto' })
    expect(r.keys.get('T0')).toEqual(['KeyA'])
    expect(r.keys.get('T15')).toEqual(['KeyP'])
    expect(r.keys.get('T16')).toEqual([])
  })

  it('보조 키는 주 키 다음에, 빈 칸은 빼고', () => {
    const p: TrackPreset = {
      id: 'x',
      name: 'P',
      tracks: [
        { id: 'A', key: 'Space', subKey: 'KeyB' },
        { id: 'B', key: null, subKey: 'KeyN' },
        { id: 'C', key: 'KeyD', subKey: null }
      ]
    }
    const r = resolveKeymap([{ id: 'A' }, { id: 'B' }, { id: 'C' }], [p])
    expect(r.keys.get('A')).toEqual(['Space', 'KeyB'])
    expect(r.keys.get('B')).toEqual(['KeyN'])
    expect(r.keys.get('C')).toEqual(['KeyD'])
  })

  it('검사: 보조 키 중복', () => {
    const i = presetErrors({
      id: 'x',
      name: 'P',
      tracks: [
        { id: 'A', key: 'KeyD', subKey: 'KeyD' },
        { id: 'B', key: 'KeyF', subKey: 'KeyJ' },
        { id: 'C', key: 'KeyJ' },
        { id: 'D', key: 'KeyK', subKey: 'KeyF' },
        { id: 'E', key: null, subKey: '' }
      ]
    })
    expect(i.tracks[0].subKey).toBe('주 키와 같은 키')
    expect(i.tracks[1].subKey).toBeUndefined()
    expect(i.tracks[2].key).toBeDefined()
    expect(i.tracks[3].subKey).toBeDefined()
    expect(i.tracks[4].subKey).toBeDefined()
    expect(hasPresetErrors({ tracks: [{ subKey: 'x' }] })).toBe(true)
  })

  it('기믹 트랙은 키 검사를 건너뛴다', () => {
    const i = presetErrors({
      id: 'x',
      name: 'P',
      tracks: [{ id: 'A', key: 'KeyD' }, { id: 'G', kind: 'gimmick', key: 'KeyD', subKey: 'KeyD' }]
    })
    expect(i.tracks.every((r) => !r.key && !r.subKey)).toBe(true)
  })

  it('채보 트랙이 기믹이면 프리셋 키와 상관없이 키 없음', () => {
    const p: TrackPreset = { id: 'p', name: 'P', tracks: [t('A', 'KeyD'), { id: 'B', key: 'KeyF', subKey: 'KeyG' }] }
    const r = resolveKeymap([{ id: 'A' }, { id: 'B', kind: 'gimmick' }], [p])
    expect(r.source).toEqual({ kind: 'preset', name: 'P' })
    expect(r.keys.get('A')).toEqual(['KeyD'])
    expect(r.keys.get('B')).toEqual([])
  })

  it('프리셋에서 기믹인 트랙의 키는 쓰지 않는다', () => {
    // 설정 파일에서 기믹 트랙이 플레이 트랙과 같은 키를 들고 있어도 그 키는 플레이 트랙만 친다
    const p: TrackPreset = { id: 'p', name: 'P', tracks: [t('A', 'KeyD'), { id: 'G', kind: 'gimmick', key: 'KeyD' }] }
    expect(sanitizePresets([p])).toEqual([p])
    const r = resolveKeymap([{ id: 'A' }, { id: 'G' }], [p])
    expect(r.keys.get('A')).toEqual(['KeyD'])
    expect(r.keys.get('G')).toEqual([])
  })

  it('자동 배정은 기믹을 건너뛴다', () => {
    const r = resolveKeymap([{ id: 'X' }, { id: 'G', kind: 'gimmick' }, { id: 'Y' }], DEFAULT_PRESETS)
    expect(r.source).toEqual({ kind: 'auto' })
    expect(r.keys.get('X')).toEqual(['KeyA'])
    expect(r.keys.get('G')).toEqual([])
    expect(r.keys.get('Y')).toEqual(['KeyS'])
  })

  it('설정 파일 kind', () => {
    const gim = { id: 'a', name: 'A', tracks: [{ id: 'G', key: null, kind: 'gimmick' }] }
    expect(sanitizePresets([gim])).toEqual([gim])
    expect(sanitizePresets([{ id: 'b', name: 'B', tracks: [{ id: 'P', key: 'KeyD', kind: 'play' }] }])).toEqual([
      { id: 'b', name: 'B', tracks: [t('P', 'KeyD')] }
    ])
    // 모르는 종류면 그 프리셋을 버린다
    expect(sanitizePresets([gim, { id: 'c', name: 'C', tracks: [{ id: 'Z', key: null, kind: 'boss' }] }])).toEqual([gim])
  })

  it('채보로 복사할 때 기믹 종류는 유지', () => {
    expect(presetToChartTracks({ id: 'x', name: 'P', tracks: [{ id: 'G', kind: 'gimmick', key: null }, t('A', 'KeyD')] })).toEqual([
      { id: 'G', kind: 'gimmick' },
      { id: 'A' }
    ])
  })

  it('설정 파일의 width는 버린다', () => {
    const raw = { id: 'a', name: 'A', tracks: [{ id: 'Side_L', key: 'ShiftLeft', width: 'wide' }, { id: 'B', key: null, width: 'huge' }] }
    expect(sanitizePresets([raw])).toEqual([{ id: 'a', name: 'A', tracks: [t('Side_L', 'ShiftLeft'), t('B')] }])
  })

  it('설정 파일의 보조 키', () => {
    const withSub = { id: 'a', name: 'A', tracks: [{ id: 'Note_1', key: 'Space', subKey: 'KeyB' }] }
    expect(sanitizePresets([withSub])).toEqual([withSub])
    // null은 보조 키 없음
    expect(sanitizePresets([{ id: 'a', name: 'A', tracks: [{ id: 'Note_1', key: 'KeyD', subKey: null }] }])).toEqual([
      { id: 'a', name: 'A', tracks: [t('Note_1', 'KeyD')] }
    ])
    // 문자열이 아니거나 다른 키와 겹치면 프리셋을 버린다
    const bad = { id: 'b', name: 'B', tracks: [{ id: 'Note_1', key: 'KeyD', subKey: 3 }] }
    const dup = { id: 'c', name: 'C', tracks: [t('Note_1', 'KeyD'), { id: 'Note_2', key: 'KeyF', subKey: 'KeyD' }] }
    expect(sanitizePresets([withSub, bad, dup])).toEqual([withSub])
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
    expect(presetToChartTracks({ id: 'x', name: 'P', tracks: [{ id: 'Side_L', color: '#f59e0b', key: 'ShiftLeft' }] })[0]).toEqual({
      id: 'Side_L',
      color: '#f59e0b'
    })
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
