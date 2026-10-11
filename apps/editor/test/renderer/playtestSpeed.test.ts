import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = {
  getPlaytestSpeed: vi.fn<() => Promise<number | null>>(),
  setPlaytestSpeed: vi.fn<(speed: number) => Promise<void>>()
}

async function freshStore() {
  vi.resetModules()
  return import('../../src/renderer/src/editor/playtest/speedStore')
}

describe('테스트 플레이 배속 저장', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { rcm: api })
    api.getPlaytestSpeed.mockReset()
    api.setPlaytestSpeed.mockReset().mockResolvedValue(undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('불러오기 전에는 기본 4.0, 불러오면 저장된 값', async () => {
    const store = await freshStore()
    expect(store.getPlaytestSpeed()).toBe(4)
    api.getPlaytestSpeed.mockResolvedValue(6.3)
    await store.loadPlaytestSpeed()
    expect(store.getPlaytestSpeed()).toBe(6.3)
  })

  it('저장된 값이 없으면 기본값 유지', async () => {
    const store = await freshStore()
    api.getPlaytestSpeed.mockResolvedValue(null)
    await store.loadPlaytestSpeed()
    expect(store.getPlaytestSpeed()).toBe(4)
  })

  it('바로 반영하고, 연달아 바꾸면 0.5초 뒤 마지막 값만 저장', async () => {
    const store = await freshStore()
    store.setPlaytestSpeed(4.1)
    store.setPlaytestSpeed(4.2)
    store.setPlaytestSpeed(4.3)
    expect(store.getPlaytestSpeed()).toBe(4.3)
    await vi.advanceTimersByTimeAsync(499)
    expect(api.setPlaytestSpeed).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(api.setPlaytestSpeed.mock.calls).toEqual([[4.3]])
  })

  it('저장에 실패해도 던지지 않고 값은 유지', async () => {
    const store = await freshStore()
    api.setPlaytestSpeed.mockRejectedValue(new Error('EBUSY'))
    store.setPlaytestSpeed(5)
    await vi.advanceTimersByTimeAsync(500)
    expect(store.getPlaytestSpeed()).toBe(5)
    expect(console.warn).toHaveBeenCalled()
  })
})
