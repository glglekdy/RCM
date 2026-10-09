const DURATION_SEC = 0.03
const FREQUENCY_HZ = 2000

/** 30ms, 2kHz 사인 x 지수 감쇠 클릭음. */
export function createClickBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = Math.max(1, Math.round(ctx.sampleRate * DURATION_SEC))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate
    data[i] = Math.sin(2 * Math.PI * FREQUENCY_HZ * t) * Math.exp((-t / DURATION_SEC) * 6)
  }
  return buffer
}
