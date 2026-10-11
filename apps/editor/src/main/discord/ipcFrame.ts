/** 디스코드 로컬 IPC 프레임: `[opcode u32 LE][길이 u32 LE][UTF-8 JSON]`. */
export const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 } as const

export interface Frame {
  op: number
  payload: unknown
}

const HEADER = 8

export function encodeFrame(op: number, payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.alloc(HEADER)
  header.writeUInt32LE(op, 0)
  header.writeUInt32LE(json.length, 4)
  return Buffer.concat([header, json])
}

/** 소켓에서 받은 바이트 조각을 모아 완성된 프레임만 꺼낸다. JSON이 깨졌으면 throw. */
export class FrameDecoder {
  private buf = Buffer.alloc(0)

  push(chunk: Buffer): Frame[] {
    this.buf = Buffer.concat([this.buf, chunk])
    const frames: Frame[] = []
    while (this.buf.length >= HEADER) {
      const length = this.buf.readUInt32LE(4)
      if (this.buf.length < HEADER + length) break
      const op = this.buf.readUInt32LE(0)
      const json = this.buf.subarray(HEADER, HEADER + length).toString('utf8')
      this.buf = this.buf.subarray(HEADER + length)
      frames.push({ op, payload: JSON.parse(json) })
    }
    return frames
  }
}
