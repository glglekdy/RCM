import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildActivity, type DiscordActivity, type PresenceInfo } from '../../../src/shared/presence'
import {
  createDiscordPresence,
  RETRY_MS,
  SEND_INTERVAL_MS,
  type Transport
} from '../../../src/main/discord/presence'

const APP_START = 0
const a: PresenceInfo = { title: 'A곡', artist: '가수', chart: 'EASY', level: 1, since: 10 }
const b: PresenceInfo = { ...a, chart: 'NORMAL', level: 5 }
const c: PresenceInfo = { ...a, chart: 'HARD', level: 12 }

interface FakeTransport extends Transport {
  sent: (DiscordActivity | null)[]
  closed: boolean
  fail: boolean
  drop(): void
}

function fakeTransport(fail = false): FakeTransport {
  let closeCb = () => {}
  const t: FakeTransport = {
    sent: [],
    closed: false,
    fail,
    setActivity: async (activity) => {
      if (t.fail) throw new Error('pipe')
      t.sent.push(activity)
    },
    close: () => {
      t.closed = true
    },
    onClose: (cb) => {
      closeCb = cb
    },
    drop: () => closeCb()
  }
  return t
}

/** connect가 만들 transport와 결과(바로 연결·실패·테스트가 직접 풀기)를 정한다. */
function setup() {
  const transports: FakeTransport[] = []
  const held: (() => void)[] = []
  const opts = { mode: 'ok' as 'ok' | 'reject' | 'hold', failingTransport: false }
  const connect = vi.fn((): Promise<Transport> => {
    if (opts.mode === 'reject') return Promise.reject(new Error('디스코드 없음'))
    const t = fakeTransport(opts.failingTransport)
    transports.push(t)
    if (opts.mode === 'hold') return new Promise((resolve) => held.push(() => resolve(t)))
    return Promise.resolve(t)
  })
  const presence = createDiscordPresence({ connect, appStartedAt: APP_START })
  return { presence, connect, transports, held, opts }
}

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms)

describe('DiscordPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('켜면 연결하고 홈 activity를 보냄', async () => {
    const { presence, transports } = setup()
    presence.setEnabled(true)
    await tick()
    expect(transports[0].sent).toEqual([buildActivity(null, APP_START)])
  })

  it('꺼진 동안에는 연결하지 않음', async () => {
    const { presence, connect } = setup()
    presence.setInfo(a)
    await tick(60_000)
    expect(connect).not.toHaveBeenCalled()
  })

  it('4초 안의 여러 변경은 마지막 값 하나로', async () => {
    const { presence, transports } = setup()
    presence.setEnabled(true)
    await tick()
    presence.setInfo(a)
    presence.setInfo(b)
    presence.setInfo(c)
    await tick(SEND_INTERVAL_MS - 1)
    expect(transports[0].sent).toHaveLength(1)
    await tick(1)
    expect(transports[0].sent).toHaveLength(2)
    expect(transports[0].sent[1]).toEqual(buildActivity(c, APP_START))
  })

  it('같은 값은 다시 보내지 않음', async () => {
    const { presence, transports } = setup()
    presence.setEnabled(true)
    await tick(5000)
    presence.setInfo(a)
    await tick(5000)
    presence.setInfo({ ...a })
    await tick(5000)
    expect(transports[0].sent).toHaveLength(2)
  })

  it('연결 실패하면 15초 뒤 다시 시도', async () => {
    const { presence, connect, opts } = setup()
    opts.mode = 'reject'
    presence.setEnabled(true)
    await tick(RETRY_MS - 1)
    expect(connect).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it('대기 중에 끊겨도 재연결 후 마지막 상태', async () => {
    const { presence, connect, transports } = setup()
    presence.setEnabled(true)
    await tick()
    presence.setInfo(a)
    presence.setInfo(b)
    transports[0].drop()
    await tick(SEND_INTERVAL_MS)
    expect(transports[0].sent).toHaveLength(1)
    await tick(RETRY_MS)
    expect(connect).toHaveBeenCalledTimes(2)
    expect(transports[1].sent[0]).toEqual(buildActivity(b, APP_START))
  })

  it('전송 실패하면 연결을 닫고 재연결', async () => {
    const { presence, connect, transports, opts } = setup()
    opts.failingTransport = true
    presence.setEnabled(true)
    await tick()
    expect(transports[0].closed).toBe(true)
    await tick(RETRY_MS)
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it('끄면 활동을 지우고 닫음, 재연결 안 함', async () => {
    const { presence, connect, transports } = setup()
    presence.setEnabled(true)
    await tick()
    presence.setEnabled(false)
    await tick()
    expect(transports[0].sent.at(-1)).toBeNull()
    expect(transports[0].closed).toBe(true)
    await tick(60_000)
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('연결 중에 끄면 늦게 온 연결을 닫음', async () => {
    const { presence, transports, held, opts } = setup()
    opts.mode = 'hold'
    presence.setEnabled(true)
    await tick()
    presence.setEnabled(false)
    held[0]()
    await tick()
    expect(transports[0].closed).toBe(true)
    expect(transports[0].sent).toEqual([])
  })

  it('다시 켜면 다시 연결', async () => {
    const { presence, connect, transports } = setup()
    presence.setEnabled(true)
    await tick()
    presence.setEnabled(false)
    await tick()
    presence.setInfo(a)
    presence.setEnabled(true)
    await tick()
    expect(connect).toHaveBeenCalledTimes(2)
    expect(transports[1].sent).toEqual([buildActivity(a, APP_START)])
  })

  it('dispose는 지우기 메시지 없이 닫음', async () => {
    const { presence, connect, transports } = setup()
    presence.setEnabled(true)
    await tick()
    presence.dispose()
    await tick(60_000)
    expect(transports[0].sent).not.toContain(null)
    expect(transports[0].closed).toBe(true)
    expect(connect).toHaveBeenCalledTimes(1)
  })
})
