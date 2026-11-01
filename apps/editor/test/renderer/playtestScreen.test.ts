import { afterEach, describe, expect, it, vi } from 'vitest'
import { enterPlaytestScreen, orientationTarget } from '../../src/renderer/src/editor/playtest/playtestScreen'

/** 마이크로태스크와 타이머 한 바퀴를 비워 Promise 체인이 끝나게 한다 */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

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

      let leave = () => {}
      expect(() => {
        leave = enterPlaytestScreen('portrait')
      }).not.toThrow()
      await flush()
      await flush()
      expect(() => {
        leave()
        leave()
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
      vi.stubGlobal('document', {
        documentElement: { requestFullscreen: vi.fn(() => Promise.reject(new Error('no'))) },
        exitFullscreen: vi.fn(() => Promise.reject(new Error('no')))
      })
      vi.stubGlobal('navigator', {})
      vi.stubGlobal('screen', {
        orientation: { lock: vi.fn(() => Promise.reject(new Error('no'))), unlock: vi.fn() }
      })
      const leave = enterPlaytestScreen('landscape')
      await flush()
      leave()
      await flush()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('얻은 것만 정리한다', async () => {
    const release = vi.fn(() => Promise.resolve())
    const exitFullscreen = vi.fn(() => Promise.resolve())
    const unlock = vi.fn()
    const lock = vi.fn(() => Promise.resolve())
    vi.stubGlobal('document', {
      documentElement: { requestFullscreen: vi.fn(() => Promise.resolve()) },
      exitFullscreen
    })
    vi.stubGlobal('navigator', { wakeLock: { request: vi.fn(() => Promise.resolve({ release })) } })
    vi.stubGlobal('screen', { orientation: { lock, unlock } })

    const leave = enterPlaytestScreen('landscape')
    await flush()
    expect(lock).toHaveBeenCalledWith('landscape')

    leave()
    expect(release).toHaveBeenCalledTimes(1)
    expect(exitFullscreen).toHaveBeenCalledTimes(1)
    expect(unlock).toHaveBeenCalledTimes(1)

    leave()
    await flush()
    expect(release).toHaveBeenCalledTimes(1)
    expect(exitFullscreen).toHaveBeenCalledTimes(1)
    expect(unlock).toHaveBeenCalledTimes(1)
  })

  it('얻기 전에 정리하면 늦게 얻은 것도 바로 놓는다', async () => {
    const release = vi.fn(() => Promise.resolve())
    const exitFullscreen = vi.fn(() => Promise.resolve())
    const unlock = vi.fn()
    vi.stubGlobal('document', {
      documentElement: { requestFullscreen: vi.fn(() => Promise.resolve()) },
      exitFullscreen
    })
    vi.stubGlobal('navigator', { wakeLock: { request: vi.fn(() => Promise.resolve({ release })) } })
    vi.stubGlobal('screen', { orientation: { lock: vi.fn(() => Promise.resolve()), unlock } })

    enterPlaytestScreen('portrait')()
    await flush()
    expect(release).toHaveBeenCalledTimes(1)
    expect(exitFullscreen).toHaveBeenCalledTimes(1)
    // 이미 정리됐으니 방향은 잠그지 않는다
    expect(unlock).not.toHaveBeenCalled()
  })
})
