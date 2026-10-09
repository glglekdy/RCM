import { describe, expect, it } from 'vitest'
import {
  minimapDyToMs,
  minimapViewport,
  minimapYToMs,
  msToMinimapY
} from '../../src/renderer/src/editor/minimap/geometry'

describe('minimap', () => {
  it('ms ↔ 미니맵 y (아래가 시작)', () => {
    expect(msToMinimapY(0, 700, 60000)).toBe(700)
    expect(msToMinimapY(60000, 700, 60000)).toBe(0)
    expect(minimapYToMs(700, 700, 60000)).toBe(0)
    expect(minimapYToMs(0, 700, 60000)).toBe(60000)
    expect(minimapYToMs(-5, 700, 60000)).toBe(60000)
    expect(minimapYToMs(800, 700, 60000)).toBe(0)
  })

  it('보이는 범위 상자', () => {
    // 타임라인: 재생선 30000ms가 y=600(높이 800의 3/4), 0.3px/ms → 보이는 범위 29333.3 ~ 32000ms
    const r = minimapViewport({ playheadMs: 30000, pxPerMs: 0.3, height: 800 }, 600, 60000)
    expect(r.top).toBeCloseTo(280)
    expect(r.bottom).toBeCloseTo(306.667, 2)
  })

  it('드래그 픽셀 → ms', () => {
    expect(minimapDyToMs(-60, 600, 60000)).toBe(6000)
    expect(minimapDyToMs(30, 600, 60000)).toBe(-3000)
  })
})
