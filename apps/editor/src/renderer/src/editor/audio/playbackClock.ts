/**
 * 오디오 시계(ctx 초)를 곡 위치(ms)로 바꾼다. 재생 속도(rate)만큼 곡이 빨리 또는 느리게 흐른다.
 * 속도를 바꾸면 그 순간의 위치를 새 기준으로 잡아, 위치가 튀지 않고 이어진다.
 */
export class PlaybackClock {
  private anchorCtxSec = 0
  private anchorMs = 0
  private current = 1

  get rate(): number {
    return this.current
  }

  /** ctx 시각 `ctxSec`에 곡 위치 `fromMs`에서 `rate` 속도로 흐르기 시작한다. */
  start(ctxSec: number, fromMs: number, rate: number): void {
    this.anchorCtxSec = ctxSec
    this.anchorMs = fromMs
    this.current = rate
  }

  positionMs(ctxSec: number): number {
    return this.anchorMs + (ctxSec - this.anchorCtxSec) * 1000 * this.current
  }

  /** 지금 속도로 곡 위치 `songMs`에 닿는 ctx 시각(초). */
  ctxTimeAt(songMs: number): number {
    return this.anchorCtxSec + (songMs - this.anchorMs) / 1000 / this.current
  }

  /** ctx 시각 `ctxSec`부터 새 속도로 흐른다. */
  setRate(ctxSec: number, rate: number): void {
    this.anchorMs = this.positionMs(ctxSec)
    this.anchorCtxSec = ctxSec
    this.current = rate
  }
}
