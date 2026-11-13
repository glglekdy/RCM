import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioEngine } from '../../../src/renderer/src/editor/audio/AudioEngine'

interface FakeSource {
  buffer: unknown
  onended: (() => void) | null
  playbackRate: { value: number; setValueAtTime: ReturnType<typeof vi.fn> }
  connect: () => void
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

/** 만든 소스를 차례로 모은다 (효과음은 끄고 쓰므로 모두 음악 소스) */
let sources: FakeSource[] = []
let ctx: FakeContext

class FakeContext {
  currentTime = 0
  sampleRate = 48000
  state = 'running'
  destination = {}
  constructor() {
    ctx = this
  }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    return { duration: length / sampleRate, getChannelData: () => new Float32Array(length) }
  }
  createGain() {
    return { gain: { value: 1 }, connect: () => {} }
  }
  createBufferSource(): FakeSource {
    const source: FakeSource = {
      buffer: null,
      onended: null,
      playbackRate: { value: 1, setValueAtTime: vi.fn() },
      connect: () => {},
      start: vi.fn(),
      stop: vi.fn()
    }
    sources.push(source)
    return source
  }
  resume() {
    return Promise.resolve()
  }
  close() {
    return Promise.resolve()
  }
}

describe('AudioEngine 재생 속도', () => {
  let engine: AudioEngine

  beforeEach(() => {
    vi.useFakeTimers()
    sources = []
    vi.stubGlobal('AudioContext', FakeContext)
    engine = new AudioEngine()
    engine.loadSilence(10_000)
    engine.setHits([])
  })
  afterEach(() => {
    engine.dispose()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('play(-3000, 2): 음악은 실제 1.5초 뒤 처음부터, playbackRate 2', () => {
    ctx.currentTime = 5
    engine.play(-3000, 2)
    expect(sources[0].playbackRate.value).toBe(2)
    expect(sources[0].start).toHaveBeenCalledWith(6.5, 0)
  })

  it('준비 시간 중 setRate: 예약을 버리고 곡 위치 0에 맞춰 다시 예약한다', () => {
    ctx.currentTime = 5
    engine.play(-3000, 2)
    ctx.currentTime = 6 // 곡 위치 -1000
    engine.setRate(1)
    expect(sources[0].stop).toHaveBeenCalled()
    expect(sources[1].start).toHaveBeenCalledWith(7, 0)
    expect(sources[1].playbackRate.value).toBe(1)
  })

  it('음악이 시작된 뒤 setRate: 같은 소스의 속도만 바꾼다', () => {
    ctx.currentTime = 5
    engine.play(0)
    ctx.currentTime = 6
    engine.setRate(2)
    expect(sources).toHaveLength(1)
    expect(sources[0].playbackRate.setValueAtTime).toHaveBeenCalledWith(2, 6)
  })

  it('속도를 바꿔도 재생 위치가 이어진다', () => {
    ctx.currentTime = 5
    engine.play(0, 2)
    ctx.currentTime = 6
    expect(engine.positionMs()).toBe(2000)
    engine.setRate(0.5)
    expect(engine.positionMs()).toBe(2000)
    ctx.currentTime = 8
    expect(engine.positionMs()).toBe(3000)
  })

  it('멈춘 상태의 setRate는 아무것도 하지 않고, 다음 play()는 1배', () => {
    engine.play(0, 3)
    engine.stop()
    expect(() => engine.setRate(2)).not.toThrow()
    engine.play(0)
    expect(sources.at(-1)!.playbackRate.value).toBe(1)
  })
})
