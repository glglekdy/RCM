import { describe, expect, it } from 'vitest'
import { SmoothClock } from '../../../src/renderer/src/editor/audio/smoothClock'

/** 10ms마다 한 칸씩 올라가는 오디오 시계 */
const steppedRaw = (trueSec: number): number => Math.floor(trueSec / 0.01) * 0.01

describe('SmoothClock', () => {
  it('계단식 시계를 화면 프레임 간격대로 매끄럽게 만든다', () => {
    const clock = new SmoothClock()
    const frameMs = 1000 / 144
    let prev = Number.NaN
    const deltas: number[] = []
    for (let i = 0; i < 1000; i++) {
      const wallMs = i * frameMs
      const trueSec = wallMs / 1000
      const raw = steppedRaw(trueSec)
      const t = clock.read(raw, wallMs)
      expect(t).toBeGreaterThanOrEqual(raw)
      expect(t).toBeLessThanOrEqual(trueSec + 1e-9)
      if (i > 50) deltas.push((t - prev) * 1000)
      prev = t
    }
    // 처음 몇 칸이 지나면 프레임마다 거의 일정하게 움직인다 (원래 시계는 0ms/10ms를 오간다)
    for (const d of deltas) expect(Math.abs(d - frameMs)).toBeLessThan(1)
  })

  it('뒤로 가지 않는다', () => {
    const clock = new SmoothClock()
    let prev = -Infinity
    for (let i = 0; i < 500; i++) {
      const wallMs = i * 16.7 + (i % 3) * 2
      const t = clock.read(steppedRaw(wallMs / 1000), wallMs)
      expect(t).toBeGreaterThanOrEqual(prev)
      prev = t
    }
  })

  it('오디오 시계가 멈춰 있으면 앞서 나가지 않는다', () => {
    const clock = new SmoothClock()
    for (let i = 0; i < 20; i++) expect(clock.read(5, i * 16.7)).toBe(5)
  })

  it('멈췄다가 재개해도 앞서는 폭이 한 칸을 넘지 않는다', () => {
    const clock = new SmoothClock()
    // 정상 재생 후 오디오만 200ms 멈춤
    for (let i = 0; i <= 30; i++) clock.read(steppedRaw(i * 0.007), i * 7)
    const frozen = steppedRaw(30 * 0.007)
    for (let i = 31; i < 60; i++) {
      expect(clock.read(frozen, i * 7)).toBeLessThanOrEqual(frozen + 0.01 + 1e-9)
    }
    // 재개: 멈춘 지점부터 다시 10ms 단위로
    for (let i = 60; i < 200; i++) {
      const raw = frozen + steppedRaw((i - 60) * 0.007)
      const t = clock.read(raw, i * 7)
      expect(t).toBeLessThanOrEqual(raw + 0.01 + 1e-9)
    }
  })
})
