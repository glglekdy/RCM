export interface WaveformPeaks {
  /** 블록 하나가 덮는 샘플 수 */
  blockSize: number
  sampleRate: number
  /** 블록마다 채널 평균의 최대 절댓값 */
  peaks: Float32Array
}

/** 디코딩된 채널들에서 블록별 피크를 한 번에 계산한다. */
export function computePeaks(
  channels: Float32Array[],
  sampleRate: number,
  blockSize = 256
): WaveformPeaks {
  const length = channels[0]?.length ?? 0
  const count = Math.ceil(length / blockSize)
  const peaks = new Float32Array(count)
  const n = channels.length
  for (let b = 0; b < count; b++) {
    const end = Math.min(length, (b + 1) * blockSize)
    let max = 0
    for (let i = b * blockSize; i < end; i++) {
      let sum = 0
      for (let c = 0; c < n; c++) sum += channels[c][i]
      const v = Math.abs(sum / n)
      if (v > max) max = v
    }
    peaks[b] = max
  }
  return { blockSize, sampleRate, peaks }
}

/** [fromMs, toMs]에 걸친 블록들의 최댓값. 범위가 곡 밖이면 0. */
export function peakInRange(w: WaveformPeaks, fromMs: number, toMs: number): number {
  if (toMs < 0 || w.peaks.length === 0) return 0
  const blockMs = (w.blockSize / w.sampleRate) * 1000
  const first = Math.max(0, Math.floor(fromMs / blockMs))
  const last = Math.min(w.peaks.length - 1, Math.floor(toMs / blockMs))
  let max = 0
  for (let i = first; i <= last; i++) if (w.peaks[i] > max) max = w.peaks[i]
  return max
}
