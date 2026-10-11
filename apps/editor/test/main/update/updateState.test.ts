import { describe, expect, it } from 'vitest'
import {
  afterAllClosed,
  nextState,
  shouldCheck,
  type UpdateState
} from '../../../src/main/update/updateState'

describe('updateState', () => {
  const s0: UpdateState = { kind: 'idle' }

  it('확인 → 받는 중 → 준비됨', () => {
    let s = nextState(s0, { type: 'checking' })
    expect(s).toEqual({ kind: 'checking' })
    s = nextState(s, { type: 'available', version: '0.1.1' })
    expect(s).toEqual({ kind: 'downloading', version: '0.1.1', percent: 0 })
    s = nextState(s, { type: 'progress', percent: 42.7 })
    expect(s).toEqual({ kind: 'downloading', version: '0.1.1', percent: 42 })
    s = nextState(s, { type: 'downloaded', version: '0.1.1' })
    expect(s).toEqual({ kind: 'ready', version: '0.1.1' })
  })

  it('최신·오류', () => {
    expect(nextState({ kind: 'checking' }, { type: 'not-available', version: '0.1.0' })).toEqual({
      kind: 'latest',
      version: '0.1.0'
    })
    expect(nextState({ kind: 'checking' }, { type: 'error', message: 'net' })).toEqual({
      kind: 'error',
      message: 'net'
    })
  })

  it('준비된 업데이트는 이후 오류·확인으로 사라지지 않는다', () => {
    const ready: UpdateState = { kind: 'ready', version: '0.1.1' }
    expect(nextState(ready, { type: 'error', message: 'x' })).toBe(ready)
    expect(nextState(ready, { type: 'checking' })).toBe(ready)
    expect(nextState(ready, { type: 'not-available', version: '0.1.1' })).toBe(ready)
  })

  it('받는 중이 아닐 때의 progress는 무시', () => {
    expect(nextState({ kind: 'checking' }, { type: 'progress', percent: 10 })).toEqual({ kind: 'checking' })
  })

  it('중복 확인 방지', () => {
    expect(shouldCheck({ kind: 'idle' })).toBe(true)
    expect(shouldCheck({ kind: 'latest', version: '1.0.0' })).toBe(true)
    expect(shouldCheck({ kind: 'error', message: '' })).toBe(true)
    expect(shouldCheck({ kind: 'checking' })).toBe(false)
    expect(shouldCheck({ kind: 'downloading', version: '1', percent: 3 })).toBe(false)
    expect(shouldCheck({ kind: 'ready', version: '1' })).toBe(false)
  })

  it('모든 창이 닫힌 뒤', () => {
    expect(afterAllClosed(true, true)).toBe('install')
    expect(afterAllClosed(true, false)).toBe('quit')
    expect(afterAllClosed(false, true)).toBe('quit')
  })
})
