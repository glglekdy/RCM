import { afterEach, describe, expect, it, vi } from 'vitest'
import { enterPlaytestScreen, orientationTarget } from '../../src/renderer/src/editor/playtest/playtestScreen'

/** 마이크로태스크와 타이머 한 바퀴를 비워 Promise 체인이 끝나게 한다 */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** 전체 화면 상태를 흉내 내는 document */
function fakeDocument(opts: { fullscreen?: boolean; requestFails?: boolean } = {}) {
  const listeners = new Map<string, Set<() => void>>()
  const doc = {
    fullscreenElement: (opts.fullscreen ? {} : null) as object | null,
    visibilityState: 'visible',
    documentElement: {
      requestFullscreen: vi.fn(() => {
        if (opts.requestFails) return Promise.reject(new Error('denied'))
        doc.fullscreenElement = {}
        return Promise.resolve()
      })
    },
    exitFullscreen: vi.fn(() => {
      doc.fullscreenElement = null
      return Promise.resolve()
    }),
    addEventListener: vi.fn((type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    }),
    removeEventListener: vi.fn((type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn)
    }),
    emit(type: string) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn()
    },
    count(type: string) {
      return listeners.get(type)?.size ?? 0
    }
  }
  return doc
}

function fakeScreen() {
  return { orientation: { lock: vi.fn(() => Promise.resolve()), unlock: vi.fn() } }
}

function fakeWakeLock() {
  const sentinels: { released: boolean; release: ReturnType<typeof vi.fn> }[] = []
  const request = vi.fn(() => {
    const s = {
      released: false,
      release: vi.fn(() => {
        s.released = true
        return Promise.resolve()
      })
    }
    sentinels.push(s)
    return Promise.resolve(s)
  })
  return { wakeLock: { request }, request, sentinels }
}

describe('orientationTarget', () => {
  it('자유형은 고른 방향', () => {
    expect(orientationTarget(true, 'landscape', { width: 390, height: 844 })).toBe('landscape')
    expect(orientationTarget(true, 'portrait', { width: 844, height: 390 })).toBe('portrait')
  })

  it('레인형은 지금 화면 방향', () => {
    expect(orientationTarget(false, 'portrait', { width: 844, height: 390 })).toBe('landscape')
    expect(orientationTarget(false, 'landscape', { width: 390, height: 844 })).toBe('portrait')
  })
})

