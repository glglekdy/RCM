import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HitEffectSlot } from '@rcm/playfield'
import type { HitEffectSettings, HitEffectSource } from '../../src/shared/hitEffects'

const api = {
  getHitEffects: vi.fn<() => Promise<HitEffectSettings>>(),
  setHitEffects: vi.fn<(s: HitEffectSettings) => Promise<void>>(),
  pickHitEffect: vi.fn<(slot: HitEffectSlot, type: 'sheet' | 'frames') => Promise<HitEffectSettings | null>>(),
  clearHitEffect: vi.fn<(slot: HitEffectSlot) => Promise<HitEffectSettings>>(),
  readHitEffectImages: vi.fn<(slot: HitEffectSlot) => Promise<Uint8Array[]>>()
}

/** 가짜 비트맵: 크기만 있다 */
const bitmap = (width: number, height: number) => ({ width, height, close: vi.fn() }) as unknown as ImageBitmap

async function freshStore() {
  vi.resetModules()
  return import('../../src/renderer/src/gameplay/hitEffectStore')
}

const base: HitEffectSettings = { enabled: true, size: 128, blend: 'normal' }
const sheet: HitEffectSource = { type: 'sheet', file: 'sheet.png', cols: 4, rows: 2, count: 6, fps: 24 }

describe('buildSprite', () => {
  it('시트는 칸·줄·count로 자르고, 프레임은 이미지마다 한 장', async () => {
    const { buildSprite } = await freshStore()
    const big = bitmap(400, 200)
    const s = buildSprite(sheet, [big])
    expect(s.fps).toBe(24)
    expect(s.frames).toHaveLength(6)
    expect(s.frames[5]).toMatchObject({ image: big, sx: 100, sy: 100, sw: 100, sh: 100 })
    const a = bitmap(10, 20)
    const b = bitmap(10, 20)
    const f = buildSprite({ type: 'frames', files: ['0001.png', '0002.png'], fps: 12 }, [a, b])
    expect(f.frames).toEqual([
      { image: a, sx: 0, sy: 0, sw: 10, sh: 20 },
      { image: b, sx: 0, sy: 0, sw: 10, sh: 20 }
    ])
  })
})

