/** 플레이 화면 배치와 시간↔좌표 계산 (그리기와 분리한 순수 함수). */

import type { Track, TrackWidth } from '@rcm/core';

export const TRACK_BASE_WIDTH = 64;
export const TRACK_WIDTH_FACTOR: Record<TrackWidth, number> = { narrow: 0.67, normal: 1, wide: 1.67 };
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

export function trackPixelWidth(w?: TrackWidth): number {
  return Math.round(TRACK_BASE_WIDTH * TRACK_WIDTH_FACTOR[w ?? 'normal']);
}

/** 트랙별 열의 x와 폭. 전체 폭 합계를 가운데 정렬한다. */
export function trackColumns(canvasWidth: number, tracks: readonly Track[]): { x: number; width: number }[] {
  const widths = tracks.map(t => trackPixelWidth(t.width));
  let x = Math.floor((canvasWidth - widths.reduce((a, b) => a + b, 0)) / 2);
  return widths.map(width => {
    const col = { x, width };
    x += width;
    return col;
  });
}

/** 스크롤 위치 notePos의 노트가 지금(nowPos) 있는 y. 판정선(judgeY) 위가 미래. 변속이 없으면 위치는 ms와 같다. */
export function noteY(notePos: number, nowPos: number, judgeY: number, pxPerMs: number): number {
  return judgeY - (notePos - nowPos) * pxPerMs;
}

/** 높이 height인 화면의 위 끝(toPos)과 아래 끝(fromPos)에 해당하는 스크롤 위치. */
export function visibleScrollRange(
  nowPos: number,
  height: number,
  judgeY: number,
  pxPerMs: number,
): { fromPos: number; toPos: number } {
  return { fromPos: nowPos - (height - judgeY) / pxPerMs, toPos: nowPos + judgeY / pxPerMs };
}

/** 오름차순 배열에서 value 이상인 첫 인덱스 (없으면 길이). 같은 값이 이어지면 그중 첫 것. */
export function firstAtOrAbove(sorted: readonly number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
