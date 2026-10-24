import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HIT_EFFECT_SETTINGS,
  HIT_EFFECT_SLOTS,
  isHitEffectSlot,
  isSafeEffectFileName,
  sanitizeHitEffectSettings
} from '../../src/shared/hitEffects'

describe('sanitizeHitEffectSettings', () => {
  it('없거나 깨진 값은 기본값', () => {
    expect(DEFAULT_HIT_EFFECT_SETTINGS).toEqual({ enabled: true, size: 128, blend: 'normal' })
    expect(sanitizeHitEffectSettings(undefined)).toEqual(DEFAULT_HIT_EFFECT_SETTINGS)
    expect(sanitizeHitEffectSettings([])).toEqual(DEFAULT_HIT_EFFECT_SETTINGS)
    expect(sanitizeHitEffectSettings({ enabled: 'yes', size: 'big', blend: 'x' })).toEqual(DEFAULT_HIT_EFFECT_SETTINGS)
  })

  it('올바른 값은 그대로', () => {
    const raw = {
      enabled: false,
      size: 200,
      blend: 'add',
      perfect: { type: 'sheet', file: 'sheet.png', cols: 4, rows: 2, count: 8, fps: 30 },
      normal: { type: 'frames', files: ['0001.png', '0002.png'], fps: 24 }
    }
    expect(sanitizeHitEffectSettings(raw)).toEqual(raw)
  })

  it('숫자는 반올림 후 범위로 자름', () => {
    const s = sanitizeHitEffectSettings({
      size: 9999,
      perfect: { type: 'sheet', file: 'sheet.png', cols: 0, rows: 40, count: 999, fps: -3 }
    })
    expect(s.size).toBe(512)
    expect(s.perfect).toEqual({ type: 'sheet', file: 'sheet.png', cols: 1, rows: 32, count: 32, fps: 1 })
    expect(sanitizeHitEffectSettings({ size: 10.6 }).size).toBe(32)
  })

  it('시트 count가 없으면 칸×줄', () => {
    expect(sanitizeHitEffectSettings({ normal: { type: 'sheet', file: 'sheet.png', cols: 3, rows: 2, fps: 30 } }).normal)
      .toEqual({ type: 'sheet', file: 'sheet.png', cols: 3, rows: 2, count: 6, fps: 30 })
  })

  it('위험한 파일 이름은 버림', () => {
    expect(
      sanitizeHitEffectSettings({ normal: { type: 'sheet', file: '../x.png', cols: 1, rows: 1, count: 1, fps: 30 } }).normal
    ).toBeUndefined()
    expect(
      sanitizeHitEffectSettings({ normal: { type: 'frames', files: ['0001.png', 'a/b.png', '..', 'c\\d.png'], fps: 30 } })
        .normal
    ).toEqual({ type: 'frames', files: ['0001.png'], fps: 30 })
  })

  it('프레임이 하나도 없으면 슬롯 없음, 120장을 넘으면 앞 120장', () => {
    expect(sanitizeHitEffectSettings({ normal: { type: 'frames', files: [], fps: 30 } }).normal).toBeUndefined()
    const files = Array.from({ length: 130 }, (_, i) => `${String(i + 1).padStart(4, '0')}.png`)
    const s = sanitizeHitEffectSettings({ normal: { type: 'frames', files, fps: 30 } })
    expect(s.normal?.type === 'frames' && s.normal.files).toEqual(files.slice(0, 120))
  })

  it('모르는 type은 버림', () => {
    expect(sanitizeHitEffectSettings({ perfect: { type: 'gif', file: 'a.png' } }).perfect).toBeUndefined()
  })
})

describe('isSafeEffectFileName', () => {
  it('.png 이름만, 경로 구분자와 ..은 안 됨', () => {
    expect(isSafeEffectFileName('sheet.png')).toBe(true)
    expect(isSafeEffectFileName('0001.PNG')).toBe(true)
    expect(isSafeEffectFileName('a.jpg')).toBe(false)
    expect(isSafeEffectFileName('../a.png')).toBe(false)
    expect(isSafeEffectFileName('a/b.png')).toBe(false)
    expect(isSafeEffectFileName('')).toBe(false)
    expect(isSafeEffectFileName(3)).toBe(false)
  })
})

describe('isHitEffectSlot', () => {
  it('perfect · normal만', () => {
    expect(HIT_EFFECT_SLOTS).toEqual(['perfect', 'normal'])
    expect(isHitEffectSlot('perfect')).toBe(true)
    expect(isHitEffectSlot('normal')).toBe(true)
    expect(isHitEffectSlot('great')).toBe(false)
  })
})
