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

/** 동기로 던지거나 Promise로 거절돼도 삼킨다. 처리 안 된 거절이 남지 않게 한다 */
function attempt<T>(fn: () => Promise<T> | T | undefined): Promise<T | undefined> {
  try {
    return Promise.resolve(fn()).catch(() => undefined)
  } catch {
    return Promise.resolve(undefined)
  }
}

interface ReleasableLock {
  release?: () => Promise<void> | void
}

/**
 * 폰 테스트 플레이 화면을 만든다: 전체 화면, 화면 꺼짐 방지(Wake Lock), 방향 고정.
 * 지원하지 않거나 거절된 것은 조용히 건너뛴다. 돌려주는 함수는 얻은 것만 되돌리고, 여러 번 불러도 안전하다.
 */
export function enterPlaytestScreen(target: ScreenOrientationTarget): () => void {
  let disposed = false
  let ownFullscreen = false
  let orientationLocked = false
  let wakeLock: ReleasableLock | null = null

  const exitFullscreen = () => {
    ownFullscreen = false
    void attempt(() => document.exitFullscreen?.())
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

  void attempt(() => navigator.wakeLock?.request('screen')).then((lock) => {
    if (!lock) return
    wakeLock = lock
    if (disposed) releaseWakeLock()
  })

  void (async () => {
    const requested = typeof document.documentElement?.requestFullscreen === 'function'
    const entered = requested
      ? await attempt(() => document.documentElement.requestFullscreen().then(() => true))
      : undefined
    if (entered) {
      ownFullscreen = true
      if (disposed) exitFullscreen()
    }
    if (disposed) return
    const locked = await attempt(() => screen.orientation?.lock?.(target).then(() => true))
    if (!locked) return
    orientationLocked = true
    if (disposed) unlockOrientation()
  })()

  return () => {
    if (disposed) return
    disposed = true
    releaseWakeLock()
    if (ownFullscreen) exitFullscreen()
    if (orientationLocked) unlockOrientation()
  }
}
