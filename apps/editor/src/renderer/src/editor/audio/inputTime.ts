/** 에디터의 단일 시계 (AudioEngine). */
export interface AudioClock {
  readonly playing: boolean
  positionMs(): number
}

/**
 * 키 입력(탭 템포, 마커, 녹음)의 시각(ms). 재생 중이면 입력을 처리하는 순간의 오디오 시계를 읽는다
 * (재생선은 화면 프레임마다만 갱신되어 최대 한 프레임 늦다). 멈춰 있으면 재생선 위치.
 */
export function inputTimeMs(clock: AudioClock, playheadMs: number): number {
  return clock.playing ? clock.positionMs() : playheadMs
}
