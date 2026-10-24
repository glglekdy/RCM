import { describe, expect, it } from 'vitest'
import { hitEffectPrompt, suggestedFps, type HitEffectPromptOptions } from '../../src/renderer/src/gameplay/hitEffectPrompt'

const base: HitEffectPromptOptions = { hasReference: false, cols: 4, rows: 4, frameSize: 256 }

describe('hitEffectPrompt', () => {
  it('두 슬롯과 에디터가 읽는 파일 규칙을 알려 준다', () => {
    const text = hitEffectPrompt(base)
    expect(text).toContain('PERFECT')
    expect(text).toContain('GREAT·GOOD')
    expect(text).toContain('MISS')
    expect(text).toContain('왼쪽 → 오른쪽, 위 → 아래')
    expect(text).toContain('10MB')
    expect(text).toContain('150ms')
    expect(text).toContain('칸, 줄, 프레임 수, 재생 속도(fps)')
  })

  it('고른 칸×줄과 프레임 크기로 시트 크기를 정해 준다', () => {
    const text = hitEffectPrompt({ ...base, cols: 5, rows: 3, frameSize: 128 })
    expect(text).toContain('가로 5칸 × 세로 3줄')
    expect(text).toContain('15프레임')
    expect(text).toContain('128×128px')
    expect(text).toContain('640×384px')
    expect(text).toContain(`${suggestedFps(15)}fps`)
  })

  it('칸×줄을 바꾸면 프롬프트도 바뀐다', () => {
    expect(hitEffectPrompt(base)).not.toBe(hitEffectPrompt({ ...base, cols: 8, rows: 2 }))
    expect(hitEffectPrompt({ ...base, cols: 8, rows: 2 })).toContain('가로 8칸 × 세로 2줄')
  })

  it('레퍼런스가 있으면 만들기 전에 먼저 달라고 한다', () => {
    const text = hitEffectPrompt({ ...base, hasReference: true })
    expect(text).toContain('먼저 나에게 레퍼런스')
    expect(text).not.toContain('레퍼런스는 없어')
  })

  it('레퍼런스가 없으면 묻지 말고 직접 디자인한다', () => {
    const text = hitEffectPrompt(base)
    expect(text).toContain('레퍼런스는 없어')
    expect(text).not.toContain('먼저 나에게 레퍼런스')
  })
})

describe('suggestedFps', () => {
  it('프레임 수를 0.3초 안팎에 재생하는 fps, 1~120 안', () => {
    expect(suggestedFps(12)).toBe(40)
    expect(suggestedFps(1)).toBe(3)
    expect(suggestedFps(1024)).toBe(120)
  })
})