describe('타격 이펙트 store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', { rcm: api })
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap(400, 200))
    )
    for (const f of Object.values(api)) f.mockReset()
    api.setHitEffects.mockResolvedValue(undefined)
    api.readHitEffectImages.mockResolvedValue([new Uint8Array([1])])
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('불러오기 전에는 기본값, 불러오면 슬롯마다 이미지를 읽어 스프라이트를 만든다', async () => {
    const store = await freshStore()
    expect(store.getHitEffects()).toEqual(base)
    api.getHitEffects.mockResolvedValue({ ...base, size: 200, perfect: sheet })
    await store.loadHitEffects()
    const fx = store.getHitEffects()
    expect(fx.size).toBe(200)
    expect(fx.perfect?.frames).toHaveLength(6)
    expect(fx.normal).toBeUndefined()
    expect(api.readHitEffectImages.mock.calls).toEqual([['perfect']])
  })

  it('파일을 못 읽은 슬롯은 기본 이펙트와 오류', async () => {
    const store = await freshStore()
    api.getHitEffects.mockResolvedValue({ ...base, perfect: sheet })
    api.readHitEffectImages.mockRejectedValue(new Error('ENOENT'))
    await store.loadHitEffects()
    expect(store.getHitEffects().perfect).toBeUndefined()
    expect(store.getHitEffectErrors()).toEqual({ perfect: '이펙트 파일을 읽지 못해서 기본 이펙트를 써요' })
  })

  it('디코드 실패도 오류', async () => {
    const store = await freshStore()
    api.getHitEffects.mockResolvedValue({ ...base, normal: sheet })
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('bad png'))))
    await store.loadHitEffects()
    expect(store.getHitEffects().normal).toBeUndefined()
    expect(store.getHitEffectErrors().normal).toBeDefined()
  })

  it('칸 수만 바꾸면 다시 읽지 않고 바로 반영, 마지막 값만 저장', async () => {
    const store = await freshStore()
    api.getHitEffects.mockResolvedValue({ ...base, perfect: sheet })
    await store.loadHitEffects()
    const listener = vi.fn()
    store.subscribe(listener)
    store.updateHitEffectSettings({ ...base, perfect: { ...sheet, cols: 2, rows: 1, count: 2 } })
    expect(store.getHitEffects().perfect?.frames).toHaveLength(2)
    store.updateHitEffectSettings({ ...base, size: 64, perfect: { ...sheet, cols: 2, rows: 1, count: 1 } })
    expect(store.getHitEffects().perfect?.frames).toHaveLength(1)
    expect(store.getHitEffects().size).toBe(64)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(api.readHitEffectImages).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(299)
    expect(api.setHitEffects).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(api.setHitEffects.mock.calls).toEqual([[{ ...base, size: 64, perfect: { ...sheet, cols: 2, rows: 1, count: 1 } }]])
  })

  it('저장 실패해도 값 유지', async () => {
    const store = await freshStore()
    api.setHitEffects.mockRejectedValue(new Error('EBUSY'))
    store.updateHitEffectSettings({ ...base, enabled: false })
    await vi.advanceTimersByTimeAsync(300)
    expect(store.getHitEffects().enabled).toBe(false)
    expect(console.warn).toHaveBeenCalled()
  })

  it('pickHitEffect: 새 설정과 그 슬롯 이미지를 다시 읽음', async () => {
    const store = await freshStore()
    api.getHitEffects.mockResolvedValue(base)
    await store.loadHitEffects()
    api.pickHitEffect.mockResolvedValue({ ...base, normal: { type: 'frames', files: ['0001.png', '0002.png'], fps: 30 } })
    api.readHitEffectImages.mockResolvedValue([new Uint8Array([1]), new Uint8Array([2])])
    await store.pickHitEffect('normal', 'frames')
    expect(api.pickHitEffect).toHaveBeenCalledWith('normal', 'frames')
    expect(store.getHitEffects().normal?.frames).toHaveLength(2)
    expect(store.getHitEffectSettings().normal?.type).toBe('frames')
  })

  it('pickHitEffect 취소면 그대로', async () => {
    const store = await freshStore()
    api.pickHitEffect.mockResolvedValue(null)
    const before = store.getHitEffects()
    await store.pickHitEffect('perfect', 'sheet')
    expect(store.getHitEffects()).toBe(before)
    expect(api.readHitEffectImages).not.toHaveBeenCalled()
  })

  it('pickHitEffect 오류는 그대로 던짐', async () => {
    const store = await freshStore()
    api.pickHitEffect.mockRejectedValue(new Error('PNG 파일만 쓸 수 있어요'))
    await expect(store.pickHitEffect('perfect', 'sheet')).rejects.toThrow('PNG 파일만 쓸 수 있어요')
  })

  it('pickHitEffect 오류는 IPC 접두사를 떼고 던짐', async () => {
    const store = await freshStore()
    api.pickHitEffect.mockRejectedValue(
      new Error("Error invoking remote method 'rcm:pick-hit-effect': Error: 프레임은 120장까지 넣을 수 있어요")
    )
    await expect(store.pickHitEffect('normal', 'frames')).rejects.toThrow(/^프레임은 120장까지 넣을 수 있어요$/)
  })

  it('겹친 불러오기는 나중에 시작한 것이 이기고, 늦게 끝난 옛 결과는 닫음', async () => {
    const store = await freshStore()
    const oldBmp = bitmap(400, 200)
    const newBmp = bitmap(400, 200)
    let releaseOld!: (v: Uint8Array[]) => void
    api.readHitEffectImages
      .mockImplementationOnce(() => new Promise((r) => (releaseOld = r)))
      .mockResolvedValueOnce([new Uint8Array([2])])
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (blob: Blob) => ((await blob.arrayBuffer()).byteLength === 1 && new Uint8Array(await blob.arrayBuffer())[0] === 2 ? newBmp : oldBmp))
    )
    api.pickHitEffect.mockResolvedValue({ ...base, perfect: sheet })
    const first = store.pickHitEffect('perfect', 'sheet')
    await store.pickHitEffect('perfect', 'sheet')
    releaseOld([new Uint8Array([1])])
    await first
    expect(store.getHitEffects().perfect?.frames[0].image).toBe(newBmp)
    expect(oldBmp.close).toHaveBeenCalled()
    expect(newBmp.close).not.toHaveBeenCalled()
  })

  it('clearHitEffect: 슬롯과 오류를 비움', async () => {
    const store = await freshStore()
    api.getHitEffects.mockResolvedValue({ ...base, perfect: sheet })
    api.readHitEffectImages.mockRejectedValue(new Error('ENOENT'))
    await store.loadHitEffects()
    api.clearHitEffect.mockResolvedValue(base)
    await store.clearHitEffect('perfect')
    expect(store.getHitEffects().perfect).toBeUndefined()
    expect(store.getHitEffectSettings().perfect).toBeUndefined()
    expect(store.getHitEffectErrors()).toEqual({})
  })
})
