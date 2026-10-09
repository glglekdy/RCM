import { describe, expect, it } from 'vitest'
import {
  resolveShortcut,
  resolveTypingShortcut
} from '../../../src/renderer/src/editor/input/shortcuts'

const k = (code: string, ctrl = false, shift = false) => ({ code, ctrl, shift })

describe('resolveShortcut', () => {
  it('편집 모드', () => {
    expect(resolveShortcut(k('Space'), 'edit')).toBe('playPause')
    expect(resolveShortcut(k('KeyZ', true, true), 'edit')).toBe('redo')
    expect(resolveShortcut(k('KeyV'), 'edit')).toBe('toolSelect')
    expect(resolveShortcut(k('KeyV', true), 'edit')).toBe('paste')
    expect(resolveShortcut(k('Digit4'), 'edit')).toEqual({ kind: 'snap', division: 16 })
    expect(resolveShortcut(k('F5', false, true), 'edit')).toBe('playtestStart')
  })
  it('녹음·테스트 플레이 모드는 Esc만', () => {
    for (const mode of ['recording', 'playtest'] as const) {
      expect(resolveShortcut(k('Escape'), mode)).toBe('stop')
      expect(resolveShortcut(k('KeyT'), mode)).toBeNull()
      expect(resolveShortcut(k('Space'), mode)).toBeNull()
    }
  })
})

describe('resolveTypingShortcut', () => {
  it('입력 필드에 포커스가 있으면 저장(Ctrl+S)과 Esc만', () => {
    expect(resolveTypingShortcut(k('KeyS', true), 'edit')).toBe('save')
    expect(resolveTypingShortcut(k('Escape'), 'edit')).toBe('stop')
    expect(resolveTypingShortcut(k('Escape'), 'recording')).toBe('stop')
    // 입력 필드 자체의 동작(글자, 되돌리기, 붙여넣기)은 건드리지 않는다
    expect(resolveTypingShortcut(k('KeyS'), 'edit')).toBeNull()
    expect(resolveTypingShortcut(k('KeyM'), 'edit')).toBeNull()
    expect(resolveTypingShortcut(k('Space'), 'edit')).toBeNull()
    expect(resolveTypingShortcut(k('KeyZ', true), 'edit')).toBeNull()
    expect(resolveTypingShortcut(k('KeyV', true), 'edit')).toBeNull()
  })
})
