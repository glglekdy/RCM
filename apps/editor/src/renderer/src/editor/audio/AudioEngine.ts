import { createClickBuffer } from './hitsound'
import { PlaybackClock } from './playbackClock'
import { collectDueHits, playbackStartParams } from './schedule'
import { SmoothClock } from './smoothClock'

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
  /** 음악 없이 무음 버퍼로 재생 중 */
  private silent = false
  private readonly clickBuffer: AudioBuffer
  private readonly hitGain: GainNode
  private readonly musicGain: GainNode
  private music: AudioBufferSourceNode | null = null
  /** 예약된 효과음 소스와 시작 예정 ctx 시각 */
  private hitSources = new Map<AudioBufferSourceNode, number>()
  private timer: ReturnType<typeof setInterval> | null = null
  private hits: number[] = []
  private cursor = 0
  /** 곡 위치 시계. 재생 속도(테스트 플레이의 배속 플레이)를 안다 */
  private readonly clock = new PlaybackClock()
  /** 재생 중 마지막으로 돌려준 위치. 속도를 낮출 때도 위치가 뒤로 가지 않게 한다 */
  private lastReadMs = -Infinity
  private lastPositionMs = 0
  private endedCb: (() => void) | null = null
  /** 재생 위치용: currentTime의 계단을 메워 화면이 매끄럽게 움직이게 한다 */
  private readonly smooth = new SmoothClock()

  constructor() {
    this.ctx = new AudioContext()
    this.clickBuffer = createClickBuffer(this.ctx)
    this.hitGain = this.ctx.createGain()
    this.hitGain.connect(this.ctx.destination)
    this.musicGain = this.ctx.createGain()
    this.musicGain.connect(this.ctx.destination)
  }

  get durationMs(): number {
    return this.duration
  }

  /** 디코딩된 오디오 (파형 계산용). 불러오기 전이거나 음악이 없으면 null. */
  get decodedBuffer(): AudioBuffer | null {
    return this.silent ? null : this.buffer
  }

  get playing(): boolean {
    return this.isPlaying
  }

  async load(data: ArrayBuffer): Promise<void> {
    this.stop()
    this.buffer = await this.ctx.decodeAudioData(data)
    this.silent = false
    this.duration = this.buffer.duration * 1000
    this.lastPositionMs = 0
  }

  /** 음악 대신 `durationMs` 길이의 무음을 재생한다 (효과음·녹음·테스트 플레이는 그대로 된다). */
  loadSilence(durationMs: number): void {
    this.stop()
    // 무음이라 샘플레이트를 낮춰 메모리를 아낀다
    const rate = 8000
    this.buffer = this.ctx.createBuffer(1, Math.max(1, Math.ceil((durationMs / 1000) * rate)), rate)
    this.silent = true
    this.duration = this.buffer.duration * 1000
    this.lastPositionMs = 0
  }

  /** `rate`: 재생 속도. 편집 화면은 주지 않아 항상 1배, 테스트 플레이만 배속 플레이 값을 준다. */
  play(fromMs: number, rate = 1): void {
    if (this.disposed || !this.buffer || fromMs >= this.duration) return
    this.stop()
    if (this.ctx.state === 'suspended') void this.ctx.resume()

    const { delaySec, offsetSec } = playbackStartParams(fromMs)
    const now = this.ctx.currentTime
    this.clock.start(now, fromMs, rate)
    // 준비 시간(delaySec)은 곡 시간이라 실제로는 속도만큼 짧거나 길다
    this.startMusic(now + delaySec / rate, offsetSec)

    this.smooth.reset()
    this.lastReadMs = -Infinity
    this.cursor = 0
    this.isPlaying = true
    this.tick()
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS)
  }

  /** 재생 중에 속도를 바꾼다. 위치는 이어지고, 멈춰 있으면 아무것도 하지 않는다. */
  setRate(rate: number): void {
    if (!this.isPlaying || rate === this.clock.rate) return
    // 음악과 같은 시계(매끄럽게 만들지 않은 값)로 기준을 잡아야 소리와 위치가 어긋나지 않는다
    const now = this.ctx.currentTime
    const pos = this.clock.positionMs(now)
    this.clock.setRate(now, rate)
    if (pos < 0) {
      // 음악이 아직 시작 전: 예약을 버리고 곡 위치 0에 닿는 시각으로 다시 예약한다
      this.dropMusic()
      this.startMusic(this.clock.ctxTimeAt(0), 0)
    } else {
      this.music?.playbackRate.setValueAtTime(rate, now)
    }
    // 예약해 둔 효과음은 옛 속도로 잡은 시각이라 다시 예약한다
    this.setHits(this.hits)
  }

  /** 멈춘 위치(ms)를 돌려준다. */
  stop(): number {
    if (!this.isPlaying) return this.lastPositionMs
    const pos = this.positionMs()
    this.dropMusic()
    this.finish(pos)
    return pos
  }

  positionMs(): number {
    if (!this.isPlaying) return this.lastPositionMs
    const ctxNow = this.smooth.read(this.ctx.currentTime, performance.now())
    this.lastReadMs = Math.max(this.lastReadMs, this.clock.positionMs(ctxNow))
    return Math.min(this.lastReadMs, this.duration)
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

  setMusicVolume(v: number): void {
    this.musicGain.gain.value = Math.min(1, Math.max(0, v))
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

  /** ctx 시각 `when`에 버퍼의 `offsetSec`부터 지금 속도로 음악을 시작한다. */
  private startMusic(when: number, offsetSec: number): void {
    const src = this.ctx.createBufferSource()
    src.buffer = this.buffer
    src.playbackRate.value = this.clock.rate
    src.connect(this.musicGain)
    src.onended = () => {
      if (this.music !== src) return
      this.music = null
      this.finish(this.duration)
      this.endedCb?.()
    }
    src.start(when, offsetSec)
    this.music = src
  }

  /** 음악 소스를 끝 알림 없이 멈춘다. */
  private dropMusic(): void {
    const music = this.music
    this.music = null
    if (!music) return
    music.onended = null
    try {
      music.stop()
    } catch {
      // 이미 끝난 소스
    }
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
    // 두 여유는 실제 시간이라 곡 시간으로는 속도만큼 늘거나 준다
    const rate = this.clock.rate
    const { due, cursor } = collectDueHits(
      this.hits,
      this.cursor,
      now - LATE_GRACE_MS * rate,
      now + LOOK_AHEAD_MS * rate
    )
    this.cursor = cursor
    for (const hitMs of due) {
      const when = Math.max(this.ctx.currentTime, this.clock.ctxTimeAt(hitMs))
      const s = this.ctx.createBufferSource()
      s.buffer = this.clickBuffer
      s.connect(this.hitGain)
      s.onended = () => this.hitSources.delete(s)
      s.start(when)
      this.hitSources.set(s, when)
    }
  }
}
