import { describe, expect, it, vi } from 'vitest'

async function freshStore() {
  vi.resetModules()
  return import('../../src/renderer/src/editor/playtest/rateStore')
}

describe('테스트 플레이 배속 플레이 값', () => {
  it('기본 1.0, 바꾸면 기억하고 범위를 지킨다', async () => {
    const store = await freshStore()
    expect(store.getPlaytestRate()).toBe(1)
    store.setPlaytestRate(2)
    expect(store.getPlaytestRate()).toBe(2)
    store.setPlaytestRate(99)
    expect(store.getPlaytestRate()).toBe(5)
    store.setPlaytestRate(0)
    expect(store.getPlaytestRate()).toBe(0.1)
  })

  it('모듈을 새로 읽으면(앱 재시작) 1.0으로 돌아간다', async () => {
    const a = await freshStore()
    a.setPlaytestRate(3)
    const b = await freshStore()
    expect(b.getPlaytestRate()).toBe(1)
  })
})
