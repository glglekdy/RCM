import { clampRate, DEFAULT_RATE } from '@rcm/playfield'

/**
 * 테스트 플레이의 배속 플레이(곡이 재생되는 빠르기). 앱을 켜 둔 동안만 기억하고 저장하지 않는다
 * (다시 켜면 1.0배로 돌아간다).
 */
let rate = DEFAULT_RATE

export function getPlaytestRate(): number {
  return rate
}

export function setPlaytestRate(next: number): void {
  rate = clampRate(next)
}
