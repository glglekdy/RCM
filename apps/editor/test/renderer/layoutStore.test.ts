import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LAYOUT, type PlayfieldLayout } from '@rcm/playfield'

const api = {
  getGameplayLayout: vi.fn<() => Promise<PlayfieldLayout>>(),
  setGameplayLayout: vi.fn<(layout: PlayfieldLayout) => Promise<void>>()
}

async function freshStore() {
  vi.resetModules()
  return import('../../src/renderer/src/gameplay/layoutStore')
}

const wide = (laneWidth: number): PlayfieldLayout => ({ ...DEFAULT_LAYOUT, laneWidth })

describe('게임플레이 레이아웃 store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { rcm: api })
    api.getGameplayLayout.mockReset()
    api.setGameplayLayout.mockReset().mockResolvedValue(undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('불러오기 전에는 기본값, 불러오면 저장된 값', async () => {
    const store = await freshStore()
    expect(store.getLayout()).toEqual(DEFAULT_LAYOUT)
    api.getGameplayLayout.mockResolvedValue(wide(90))
    await store.loadLayout()
    expect(store.getLayout()).toEqual(wide(90))
  })

  it('연달아 바꾸면 마지막 값만 저장', async () => {
    const store = await freshStore()
    store.setLayout(wide(70))
    store.setLayout(wide(80))
    store.setLayout(wide(90))
    expect(store.getLayout()).toEqual(wide(90))
    await vi.advanceTimersByTimeAsync(299)
    expect(api.setGameplayLayout).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(api.setGameplayLayout.mock.calls).toEqual([[wide(90)]])
  })

  it('같은 값이면 저장하지 않음', async () => {
    const store = await freshStore()
    store.setLayout({ ...DEFAULT_LAYOUT })
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.setGameplayLayout).not.toHaveBeenCalled()
  })

  it('저장 실패해도 값 유지', async () => {
    const store = await freshStore()
    api.setGameplayLayout.mockRejectedValue(new Error('EBUSY'))
    store.setLayout(wide(100))
    await vi.advanceTimersByTimeAsync(300)
    expect(store.getLayout()).toEqual(wide(100))
    expect(console.warn).toHaveBeenCalled()
  })

  it('구독자에게 알림', async () => {
    const store = await freshStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.setLayout(wide(70))
    store.setLayout(wide(71))
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    store.setLayout(wide(72))
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
