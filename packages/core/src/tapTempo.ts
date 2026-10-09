export interface TempoEstimate {
  /** 소수 둘째 자리 반올림 */
  bpm: number;
  beatMs: number;
  /** 회귀 절편 */
  firstTapMs: number;
  /** 첫 탭 이전의 가장 이른 박 */
  firstBeatMs: number;
  /** 잔차 표준편차 */
  deviationMs: number;
  count: number;
}

/** 탭 시각(ms) 배열에서 최소제곱 선형 회귀로 BPM을 추정한다. 탭 4개 미만이면 null. */
export function estimateTempo(tapsMs: number[]): TempoEstimate | null {
  const n = tapsMs.length;
  if (n < 4) return null;

  const meanX = (n - 1) / 2;
  const meanY = tapsMs.reduce((sum, t) => sum + t, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    sxy += dx * (tapsMs[i] - meanY);
    sxx += dx * dx;
  }

  const beatMs = sxy / sxx;
  if (!(beatMs > 0)) return null;
  const firstTapMs = meanY - beatMs * meanX;

  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const residual = tapsMs[i] - (firstTapMs + beatMs * i);
    sumSq += residual * residual;
  }

  return {
    bpm: Math.round((60000 / beatMs) * 100) / 100,
    beatMs,
    firstTapMs,
    firstBeatMs: ((firstTapMs % beatMs) + beatMs) % beatMs,
    deviationMs: Math.sqrt(sumSq / n),
    count: n,
  };
}
