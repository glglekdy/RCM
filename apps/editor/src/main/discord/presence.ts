import { buildActivity, type DiscordActivity, type PresenceInfo } from '../../shared/presence'

/** 디스코드 연결 하나. `activity`가 null이면 활동을 지운다. */
export interface Transport {
  setActivity(activity: DiscordActivity | null): Promise<void>
  close(): void
  onClose(cb: () => void): void
}

export type Connect = () => Promise<Transport>

export interface DiscordPresence {
  setEnabled(enabled: boolean): void
  setInfo(info: PresenceInfo | null): void
  dispose(): void
}

/** 디스코드 제한(20초에 5번)에 맞춘 전송 최소 간격 */
export const SEND_INTERVAL_MS = 4000
export const RETRY_MS = 15_000

/**
 * 켜져 있는 동안 디스코드에 연결을 유지하고 마지막 상태를 보낸다. 처음에는 꺼져 있다.
 * 오류는 경고만 남기고 밖으로 던지지 않는다 (디스코드가 없어도 에디터는 그대로).
 */
export function createDiscordPresence(opts: { connect: Connect; appStartedAt: number }): DiscordPresence {
  let enabled = false
  let disposed = false
  let info: PresenceInfo | null = null
  let transport: Transport | null = null
  let connecting = false
  /** 연결 시도 세대. 끄거나 dispose하면 올려서, 그 전에 시작한 시도의 결과를 버린다 */
  let attempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let sendTimer: ReturnType<typeof setTimeout> | null = null
  let lastSentAt = -Infinity
  let lastSentJson: string | null = null

  const clearSendTimer = (): void => {
    if (sendTimer) clearTimeout(sendTimer)
    sendTimer = null
  }

  const clearTimers = (): void => {
    clearSendTimer()
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
  }

  const scheduleRetry = (): void => {
    if (!enabled || retryTimer) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      ensureConnected()
    }, RETRY_MS)
  }

  /** 현재 연결이 끊겼을 때: 버리고 재연결을 예약한다. 이미 버린 연결이면 무시. */
  const drop = (t: Transport): void => {
    if (transport !== t) return
    transport = null
    clearSendTimer()
    scheduleRetry()
  }

  const send = (): void => {
    const t = transport
    if (!t) return
    const activity = buildActivity(info, opts.appStartedAt)
    const json = JSON.stringify(activity)
    if (json === lastSentJson) return
    lastSentJson = json
    lastSentAt = Date.now()
    t.setActivity(activity).catch((err: unknown) => {
      console.warn('디스코드에 활동을 보내지 못했어요', err)
      if (transport !== t) return
      t.close()
      drop(t)
    })
  }

  const requestSend = (): void => {
    if (!transport || sendTimer) return
    const wait = lastSentAt + SEND_INTERVAL_MS - Date.now()
    if (wait <= 0) {
      send()
      return
    }
    sendTimer = setTimeout(() => {
      sendTimer = null
      send()
    }, wait)
  }

  function ensureConnected(): void {
    if (!enabled || transport || connecting) return
    connecting = true
    const gen = ++attempt
    opts.connect().then(
      (t) => {
        if (gen !== attempt) {
          t.close()
          return
        }
        connecting = false
        transport = t
        lastSentJson = null
        t.onClose(() => drop(t))
        send()
      },
      (err: unknown) => {
        if (gen !== attempt) return
        connecting = false
        console.warn('디스코드에 연결하지 못했어요', err)
        scheduleRetry()
      }
    )
  }

  /** 연결 시도와 타이머를 모두 멈추고 지금 연결을 돌려준다 (닫기는 부르는 쪽에서). */
  const stop = (): Transport | null => {
    enabled = false
    attempt++
    connecting = false
    clearTimers()
    const t = transport
    transport = null
    return t
  }

  return {
    setEnabled(next) {
      if (disposed || next === enabled) return
      if (next) {
        enabled = true
        ensureConnected()
        return
      }
      const t = stop()
      if (t) {
        void t
          .setActivity(null)
          .catch(() => {})
          .finally(() => t.close())
      }
    },
    setInfo(next) {
      info = next
      requestSend()
    },
    dispose() {
      disposed = true
      stop()?.close()
    }
  }
}
