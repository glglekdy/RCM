import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { DEFAULT_HIT_EFFECT_SETTINGS, HIT_EFFECT_LIMITS } from '../../editor/src/shared/hitEffects'
import { openRcmDb } from '../src/api/db'
import { createHitEffects } from '../src/api/hitEffects'
import { createSettings } from '../src/api/settings'

let n = 0
const fresh = async () => {
  const db = await openRcmDb(`effects-${++n}`)
  const settings = createSettings(db)
  return { db, settings, effects: createHitEffects(db, settings) }
}

const png = (name: string, ...bytes: number[]) => new File([new Uint8Array(bytes)], name, { type: 'image/png' })
const bytesOf = (images: Uint8Array[]) => images.map((b) => [...b])

describe('createHitEffects', () => {
  it('저장된 값이 없으면 기본 설정이에요', async () => {
    const { effects } = await fresh()
    expect(await effects.getHitEffects()).toEqual(DEFAULT_HIT_EFFECT_SETTINGS)
    expect(await effects.readHitEffectImages('perfect')).toEqual([])
  })

  it('프레임은 자연 정렬한 순서로 읽어요', async () => {
    const { effects } = await fresh()
    const next = await effects.importFiles('perfect', 'frames', [png('f10.png', 10), png('f2.png', 2), png('f1.png', 1)])
    expect(next.perfect).toEqual({ type: 'frames', files: ['0001.png', '0002.png', '0003.png'], fps: 30 })
    expect(bytesOf(await effects.readHitEffectImages('perfect'))).toEqual([[1], [2], [10]])
    expect((await effects.getHitEffects()).perfect).toEqual(next.perfect)
  })

  it('시트는 첫 장만 sheet.png로 저장해요', async () => {
    const { effects } = await fresh()
    const next = await effects.importFiles('normal', 'sheet', [png('a.png', 5), png('b.png', 6)])
    expect(next.normal).toMatchObject({ type: 'sheet', file: 'sheet.png', cols: 1, rows: 1, count: 1 })
    expect(bytesOf(await effects.readHitEffectImages('normal'))).toEqual([[5]])
  })

  it('PNG가 아닌 파일이 섞이면 거부하고 슬롯은 그대로예요', async () => {
    const { effects } = await fresh()
    await effects.importFiles('perfect', 'frames', [png('a.png', 1)])
    await expect(effects.importFiles('perfect', 'frames', [png('a.png', 2), png('b.jpg', 3)])).rejects.toThrow(
      'PNG 파일만 쓸 수 있어요'
    )
    expect(bytesOf(await effects.readHitEffectImages('perfect'))).toEqual([[1]])
  })

  it('빈 선택, 프레임 수 초과, 10MB 초과를 거부해요', async () => {
    const { effects } = await fresh()
    await expect(effects.importFiles('perfect', 'sheet', [])).rejects.toThrow('고른 파일이 없어요')
    const many = Array.from({ length: HIT_EFFECT_LIMITS.maxFrames + 1 }, (_, i) => png(`${i}.png`, 1))
    await expect(effects.importFiles('perfect', 'frames', many)).rejects.toThrow(
      `프레임은 ${HIT_EFFECT_LIMITS.maxFrames}장까지 넣을 수 있어요`
    )
    const big = new File([new Uint8Array(HIT_EFFECT_LIMITS.maxFileBytes + 1)], 'big.png')
    await expect(effects.importFiles('perfect', 'sheet', [big])).rejects.toThrow('파일 하나가 10MB를 넘어요')
  })

  it('슬롯과 형식이 올바르지 않으면 거부해요', async () => {
    const { effects } = await fresh()
    // @ts-expect-error 잘못된 슬롯
    await expect(effects.importFiles('x', 'sheet', [png('a.png', 1)])).rejects.toThrow('이펙트 슬롯이 올바르지 않아요')
    // @ts-expect-error 잘못된 형식
    await expect(effects.importFiles('perfect', 'x', [png('a.png', 1)])).rejects.toThrow('이펙트 형식이 올바르지 않아요')
    // @ts-expect-error 잘못된 슬롯
    await expect(effects.clearHitEffect('x')).rejects.toThrow('이펙트 슬롯이 올바르지 않아요')
  })

  it('비우면 슬롯 설정과 이미지가 사라져요', async () => {
    const { effects } = await fresh()
    await effects.importFiles('perfect', 'frames', [png('a.png', 1)])
    await effects.importFiles('normal', 'frames', [png('a.png', 2)])
    const next = await effects.clearHitEffect('perfect')
    expect(next.perfect).toBeUndefined()
    expect(next.normal).toBeDefined()
    expect(await effects.readHitEffectImages('perfect')).toEqual([])
    expect(bytesOf(await effects.readHitEffectImages('normal'))).toEqual([[2]])
  })

  it('setHitEffects는 숫자만 바꾸고 파일 이름은 지켜요', async () => {
    const { effects } = await fresh()
    const imported = await effects.importFiles('perfect', 'frames', [png('a.png', 1)])
    await effects.setHitEffects({
      ...imported,
      enabled: false,
      size: 9999,
      perfect: { type: 'frames', files: ['evil.png'], fps: 60 }
    })
    const saved = await effects.getHitEffects()
    expect(saved.enabled).toBe(false)
    expect(saved.size).toBe(HIT_EFFECT_LIMITS.size.max)
    expect(saved.perfect).toEqual({ type: 'frames', files: ['0001.png'], fps: 60 })
    expect(bytesOf(await effects.readHitEffectImages('perfect'))).toEqual([[1]])
  })
})
