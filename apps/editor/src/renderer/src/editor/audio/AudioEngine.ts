import { createClickBuffer } from './hitsound'
import { collectDueHits, playbackStartParams } from './schedule'

const TICK_INTERVAL_MS = 25
const LOOK_AHEAD_MS = 100
/** ?대? ?대쭔??ms) ?대궡濡?吏??hit??利됱떆 ?ъ깮?섍퀬, ???ㅻ옒??寃껋? 嫄대꼫?대떎. */
const LATE_GRACE_MS = 30

/** AudioContext.currentTime???먮뵒???꾩껜???⑥씪 ?쒓퀎濡??곕뒗 ?ъ깮 ?붿쭊. */
export class AudioEngine {
  readonly ctx: AudioContext
  private duration = 0
  private isPlaying = false
  private buffer: AudioBuffer | null = null
  private readonly clickBuffer: AudioBuffer
  private readonly hitGain: GainNode
  private music: AudioBufferSourceNode | null = null
  private hitSources = new Set<AudioBufferSourceNode>()
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
    if (!this.buffer || fromMs >= this.duration) return
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

  /** 硫덉텣 ?꾩튂(ms)瑜??뚮젮以?? */
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
        // ?대? ?앸궃 ?뚯뒪
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
    this.cancelHitSources()
    const from = this.positionMs() - LATE_GRACE_MS
    this.cursor = this.hits.findIndex((h) => h >= from)
    if (this.cursor < 0) this.cursor = this.hits.length
  }

  setHitVolume(v: number): void {
    this.hitGain.gain.value = Math.min(1, Math.max(0, v))
  }

  onEnded(cb: () => void): void {
    this.endedCb = cb
  }

  dispose(): void {
    this.stop()
    this.endedCb = null
    void this.ctx.close()
  }

  /** ?ъ깮 ?곹깭瑜??뺣━?쒕떎 (?뚯븙 ?뚯뒪???몄텧 ?꾩뿉 泥섎━). */
  private finish(positionMs: number): void {
    this.lastPositionMs = positionMs
    this.isPlaying = false
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.cancelHitSources()
  }

  private cancelHitSources(): void {
    for (const s of this.hitSources) {
      s.onended = null
      try {
        s.stop()
      } catch {
        // ?대? ?앸궃 ?뚯뒪
      }
    }
    this.hitSources.clear()
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
      this.hitSources.add(s)
    }
  }
}
