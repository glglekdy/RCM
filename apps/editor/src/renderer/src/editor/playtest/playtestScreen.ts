import type { FreeAspect } from '@rcm/playfield'

export type ScreenOrientationTarget = 'portrait' | 'landscape'

/** 테스트 플레이에서 잠글 화면 방향. 자유형은 고른 방향, 레인형은 지금 화면 방향을 따른다 */
export function orientationTarget(
  free: boolean,
  aspect: FreeAspect,
  viewport: { width: number; height: number }
): ScreenOrientationTarget {
  if (free) return aspect
  return viewport.width > viewport.height ? 'landscape' : 'portrait'
}

export interface PlaytestScreenSession {
  /** 전체 화면인 동안 방향 잠금만 새로 건다 (전체 화면을 나갔다 들어가지 않는다) */
  setTarget(target: ScreenOrientationTarget): void
  /** 얻은 것만 되돌린다. 여러 번 불러도 안전하다 */
  dispose(): void
}

/** 동기로 던지거나 Promise로 거절돼도 삼킨다. 처리 안 된 거절이 남지 않게 한다 */
function attempt<T>(fn: () => Promise<T> | T | undefined): Promise<T | undefined> {
  try {
    return Promise.resolve(fn()).catch(() => undefined)
  } catch {
    return Promise.resolve(undefined)
  }
}

interface WakeLockHandle {
  released?: boolean
  release?: () => Promise<void> | void
}

/**
 * 폰 테스트 플레이 화면 한 판을 만든다: 전체 화면, 화면 꺼짐 방지(Wake Lock), 방향 고정.
 * 지원하지 않거나 거절된 것은 조용히 건너뛴다.
 */
export function enterPlaytestScreen(initial: ScreenOrientationTarget): PlaytestScreenSession {
  let disposed = false
  let target = initial
  /** 이 세션이 전체 화면을 열었다 (이미 전체 화면이면 우리 것이 아니다) */
  let ownFullscreen = false
  /** 지금 전체 화면이다 (방향 잠금을 걸 수 있다) */
  let inFullscreen = false
  let orientationLocked = false
  let wakeLock: WakeLockHandle | null = null
  let acquiring = false

  const exitFullscreen = () => {
    ownFullscreen = false
    inFullscreen = false
    // 사용자가 이미 스와이프 등으로 나갔다면 부르지 않는다
    if (document.fullscreenElement) void attempt(() => document.exitFullscreen?.())
  }
  const unlockOrientation = () => {
    orientationLocked = false
    void attempt(() => screen.orientation?.unlock?.())
  }
  const releaseWakeLock = () => {
    const lock = wakeLock
    wakeLock = null
    if (lock) void attempt(() => lock.release?.())
  }

  const lockOrientation = async () => {
    if (disposed || !inFullscreen) return
    const locked = await attempt(() => screen.orientation?.lock?.(target).then(() => true))
    if (!locked) return
    orientationLocked = true
    if (disposed) unlockOrientation()
  }

  const acquireWakeLock = async () => {
    if (disposed || acquiring || (wakeLock && !wakeLock.released)) return
    acquiring = true
    const lock = await attempt(() => navigator.wakeLock?.request('screen'))
    acquiring = false
    if (!lock) return
    wakeLock = lock
    if (disposed) releaseWakeLock()
  }

  // 앱을 갈아탔다 돌아오면 브라우저가 Wake Lock을 풀어 두므로 다시 얻는다
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void acquireWakeLock()
  }
  try {
    document.addEventListener?.('visibilitychange', onVisibility)
  } catch {
    // 없으면 건너뛴다
  }
  void acquireWakeLock()

  void (async () => {
    if (document.fullscreenElement) {
      inFullscreen = true
    } else if (typeof document.documentElement?.requestFullscreen === 'function') {
      const entered = await attempt(() => document.documentElement.requestFullscreen().then(() => true))
      if (entered) {
        ownFullscreen = true
        inFullscreen = true
        if (disposed) exitFullscreen()
      }
    }
    await lockOrientation()
  })()

  return {
    setTarget(next) {
      if (next === target) return
      target = next
      void lockOrientation()
    },
    dispose() {
      if (disposed) return
      disposed = true
      try {
        document.removeEventListener?.('visibilitychange', onVisibility)
      } catch {
        // 없으면 건너뛴다
      }
      releaseWakeLock()
      if (ownFullscreen) exitFullscreen()
      if (orientationLocked) unlockOrientation()
    }
  }
}
