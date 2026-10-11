import { clampSpeed, DEFAULT_SPEED } from '@rcm/playfield'

/** 연달아 바꿀 때 설정 파일에는 멈춘 뒤 마지막 값만 쓴다 */
const SAVE_DELAY_MS = 500

/** 테스트 플레이 배속. 테스트 플레이를 다시 열거나 앱을 다시 켜도 유지된다 (설정 파일). */
let speed = DEFAULT_SPEED
let saveTimer: ReturnType<typeof setTimeout> | null = null

export async function loadPlaytestSpeed(): Promise<void> {
  const saved = await window.rcm.getPlaytestSpeed()
  if (saved !== null) speed = clampSpeed(saved)
}

export function getPlaytestSpeed(): number {
  return speed
}

/** 바로 반영하고 잠시 뒤 저장한다. 저장 실패는 경고만 남긴다 (이번 실행 동안은 값 유지). */
export function setPlaytestSpeed(next: number): void {
  speed = clampSpeed(next)
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    window.rcm.setPlaytestSpeed(speed).catch((err: unknown) => {
      console.warn('배속을 저장하지 못했어요', err)
    })
  }, SAVE_DELAY_MS)
}
