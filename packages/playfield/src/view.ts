/** 플레이 화면 배치와 시간↔좌표 계산 (그리기와 분리한 순수 함수). */

export const LANE_WIDTH = 64;
/** 판정선은 화면 아래에서 이만큼(px) 위 */
export const JUDGE_LINE_FROM_BOTTOM = 120;
/** 마지막 판정 문구를 보여 주는 시간(ms) */
export const JUDGEMENT_SHOW_MS = 400;
export const MIN_SPEED = 1;
export const MAX_SPEED = 10;
export const DEFAULT_SPEED = 5;

export function clampSpeed(speed: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
}

export function pxPerMsForSpeed(speed: number): number {
  return speed * 0.1;
}

/** 레인 묶음의 왼쪽 x (가운데 정렬). */
export function lanesLeft(width: number, lanes: number): number {
  return Math.floor((width - lanes * LANE_WIDTH) / 2);
}

/** 시각 noteMs의 노트가 지금(nowMs) 있는 y. 판정선(judgeY) 위가 미래. */
export function noteY(noteMs: number, nowMs: number, judgeY: number, pxPerMs: number): number {
  return judgeY - (noteMs - nowMs) * pxPerMs;
}

/** 높이 height인 화면의 위 끝(toMs)과 아래 끝(fromMs)에 해당하는 시각. */
export function visibleRange(
  nowMs: number,
  height: number,
  judgeY: number,
  pxPerMs: number,
): { fromMs: number; toMs: number } {
  return { fromMs: nowMs - (height - judgeY) / pxPerMs, toMs: nowMs + judgeY / pxPerMs };
}

/** startMs 오름차순 목록에서 startMs ≥ ms인 첫 인덱스 (없으면 길이). */
export function firstAtOrAfter(items: readonly { startMs: number }[], ms: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid].startMs < ms) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
