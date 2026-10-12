import { DEFAULT_PRESETS, newPresetId, shadowingPreset, type PresetTrack, type TrackPreset } from './presets'

/** `새 프리셋` 창에서 고르는 내장 프리셋 틀. 만들 때 복사한다. */
export interface PresetTemplate {
  id: string
  name: string
  tracks: readonly PresetTrack[]
}

/** 템플릿 창의 탭 하나. `shortName`은 새 프리셋 기본 이름 앞에 붙는다 (기본 탭은 빈 문자열). */
export interface TemplateGroup {
  id: string
  name: string
  shortName: string
  templates: readonly PresetTemplate[]
}

const SIDE_COLOR = '#f59e0b'
const GIMMICK_COLOR = '#ef4444'

/** `[주 키, 보조 키?]` 목록을 `Note_1`… 트랙으로 */
function notes(keys: readonly (string | readonly [string, string])[], from = 1): PresetTrack[] {
  return keys.map((k, i) => {
    const id = `Note_${from + i}`
    return typeof k === 'string' ? { id, key: k } : { id, key: k[0], subKey: k[1] }
  })
}

/** DJMAX 사이드 트랙(Shift)으로 감싼다 */
function withSides(tracks: PresetTrack[]): PresetTrack[] {
  return [
    { id: 'Side_L', color: SIDE_COLOR, key: 'ShiftLeft' },
    ...tracks,
    { id: 'Side_R', color: SIDE_COLOR, key: 'ShiftRight' }
  ]
}

function template(id: string, name: string, tracks: PresetTrack[]): PresetTemplate {
  tracks.forEach((t) => Object.freeze(t))
  return Object.freeze({ id, name, tracks: Object.freeze(tracks) })
}

function group(id: string, name: string, shortName: string, templates: PresetTemplate[]): TemplateGroup {
  return Object.freeze({ id, name, shortName, templates: Object.freeze(templates) })
}

export const BLANK_TEMPLATE: PresetTemplate = template('blank', '빈 프리셋', [{ id: 'Note_1', key: null }])

// 게임별 기본 키 배치 (스펙 5.2절, 사용자 확인 전 초안)
export const TEMPLATE_GROUPS: readonly TemplateGroup[] = Object.freeze([
  group('basic', '기본', '', [BLANK_TEMPLATE, ...DEFAULT_PRESETS]),
  group('djmax', 'DJMAX RESPECT V', 'DJMAX', [
    template('4b', '4B', withSides(notes(['KeyA', 'KeyS', 'Semicolon', 'Quote']))),
    template('5b', '5B', withSides(notes(['KeyA', 'KeyS', ['KeyD', 'KeyL'], 'Semicolon', 'Quote']))),
    template('6b', '6B', withSides(notes(['KeyA', 'KeyS', 'KeyD', 'KeyL', 'Semicolon', 'Quote']))),
    template(
      '8b',
      '8B',
      withSides([
        ...notes(['KeyA', 'KeyS', 'KeyD']),
        { id: 'FX_L', key: 'KeyC' },
        { id: 'FX_R', key: 'Comma' },
        ...notes(['KeyL', 'Semicolon', 'Quote'], 4)
      ])
    )
  ]),
  group('ez2on', 'EZ2ON REBOOT : R', 'EZ2ON', [
    template('4k', '4K', notes(['KeyD', 'KeyF', 'KeyJ', 'KeyK'])),
    template('5k', '5K', notes(['KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK'])),
    template('6k', '6K', notes(['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'])),
    template('8k', '8K', notes(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon']))
  ]),
  group('musedash', 'Muse Dash', 'Muse Dash', [
    template('2lane', '2레인', [
      { id: 'Air', key: 'KeyF', subKey: 'KeyD' },
      { id: 'Ground', key: 'KeyJ', subKey: 'KeyK' },
      { id: 'Saw_Air', color: GIMMICK_COLOR, kind: 'gimmick', key: null },
      { id: 'Saw_Ground', color: GIMMICK_COLOR, kind: 'gimmick', key: null }
    ])
  ]),
  group('osu', 'osu!mania', 'osu!mania', [
    template('4k', '4K', notes(['KeyD', 'KeyF', 'KeyJ', 'KeyK'])),
    template('5k', '5K', notes(['KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK'])),
    template('6k', '6K', notes(['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'])),
    template('7k', '7K', notes(['KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL']))
  ])
])

/** 새 프리셋 이름 기본값: 기본 탭은 템플릿 이름, 게임 탭은 `DJMAX 5B`처럼 */
export function defaultTemplateName(group: TemplateGroup, t: PresetTemplate): string {
  return group.shortName === '' ? t.name : `${group.shortName} ${t.name}`
}

/** 템플릿을 복사해 새 프리셋을 만든다. 이름을 비우면 `fallbackName`. */
export function presetFromTemplate(
  t: PresetTemplate,
  name: string,
  existing: readonly TrackPreset[],
  fallbackName: string
): TrackPreset {
  const trimmed = name.trim()
  return {
    id: newPresetId(existing),
    name: trimmed === '' ? fallbackName : trimmed,
    tracks: t.tracks.map((track) => ({ ...track }))
  }
}

/**
 * 이 템플릿으로 만든 프리셋(목록 끝에 붙는다)을 가리는 앞 프리셋. 트랙 이름이 같은 프리셋은 앞의 것의 키가
 * 녹음·플레이에 쓰이므로(트랙 스펙 3.4) 만들기 전에 알려 준다. 없으면 null.
 */
export function templateShadowedBy(t: PresetTemplate, presets: readonly TrackPreset[]): TrackPreset | null {
  const candidate: TrackPreset = { id: '', name: t.name, tracks: [...t.tracks] }
  return shadowingPreset([...presets, candidate], presets.length)
}
