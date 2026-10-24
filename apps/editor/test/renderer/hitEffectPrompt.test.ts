import { describe, expect, it } from 'vitest'
import { hitEffectPrompt } from '../../src/renderer/src/gameplay/hitEffectPrompt'

describe('hitEffectPrompt', () => {
  it('두 슬롯과 에디터가 읽는 파일 규칙을 알려 준다', () => {
    const text = hitEffectPrompt(false)
    expect(text).toContain('PERFECT')
    expect(text).toContain('GREAT·GOOD')
    expect(text).toContain('MISS')
    expect(text).toContain('왼쪽 → 오른쪽, 위 → 아래')
    expect(text).toContain('0001.png')
    expect(text).toContain('120장')
    expect(text).toContain('10MB')
    expect(text).toContain('32칸')
    expect(text).toContain('1~120fps')
    expect(text).toContain('150ms')
    expect(text).toContain('칸, 줄, 프레임 수, 재생 속도(fps)')
  })

  it('레퍼런스가 있으면 만들기 전에 먼저 달라고 한다', () => {
    const text = hitEffectPrompt(true)
    expect(text).toContain('레퍼런스')
    expect(text).toContain('먼저 나에게 레퍼런스')
    expect(text).not.toContain('레퍼런스는 없어')
  })

  it('레퍼런스가 없으면 묻지 말고 직접 디자인한다', () => {
    const text = hitEffectPrompt(false)
    expect(text).toContain('레퍼런스는 없어')
    expect(text).not.toContain('먼저 나에게 레퍼런스')
  })
})
