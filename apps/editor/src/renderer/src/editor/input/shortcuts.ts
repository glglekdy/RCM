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

/**
 * 입력 필드에 포커스가 있을 때의 단축키. 필드의 글자 입력·되돌리기·붙여넣기는 그대로 두고,
 * 저장(Ctrl+S, 호출하는 쪽이 필드를 먼저 확정한다)과 Esc(정지)만 받는다.
 */
export function resolveTypingShortcut(e: KeyInput, mode: EditorMode): Action | null {
  const action = resolveShortcut(e, mode)
  return action === 'save' || action === 'stop' ? action : null
}