describe('enterPlaytestScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('API가 없거나 거절돼도 오류 없이 시작하고 정리한다', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      // 전체 화면 API 없음, Wake Lock은 거절, screen 없음
      vi.stubGlobal('document', { documentElement: {} })
      vi.stubGlobal('navigator', { wakeLock: { request: vi.fn(() => Promise.reject(new Error('denied'))) } })
      vi.stubGlobal('screen', undefined)

      let session = { setTarget: (_t: 'portrait' | 'landscape') => {}, dispose: () => {} }
      expect(() => {
        session = enterPlaytestScreen('portrait')
      }).not.toThrow()
      await flush()
      await flush()
      expect(() => {
        session.setTarget('landscape')
        session.dispose()
        session.dispose()
      }).not.toThrow()
      await flush()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('전체 화면·방향 잠금이 거절돼도 처리 안 된 거절이 없다', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const doc = fakeDocument()
      doc.documentElement.requestFullscreen = vi.fn(() => {
        doc.fullscreenElement = {}
        return Promise.resolve()
      })
      doc.exitFullscreen = vi.fn(() => Promise.reject(new Error('no')))
      vi.stubGlobal('document', doc)
      vi.stubGlobal('navigator', {})
      vi.stubGlobal('screen', {
        orientation: { lock: vi.fn(() => Promise.reject(new Error('no'))), unlock: vi.fn() }
      })
      const session = enterPlaytestScreen('landscape')
      await flush()
      session.dispose()
      await flush()
      expect(doc.exitFullscreen).toHaveBeenCalledTimes(1)
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('얻은 것만 정리한다', async () => {
    const doc = fakeDocument()
    const scr = fakeScreen()
    const wl = fakeWakeLock()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', { wakeLock: wl.wakeLock })
    vi.stubGlobal('screen', scr)

    const session = enterPlaytestScreen('landscape')
    await flush()
    expect(scr.orientation.lock).toHaveBeenCalledWith('landscape')

    session.dispose()
    expect(wl.sentinels[0].release).toHaveBeenCalledTimes(1)
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1)
    expect(scr.orientation.unlock).toHaveBeenCalledTimes(1)
    expect(doc.count('visibilitychange')).toBe(0)

    session.dispose()
    await flush()
    expect(wl.sentinels[0].release).toHaveBeenCalledTimes(1)
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1)
    expect(scr.orientation.unlock).toHaveBeenCalledTimes(1)
  })

  it('얻기 전에 정리하면 늦게 얻은 것도 바로 놓고 방향은 잠그지 않는다', async () => {
    const doc = fakeDocument()
    const scr = fakeScreen()
    const wl = fakeWakeLock()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', { wakeLock: wl.wakeLock })
    vi.stubGlobal('screen', scr)

    enterPlaytestScreen('portrait').dispose()
    await flush()
    expect(wl.sentinels[0].release).toHaveBeenCalledTimes(1)
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1)
    expect(scr.orientation.lock).not.toHaveBeenCalled()
    expect(scr.orientation.unlock).not.toHaveBeenCalled()
  })

  it('setTarget은 전체 화면을 나가지 않고 방향만 다시 잠근다', async () => {
    const doc = fakeDocument()
    const scr = fakeScreen()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('screen', scr)

    const session = enterPlaytestScreen('portrait')
    await flush()
    session.setTarget('landscape')
    await flush()
    expect(scr.orientation.lock).toHaveBeenNthCalledWith(1, 'portrait')
    expect(scr.orientation.lock).toHaveBeenNthCalledWith(2, 'landscape')
    expect(doc.exitFullscreen).not.toHaveBeenCalled()
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1)
    expect(scr.orientation.unlock).not.toHaveBeenCalled()
  })

  it('전체 화면이 안 되면 방향을 잠그지 않는다', async () => {
    const doc = fakeDocument({ requestFails: true })
    const scr = fakeScreen()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('screen', scr)

    const session = enterPlaytestScreen('landscape')
    await flush()
    session.setTarget('portrait')
    await flush()
    expect(scr.orientation.lock).not.toHaveBeenCalled()
    session.dispose()
    expect(scr.orientation.unlock).not.toHaveBeenCalled()
    expect(doc.exitFullscreen).not.toHaveBeenCalled()
  })

  it('사용자가 이미 전체 화면을 나갔으면 정리할 때 exitFullscreen을 부르지 않는다', async () => {
    const doc = fakeDocument()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('screen', fakeScreen())

    const session = enterPlaytestScreen('portrait')
    await flush()
    doc.fullscreenElement = null // 스와이프 등으로 나감
    session.dispose()
    expect(doc.exitFullscreen).not.toHaveBeenCalled()
  })

  it('이미 켜져 있던 전체 화면은 우리 것이 아니라 닫지 않는다', async () => {
    const doc = fakeDocument({ fullscreen: true })
    const scr = fakeScreen()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('screen', scr)

    const session = enterPlaytestScreen('landscape')
    await flush()
    expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled()
    expect(scr.orientation.lock).toHaveBeenCalledWith('landscape')
    session.dispose()
    expect(doc.exitFullscreen).not.toHaveBeenCalled()
    expect(scr.orientation.unlock).toHaveBeenCalledTimes(1)
  })

  it('앱을 갈아탔다 돌아오면 Wake Lock을 다시 얻고 정리하면 더 얻지 않는다', async () => {
    const doc = fakeDocument()
    const wl = fakeWakeLock()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', { wakeLock: wl.wakeLock })
    vi.stubGlobal('screen', fakeScreen())

    const session = enterPlaytestScreen('portrait')
    await flush()
    expect(wl.request).toHaveBeenCalledTimes(1)

    // 아직 잡고 있으면 이벤트가 와도 다시 얻지 않는다
    doc.emit('visibilitychange')
    await flush()
    expect(wl.request).toHaveBeenCalledTimes(1)

    // 숨겨지면 브라우저가 놓는다 -> 다시 보일 때 얻는다
    wl.sentinels[0].released = true
    doc.visibilityState = 'hidden'
    doc.emit('visibilitychange')
    await flush()
    expect(wl.request).toHaveBeenCalledTimes(1)
    doc.visibilityState = 'visible'
    doc.emit('visibilitychange')
    await flush()
    expect(wl.request).toHaveBeenCalledTimes(2)

    session.dispose()
    expect(doc.count('visibilitychange')).toBe(0)
    expect(wl.sentinels[1].release).toHaveBeenCalledTimes(1)
    doc.emit('visibilitychange')
    await flush()
    expect(wl.request).toHaveBeenCalledTimes(2)
  })

  it('StrictMode처럼 첫 세션이 정리된 뒤 늦게 열린 전체 화면은 닫지 않고 새 세션이 넘겨받는다', async () => {
    const doc = fakeDocument()
    // 요청이 한 박자 늦게 끝나 그때서야 전체 화면이 된다
    doc.documentElement.requestFullscreen = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            doc.fullscreenElement = {}
            resolve()
          }, 0)
        })
    )
    const scr = fakeScreen()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('screen', scr)

    enterPlaytestScreen('portrait').dispose()
    const second = enterPlaytestScreen('portrait')
    await flush()
    await flush()
    expect(doc.exitFullscreen).not.toHaveBeenCalled()
    expect(doc.fullscreenElement).not.toBeNull()
    expect(scr.orientation.lock).toHaveBeenCalledWith('portrait')

    // 넘겨받았으니 정리할 때는 새 세션이 닫는다
    second.dispose()
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1)
  })
})
