/** 관측한 오디오 시계 한 칸이 이보다 크면 멈췄다가 재개된 것으로 보고 앞서 나갈 한도로 쓰지 않는다. */
const MAX_STEP_SEC = 0.1

/**
 * AudioContext.currentTime은 오디오 버퍼 단위(수 ms~수십 ms)로 계단처럼 올라가서, 화면 프레임마다
 * 그대로 읽으면 멈춤과 점프가 반복된다. 마지막으로 오디오 시계가 올라간 순간을 기준점으로 잡고
 * 그 뒤로는 벽시계(performance.now)로 메워 매끄럽게 만든다.
 *
 * - 결과는 원래 시계(raw) 이상이고, 앞서는 폭은 최근 관측한 한 칸 크기를 넘지 않는다.
 * - 뒤로 가지 않는다.
 */
export class SmoothClock {
  private anchorSec = 0
  private anchorWallMs = 0
  private lastRawSec = Number.NaN
  private maxLeadSec = 0
  private lastSec = -Infinity

  /** 새 재생을 시작할 때 부른다. */
  reset(): void {
    this.lastRawSec = Number.NaN
    this.maxLeadSec = 0
    this.lastSec = -Infinity
  }

  /** `rawSec`: 지금 읽은 오디오 시계(초), `wallMs`: 지금 벽시계(ms). 매끄럽게 만든 오디오 시각(초)을 돌려준다. */
  read(rawSec: number, wallMs: number): number {
    if (Number.isNaN(this.lastRawSec)) {
      this.anchor(rawSec, wallMs)
    } else if (rawSec !== this.lastRawSec) {
      const step = rawSec - this.lastRawSec
      this.maxLeadSec = step > 0 && step <= MAX_STEP_SEC ? step : 0
    }
    this.lastRawSec = rawSec

    let est = this.anchorSec + (wallMs - this.anchorWallMs) / 1000
    if (est < rawSec) {
      // 오디오 시계가 더 앞서 있다: 이 순간을 새 기준점으로
      est = rawSec
      this.anchor(est, wallMs)
    } else if (est > rawSec + this.maxLeadSec) {
      // 오디오가 멈췄거나 벽시계가 더 빠르다: 한도까지만
      est = rawSec + this.maxLeadSec
      this.anchor(est, wallMs)
    }
    this.lastSec = Math.max(this.lastSec, est)
    return this.lastSec
  }

  private anchor(sec: number, wallMs: number): void {
    this.anchorSec = sec
    this.anchorWallMs = wallMs
  }
}
