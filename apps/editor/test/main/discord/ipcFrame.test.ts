import { describe, it, expect } from 'vitest'
import { encodeFrame, FrameDecoder, OP } from '../../../src/main/discord/ipcFrame'

describe('ipcFrame', () => {
  it('인코딩 형식: op, 바이트 길이(LE), JSON', () => {
    const buf = encodeFrame(OP.FRAME, { t: '한' })
    const json = Buffer.from(JSON.stringify({ t: '한' }), 'utf8')
    expect(buf.readUInt32LE(0)).toBe(1)
    expect(buf.readUInt32LE(4)).toBe(json.length)
    expect(buf.subarray(8).equals(json)).toBe(true)
  })

  it('왕복', () => {
    expect(new FrameDecoder().push(encodeFrame(OP.PING, { a: 1 }))).toEqual([{ op: 3, payload: { a: 1 } }])
  })

  it('한 조각에 프레임 여러 개', () => {
    const both = Buffer.concat([encodeFrame(1, { n: 1 }), encodeFrame(1, { n: 2 })])
    expect(new FrameDecoder().push(both).map((f) => f.payload)).toEqual([{ n: 1 }, { n: 2 }])
  })

  it('한 프레임이 여러 조각 (헤더 중간에서도 끊김)', () => {
    const buf = encodeFrame(1, { long: 'x'.repeat(100) })
    const d = new FrameDecoder()
    expect(d.push(buf.subarray(0, 3))).toEqual([])
    expect(d.push(buf.subarray(3, 50))).toEqual([])
    expect(d.push(buf.subarray(50))).toEqual([{ op: 1, payload: { long: 'x'.repeat(100) } }])
  })
})
