import type { SnapDivision } from '@rcm/core'

export type Action =
  | 'playPause'
  | 'save'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'delete'
  | 'mirror'
  | 'toolDraw'
  | 'toolErase'
  | 'toolSelect'
  | 'tap'
  | 'marker'
  | 'markerPrev'
  | 'markerNext'
  | 'record'
  | 'stop'
  | 'playtestHere'
  | 'playtestStart'
  | { kind: 'snap'; division: SnapDivision }

export interface KeyInput {
  code: string
  ctrl: boolean
  shift: boolean
}

export type EditorMode = 'edit' | 'recording' | 'playtest'

const DIGIT_SNAPS: Record<string, SnapDivision> = {
  Digit1: 4,
  Digit2: 8,
  Digit3: 12,
  Digit4: 16,
  Digit5: 24,
  Digit6: 32
}

const CTRL_KEYS: Record<string, Action> = {
  KeyS: 'save',
  KeyZ: 'undo',
  KeyY: 'redo',
  KeyC: 'copy',
  KeyX: 'cut',
  KeyV: 'paste',
  KeyH: 'mirror'
}

const PLAIN_KEYS: Record<string, Action> = {
  Space: 'playPause',
  Delete: 'delete',
  KeyB: 'toolDraw',
  KeyE: 'toolErase',
  KeyV: 'toolSelect',
  KeyT: 'tap',
  KeyM: 'marker',
  BracketLeft: 'markerPrev',
  BracketRight: 'markerNext',
  KeyR: 'record',
  Escape: 'stop',
  F5: 'playtestHere'
}

export function resolveShortcut(e: KeyInput, mode: EditorMode): Action | null {
  if (mode !== 'edit') return e.code === 'Escape' ? 'stop' : null

  if (e.ctrl) {
    if (e.shift) return e.code === 'KeyZ' ? 'redo' : null
    return CTRL_KEYS[e.code] ?? null
  }
  if (e.shift) return e.code === 'F5' ? 'playtestStart' : null

  const division = DIGIT_SNAPS[e.code]
  if (division !== undefined) return { kind: 'snap', division }
  return PLAIN_KEYS[e.code] ?? null
}
