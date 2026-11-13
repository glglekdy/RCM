/** 배속 플레이: 곡이 재생되는 빠르기 (노트가 내려오는 빠르기인 "배속"과 다르다) */
export const MIN_RATE = 0.1;
export const MAX_RATE = 5;
export const DEFAULT_RATE = 1;
export const RATE_STEP = 0.1;

/** 범위 안으로 자르고 0.1 단위로 반올림한다. 숫자가 아니면 기본값. */
export function clampRate(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_RATE;
  return Math.round(Math.min(MAX_RATE, Math.max(MIN_RATE, raw)) * 10) / 10;
}

/**
 * 곡 시각(ms)을 실제 시간 빠르기로 흐르는 시각(ms)으로 바꾼다.
 * 판정 글자·이펙트처럼 곡이 빨라지거나 느려져도 평소 빠르기로 보여야 하는 연출에 쓴다.
 * 곡 시각에서 만들기 때문에 곡이 멈추면 같이 멈춘다.
 */
export class RateClock {
  private realBase = 0;
  private songBase = 0;
  private current: number;

  constructor(rate = DEFAULT_RATE) {
    this.current = rate;
  }

  get rate(): number {
    return this.current;
  }

  toReal(songMs: number): number {
    return this.realBase + (songMs - this.songBase) / this.current;
  }

  /** 곡 시각 `songMs`부터 새 빠르기로 흐른다. 그 순간의 값은 이어진다. */
  setRate(rate: number, songMs: number): void {
    this.realBase = this.toReal(songMs);
    this.songBase = songMs;
    this.current = rate;
  }
}
