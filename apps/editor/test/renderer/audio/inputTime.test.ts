import { describe, expect, it } from 'vitest'
import { inputTimeMs } from '../../../src/renderer/src/editor/audio/inputTime'

describe('inputTimeMs', () => {
  it('재생 중이면 입력 순간의 오디오 시계 (마지막 프레임의 재생선이 아님)', () => {
    let now = 1000
    const clock = { playing: true, positionMs: () => now }
    expect(inputTimeMs(clock, 992)).toBe(1000)
    now = 1007.5
    expect(inputTimeMs(clock, 992)).toBe(1007.5)
  })
  it('멈춰 있으면 재생선 위치', () => {
    const clock = { playing: false, positionMs: () => 500 }
    expect(inputTimeMs(clock, 1234)).toBe(1234)
  })
})
