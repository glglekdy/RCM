import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = {
  getJudgeOffset: vi.fn<() => Promise<number>>(),
  setJudgeOffset: vi.fn<(ms: number) => Promise<void>>()
}

async function freshStore() {
  vi.resetModules()
  return import('../../src/renderer/src/gameplay/judgeOffsetStore')
}

describe('판정 오프셋 store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { rcm: api })
    api.getJudgeOffset.mockReset()
    api.setJudgeOffset.mockReset().mockResolvedValue(undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('불러오기 전에는 0, 불러오면 저장된 값', async () => {
    const store = await freshStore()
    expect(store.getJudgeOffset()).toBe(0)
    api.getJudgeOffset.mockResolvedValue(35)
    await store.loadJudgeOffset()
    expect(store.getJudgeOffset()).toBe(35)
  })

  it('바꾸면 바로 반영하고 300ms 뒤 한 번만 저장한다', async () => {
    const store = await freshStore()
    store.setJudgeOffset(10)
    store.setJudgeOffset(20)
    store.setJudgeOffset(30)
    expect(store.getJudgeOffset()).toBe(30)
    await vi.advanceTimersByTimeAsync(299)
    expect(api.setJudgeOffset).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(api.setJudgeOffset.mock.calls).toEqual([[30]])
  })

  it('범위 밖 값은 잘라서 저장한다', async () => {
    const store = await freshStore()
    store.setJudgeOffset(999)
    expect(store.getJudgeOffset()).toBe(200)
    await vi.advanceTimersByTimeAsync(300)
    expect(api.setJudgeOffset.mock.calls).toEqual([[200]])
  })

  it('같은 값이면 저장하지 않는다', async () => {
    const store = await freshStore()
    store.setJudgeOffset(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.setJudgeOffset).not.toHaveBeenCalled()
  })

  it('저장 실패해도 값은 유지하고 경고만 남긴다', async () => {
    const store = await freshStore()
    api.setJudgeOffset.mockRejectedValue(new Error('EBUSY'))
    store.setJudgeOffset(40)
    await vi.advanceTimersByTimeAsync(300)
    expect(store.getJudgeOffset()).toBe(40)
    expect(console.warn).toHaveBeenCalledWith('판정 오프셋을 저장하지 못했어요', expect.any(Error))
  })

  it('구독자에게 알린다', async () => {
    const store = await freshStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.setJudgeOffset(1)
    store.setJudgeOffset(2)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    store.setJudgeOffset(3)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
