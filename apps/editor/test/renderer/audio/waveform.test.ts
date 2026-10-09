import { describe, expect, it } from 'vitest'
import { computePeaks, peakInRange } from '../../../src/renderer/src/editor/audio/waveform'

describe('computePeaks', () => {
  it('채널 평균의 블록 최대', () => {
    const l = new Float32Array([0.5, -1, 0, 0.2])
    const r = new Float32Array([0.5, 1, 0, -0.6])
    const peaks = computePeaks([l, r], 1000, 2).peaks
    expect(peaks).toHaveLength(2)
    // Float32 저장이라 0.2가 정확히 떨어지지 않는다
    expect(peaks[0]).toBeCloseTo(0.5)
    expect(peaks[1]).toBeCloseTo(0.2)
  })
})

describe('peakInRange', () => {
  it('범위 최대, 곡 밖은 0', () => {
    const w = { blockSize: 2, sampleRate: 1000, peaks: new Float32Array([0.1, 0.9, 0.3]) } // 블록 하나 = 2ms
    expect(peakInRange(w, 0, 1.9)).toBeCloseTo(0.1)
    expect(peakInRange(w, 0, 4)).toBeCloseTo(0.9)
    expect(peakInRange(w, -10, -5)).toBe(0)
    expect(peakInRange(w, 100, 200)).toBe(0)
  })
})
