import { afterEach, describe, expect, it, vi } from 'vitest'
import { uuidV4 } from '../src/api/uuid'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuidV4', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('randomUUID가 없는 환경(http)에서도 v4 형식으로 만들어요', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    const a = uuidV4()
    expect(a).toMatch(V4)
    expect(uuidV4()).not.toBe(a)
  })

  it('버전·변형 비트를 바이트가 전부 1이어도 맞춰 넣어요', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (b: Uint8Array) => {
        b.fill(0xff)
        return b
      }
    })
    expect(uuidV4()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
  })

  it('randomUUID가 있으면 그대로 써요', () => {
    expect(uuidV4()).toMatch(V4)
  })
})
