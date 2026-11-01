import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { getPicked, isPickedPath, registerPicked } from '../src/api/picked'

describe('picked', () => {
  it('등록한 파일을 같은 객체로 돌려줘요', () => {
    const f = new File(['a'], 'a.png')
    const path = registerPicked(f)
    expect(path).toMatch(/^picked:/)
    expect(isPickedPath(path)).toBe(true)
    expect(getPicked(path)).toBe(f)
  })

  it('없는 경로는 다시 고르라고 알려요', () => {
    expect(() => getPicked('picked:nope')).toThrow('파일을 다시 골라 주세요')
  })

  it('고른 파일 경로만 알아봐요', () => {
    expect(isPickedPath('web:abc/song.mp3')).toBe(false)
    expect(isPickedPath('C:\a.png')).toBe(false)
  })

  it('등록할 때마다 다른 경로를 줘요', () => {
    const f = new File(['a'], 'a.png')
    expect(registerPicked(f)).not.toBe(registerPicked(f))
  })
})
