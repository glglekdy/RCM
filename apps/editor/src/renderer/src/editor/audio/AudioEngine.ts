import { createClickBuffer } from './hitsound'
import { collectDueHits, playbackStartParams } from './schedule'

const TICK_INTERVAL_MS = 25
const LOOK_AHEAD_MS = 100
/** 이미 이만큼(ms) 이내로 지난 hit는 즉시 재생하고, 더 오래된 것은 건너뛴다. */
const LATE_GRACE_MS = 30

/** AudioContext.currentTime을 에디터 전체의 단일 시계로 쓰는 재생 엔진. */
export class AudioEngine {
  readonly ctx: AudioContext

  private duration = 0
  private isPlaying = false
  private disposed = false
  private buffer: AudioBuffer | null = null
  private readonly clickBuffer: AudioBuffer
  private readonly hitGain: GainNode
  private music: AudioBufferSourceNode | null = null
  /** 예약된 효과음 소스와 시작 예정 ctx 시각 */
  private hitSources = new Map<AudioBufferSourceNode, number>()
  private timer: ReturnType<typeof setInterval> | null = null
  private hits: number[] = []
  private cursor = 0
  private startCtxTime = 0
  private fromMs = 0
  private lastPositionMs = 0
  private endedCb: (() => void) | null = null

  constructor() {
    this.ctx = new AudioContext()
    this.clickBuffer = createClickBuffer(this.ctx)
    this.hitGain = this.ctx.createGain()
    this.hitGain.connect(this.ctx.destination)
  }

  get durationMs(): number {
    return this.duration
  }

  get playing(): boolean {
    return this.isPlaying
  }

  async load(data: ArrayBuffer): Promise<void> {
    this.stop()
    this.buffer = await this.ctx.decodeAudioData(data)
    this.duration = this.buffer.duration * 1000
    this.lastPositionMs = 0
  }

  play(fromMs: number): void {
    if (this.disposed || !this.buffer || fromMs >= this.duration) return
    this.stop()
    if (this.ctx.state === 'suspended') void this.ctx.resume()

    const { delaySec, offsetSec } = playbackStartParams(fromMs)
    const now = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = this.buffer
    src.connect(this.ctx.destination)
    src.onended = () => {
      if (this.music !== src) return
      this.music = null
      this.finish(this.duration)
      this.endedCb?.()
    }
    src.start(now + delaySec, offsetSec)

    this.music = src
    this.startCtxTime = now
    this.fromMs = fromMs
    this.cursor = 0
    this.isPlaying = true
    this.tick()
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS)
  }

  /** 멈춘 위치(ms)를 돌려준다. */
  stop(): number {
    if (!this.isPlaying) return this.lastPositionMs
    const pos = this.positionMs()
    const music = this.music
    this.music = null
    if (music) {
      music.onended = null
      try {
        music.stop()
      } catch {
        // 이미 끝난 소스
      }
    }
    this.finish(pos)
    return pos
  }

  positionMs(): number {
    if (!this.isPlaying) return this.lastPositionMs
    const pos = (this.ctx.currentTime - this.startCtxTime) * 1000 + this.fromMs
    return Math.min(pos, this.duration)
  }

  setHits(hits: number[]): void {
    this.hits = hits
    if (!this.isPlaying) return
    // 아직 울리기 전인 예약만 취소하고, 이미 울리는 소리는 그대로 둔다.
    this.cancelHitSources(this.ctx.currentTime)
    const from = this.positionMs()
    const idx = this.hits.findIndex((h) => h >= from)
    this.cursor = idx < 0 ? this.hits.length : idx
  }

  setHitVolume(v: number): void {
    this.hitGain.gain.value = Math.min(1, Math.max(0, v))
  }

  onEnded(cb: () => void): void {
    this.endedCb = cb
  }

  dispose(): void {
    if (this.disposed) return
    this.stop()
    this.disposed = true
    this.endedCb = null
    if (this.ctx.state !== 'closed') void this.ctx.close()
  }

  /** 재생 상태를 정리한다 (음악 소스는 호출 전에 처리). */
  private finish(positionMs: number): void {
    this.lastPositionMs = positionMs
    this.isPlaying = false
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.cancelHitSources()
  }

  /** 시작 예정 시각이 `after`보다 뒤인 효과음 소스를 취소한다. 생략하면 전부. */
  private cancelHitSources(after = -Infinity): void {
    for (const [s, when] of this.hitSources) {
      if (when <= after) continue
      s.onended = null
      try {
        s.stop()
      } catch {
        // 이미 끝난 소스
      }
      this.hitSources.delete(s)
    }
  }

  private tick(): void {
    const now = this.positionMs()
    const { due, cursor } = collectDueHits(
      this.hits,
      this.cursor,
      now - LATE_GRACE_MS,
      now + LOOK_AHEAD_MS
    )
    this.cursor = cursor
    for (const hitMs of due) {
      const when = Math.max(
        this.ctx.currentTime,
        this.startCtxTime + (hitMs - this.fromMs) / 1000
      )
      const s = this.ctx.createBufferSource()
      s.buffer = this.clickBuffer
      s.connect(this.hitGain)
      s.onended = () => this.hitSources.delete(s)
      s.start(when)
      this.hitSources.set(s, when)
    }
  }
}
