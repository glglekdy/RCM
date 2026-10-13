import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRESETS, hasPresetErrors, presetErrors, type PresetTrack, type TrackPreset } from '../../src/shared/presets'
import {
  BLANK_TEMPLATE,
  TEMPLATE_GROUPS,
  defaultTemplateName,
  presetFromTemplate,
  templateShadowedBy,
  type PresetTemplate
} from '../../src/shared/presetTemplates'

const group = (id: string) => TEMPLATE_GROUPS.find((g) => g.id === id)!
const template = (groupId: string, id: string): PresetTemplate => group(groupId).templates.find((t) => t.id === id)!
/** `Note_1=KeyA`, 보조 키는 `+`, 기믹은 `(gimmick)` */
const describeTracks = (tracks: readonly PresetTrack[]) =>
  tracks.map((t) =>
    t.kind === 'gimmick' ? `${t.id}(gimmick)` : `${t.id}=${[t.key, t.subKey].filter(Boolean).join('+')}`
  )

describe('presetTemplates', () => {
  it('그룹 순서와 이름', () => {
    expect(TEMPLATE_GROUPS.map((g) => g.id)).toEqual(['basic', 'djmax', 'ez2on', 'musedash', 'osu', 'pump'])
    expect(TEMPLATE_GROUPS.map((g) => g.name)).toEqual([
      '기본',
      'DJMAX RESPECT V',
      'EZ2ON REBOOT : R',
      'Muse Dash',
      'osu!mania',
      'PUMP IT UP'
    ])
  })

  it('모든 템플릿이 프리셋 검사를 통과하고 id가 겹치지 않는다', () => {
    for (const g of TEMPLATE_GROUPS) {
      expect(new Set(g.templates.map((t) => t.id)).size, g.id).toBe(g.templates.length)
      for (const t of g.templates) {
        expect(hasPresetErrors(presetErrors({ id: 'x', name: t.name, tracks: [...t.tracks] })), `${g.id}/${t.id}`).toBe(false)
      }
    }
  })

  it('기본 탭: 빈 프리셋 다음에 기본 프리셋', () => {
    expect(group('basic').templates[0]).toBe(BLANK_TEMPLATE)
    expect(BLANK_TEMPLATE).toEqual({ id: 'blank', name: '빈 프리셋', tracks: [{ id: 'Note_1', key: null }] })
    expect(group('basic').templates.slice(1).map((t) => t.name)).toEqual(DEFAULT_PRESETS.map((p) => p.name))
  })

  it('템플릿은 바꿀 수 없다', () => {
    for (const g of TEMPLATE_GROUPS) {
      expect(Object.isFrozen(g)).toBe(true)
      for (const t of g.templates) {
        expect(Object.isFrozen(t) && Object.isFrozen(t.tracks) && t.tracks.every(Object.isFrozen)).toBe(true)
      }
    }
  })

  it('DJMAX 배치 (가운데 트랙은 두 키)', () => {
    expect(describeTracks(template('djmax', '5b').tracks)).toEqual([
      'Side_L=ShiftLeft', 'Note_1=KeyA', 'Note_2=KeyS', 'Note_3=KeyD+KeyL', 'Note_4=Semicolon', 'Note_5=Quote',
      'Side_R=ShiftRight'
    ])
    expect(describeTracks(template('djmax', '4b').tracks)).toEqual([
      'Side_L=ShiftLeft', 'Note_1=KeyA', 'Note_2=KeyS', 'Note_3=Semicolon', 'Note_4=Quote', 'Side_R=ShiftRight'
    ])
    expect(describeTracks(template('djmax', '8b').tracks)).toEqual([
      'Side_L=ShiftLeft', 'Note_1=KeyA', 'Note_2=KeyS', 'Note_3=KeyD', 'Trigger_L=KeyC', 'Trigger_R=Comma',
      'Note_4=KeyL', 'Note_5=Semicolon', 'Note_6=Quote', 'Side_R=ShiftRight'
    ])
  })

  it('DJMAX 색: 사이드는 하늘색, 트리거는 빨강·분홍', () => {
    const color = (id: string) => template('djmax', '8b').tracks.find((t) => t.id === id)!.color
    expect(color('Side_L')).toBe('#38bdf8')
    expect(color('Side_R')).toBe('#38bdf8')
    expect(color('Trigger_L')).toBe('#f43f5e')
    expect(color('Trigger_R')).toBe('#f43f5e')
    expect(template('djmax', '4b').tracks[0].color).toBe('#38bdf8')
  })

  it('EZ2ON 노트 색: 흰(W)·파랑(B) 배열, 8K는 Type A·B·H', () => {
    const pattern = (id: string) =>
      template('ez2on', id).tracks.map((t) => (t.color === undefined ? 'W' : t.color === '#2f80ff' ? 'B' : '?')).join('')
    expect(group('ez2on').templates.map((t) => t.id)).toEqual(['4k', '5k', '6k', '8k-a', '8k-b', '8k-h'])
    expect(group('ez2on').templates.map((t) => t.name)).toEqual(['4K', '5K', '6K', '8K Type A', '8K Type B', '8K Type H'])
    expect(pattern('4k')).toBe('WBBW')
    expect(pattern('5k')).toBe('WBWBW')
    expect(pattern('6k')).toBe('WBWWBW')
    expect(pattern('8k-a')).toBe('WBWBBWBW')
    expect(pattern('8k-b')).toBe('WBWBWBWB')
    expect(pattern('8k-h')).toBe('WBBWWBBW')
  })

  it('PUMP IT UP: 싱글은 Z Q S E C, 더블 2P는 숫자패드 1 7 5 9 3', () => {
    expect(group('pump').templates.map((t) => [t.id, t.name])).toEqual([
      ['4k', '4K (방향)'],
      ['5k', '5K (싱글)'],
      ['8k', '8K (방향 더블)'],
      ['10k', '10K (더블)']
    ])
    expect(describeTracks(template('pump', '5k').tracks)).toEqual(['DL=KeyZ', 'UL=KeyQ', 'C=KeyS', 'UR=KeyE', 'DR=KeyC'])
    expect(describeTracks(template('pump', '4k').tracks)).toEqual(['DL=KeyZ', 'UL=KeyQ', 'UR=KeyE', 'DR=KeyC'])
    expect(describeTracks(template('pump', '10k').tracks)).toEqual([
      'P1_DL=KeyZ', 'P1_UL=KeyQ', 'P1_C=KeyS', 'P1_UR=KeyE', 'P1_DR=KeyC',
      'P2_DL=Numpad1', 'P2_UL=Numpad7', 'P2_C=Numpad5', 'P2_UR=Numpad9', 'P2_DR=Numpad3'
    ])
    expect(describeTracks(template('pump', '8k').tracks)).toEqual([
      'P1_DL=KeyZ', 'P1_UL=KeyQ', 'P1_UR=KeyE', 'P1_DR=KeyC',
      'P2_DL=Numpad1', 'P2_UL=Numpad7', 'P2_UR=Numpad9', 'P2_DR=Numpad3'
    ])
  })

  it('PUMP IT UP 색: 아래 대각선 파랑, 위 대각선 빨강, 가운데 노랑', () => {
    const colors = (id: string) =>
      template('pump', id).tracks.map((t) => ({ '#3b82f6': 'B', '#ef4444': 'R', '#facc15': 'Y' })[t.color ?? ''] ?? '?').join('')
    expect(colors('4k')).toBe('BRRB')
    expect(colors('5k')).toBe('BRYRB')
    expect(colors('8k')).toBe('BRRBBRRB')
    expect(colors('10k')).toBe('BRYRBBRYRB')
  })

  it('EZ2ON · Muse Dash · osu!mania 배치', () => {
    expect(describeTracks(template('ez2on', '8k-a').tracks)).toEqual([
      'Note_1=KeyA', 'Note_2=KeyS', 'Note_3=KeyD', 'Note_4=KeyF', 'Note_5=KeyJ', 'Note_6=KeyK', 'Note_7=KeyL',
      'Note_8=Semicolon'
    ])
    expect(describeTracks(template('musedash', '2lane').tracks)).toEqual([
      'Air=KeyF+KeyD', 'Ground=KeyJ+KeyK', 'Saw_Air(gimmick)', 'Saw_Ground(gimmick)'
    ])
    expect(describeTracks(template('osu', '7k').tracks)).toEqual([
      'Note_1=KeyS', 'Note_2=KeyD', 'Note_3=KeyF', 'Note_4=Space', 'Note_5=KeyJ', 'Note_6=KeyK', 'Note_7=KeyL'
    ])
  })

  it('기본 이름: 기본 탭은 템플릿 이름, 게임 탭은 게임 짧은 이름 + 템플릿', () => {
    expect(defaultTemplateName(group('basic'), BLANK_TEMPLATE)).toBe('빈 프리셋')
    expect(defaultTemplateName(group('djmax'), template('djmax', '5b'))).toBe('DJMAX 5B')
    expect(defaultTemplateName(group('musedash'), template('musedash', '2lane'))).toBe('Muse Dash 2레인')
  })

  it('템플릿으로 프리셋 만들기: 빈 이름은 기본 이름, id는 겹치지 않고, 템플릿은 그대로', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    try {
      const t = template('djmax', '5b')
      const a = presetFromTemplate(t, '  ', [], 'DJMAX 5B')
      expect(a.name).toBe('DJMAX 5B')
      expect(a.tracks).toEqual(t.tracks)
      const b = presetFromTemplate(t, ' 내 5B ', [a], 'DJMAX 5B')
      expect(b.name).toBe('내 5B')
      expect(b.id).not.toBe(a.id)
      a.tracks[0].key = 'KeyZ'
      expect(t.tracks[0].key).toBe('ShiftLeft')
    } finally {
      now.mockRestore()
    }
  })

  it('트랙 이름이 같은 앞 프리셋이 있으면 알려 준다 (그 프리셋의 키가 쓰인다)', () => {
    // osu!mania 4K는 기본 4K와 트랙 이름이 같아 그 키에 가려진다. 기본에 7K가 없으니 7K는 아니다
    expect(templateShadowedBy(template('osu', '7k'), DEFAULT_PRESETS)).toBeNull()
    expect(templateShadowedBy(template('djmax', '6b'), DEFAULT_PRESETS)).toBeNull()
    const custom: TrackPreset = { id: 'c', name: '내 6B', tracks: [...template('djmax', '6b').tracks] }
    expect(templateShadowedBy(template('djmax', '6b'), [custom])?.name).toBe('내 6B')
    expect(templateShadowedBy(template('musedash', '2lane'), DEFAULT_PRESETS)).toBeNull()
    expect(templateShadowedBy(template('osu', '4k'), DEFAULT_PRESETS)?.name).toBe('4K')
  })
})
