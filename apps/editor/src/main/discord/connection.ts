import { randomUUID } from 'node:crypto'
import { createConnection, type Socket } from 'node:net'
import { encodeFrame, FrameDecoder, OP, type Frame } from './ipcFrame'
import type { Transport } from './presence'

const PIPE_COUNT = 10
const READY_TIMEOUT_MS = 5000

const pipePath = (i: number): string => `\\\\?\\pipe\\discord-ipc-${i}`

function openPipe(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path)
    const onError = (err: Error): void => {
      socket.destroy()
      reject(err)
    }
    socket.once('error', onError)
    socket.once('connect', () => {
      socket.off('error', onError)
      resolve(socket)
    })
  })
}

/** 열려 있는 첫 디스코드 파이프에 붙는다. 다 실패하면 마지막 오류로 reject. */
async function openFirstPipe(): Promise<Socket> {
  let last: unknown = new Error('디스코드 IPC 파이프가 없어요')
  for (let i = 0; i < PIPE_COUNT; i++) {
    try {
      return await openPipe(pipePath(i))
    } catch (err) {
      last = err
    }
  }
  throw last
}

const evtOf = (f: Frame): unknown => (f.payload as { evt?: unknown } | null)?.evt

/** 디스코드 데스크톱 앱에 연결하고 handshake가 끝나면(READY) Transport를 돌려준다. */
export async function connectDiscord(clientId: string): Promise<Transport> {
  const socket = await openFirstPipe()
  const decoder = new FrameDecoder()
  let closed = false
  let closeCb: () => void = () => {}
  let onReady: (() => void) | null = null

  const shutdown = (): void => {
    if (closed) return
    closed = true
    socket.destroy()
    closeCb()
  }

  socket.on('data', (chunk: Buffer) => {
    let frames: Frame[]
    try {
      frames = decoder.push(chunk)
    } catch (err) {
      console.warn('디스코드에서 잘못된 메시지를 받았어요', err)
      shutdown()
      return
    }
    for (const f of frames) {
      if (f.op === OP.PING) socket.write(encodeFrame(OP.PONG, f.payload))
      else if (f.op === OP.CLOSE) shutdown()
      else if (f.op === OP.FRAME && evtOf(f) === 'READY') onReady?.()
      else if (f.op === OP.FRAME && evtOf(f) === 'ERROR') console.warn('디스코드 오류', f.payload)
    }
  })
  socket.on('error', (err) => {
    console.warn('디스코드 연결 오류', err)
    shutdown()
  })
  socket.on('close', shutdown)

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      shutdown()
      reject(new Error('디스코드가 응답하지 않아요'))
    }, READY_TIMEOUT_MS)
    closeCb = () => {
      clearTimeout(timer)
      reject(new Error('디스코드가 연결을 닫았어요'))
    }
    onReady = () => {
      clearTimeout(timer)
      onReady = null
      closeCb = () => {}
      resolve()
    }
    socket.write(encodeFrame(OP.HANDSHAKE, { v: 1, client_id: clientId }))
  })

  return {
    setActivity: (activity) =>
      new Promise((resolve, reject) => {
        if (closed) {
          reject(new Error('디스코드 연결이 닫혔어요'))
          return
        }
        const args = activity ? { pid: process.pid, activity } : { pid: process.pid }
        socket.write(encodeFrame(OP.FRAME, { cmd: 'SET_ACTIVITY', args, nonce: randomUUID() }), (err) =>
          err ? reject(err) : resolve()
        )
      }),
    close: () => {
      if (closed) return
      closed = true
      socket.destroy()
    },
    onClose: (cb) => {
      closeCb = cb
    }
  }
}
