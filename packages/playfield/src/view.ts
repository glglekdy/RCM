/** 플레이 화면 배치와 시간↔좌표 계산 (그리기와 분리한 순수 함수). */

import type { PlayfieldLayout } from './layout';

/** 노트 머리와 레인 경계 사이 여백 */
export const NOTE_INSET = 3;
/** 키 표시(D F J K)를 그리는 판정선 아래 거리 */
export const KEY_LABEL_OFFSET = 48;
/** 마지막 판정 문구를 보여 주는 시간(ms) */
export const JUDGEMENT_SHOW_MS = 400;
/** 유저 배속 (DJMAX RESPECT V와 같은 범위·단위) */
export const MIN_SPEED = 1;
export const MAX_SPEED = 9;
export const DEFAULT_SPEED = 4;
export const SPEED_STEP = 0.1;
/**
 * 배속 1.0에서 노트가 화면 위에서 판정선까지 내려오는 시간(ms). 배속 X면 이 값 ÷ X.
 * DJMAX RESPECT V를 FHD에서 잰 값: 노트 출력~판정선 754px, 1.0배속 120BPM 마디 간격 560px(= 280px/s).
 */
export const DJMAX_TRAVEL_MS_AT_1X = (754 / 280) * 1000;

/** 범위 안으로 자르고 0.1 단위로 반올림한다. 숫자가 아니면 기본 배속. */
export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_SPEED;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(speed * 10) / 10));
}

/** 판정선이 화면 위에서 judgeY(px) 아래일 때, 노트가 위 끝에서 판정선까지 고정 시간에 오도록 하는 px/ms. */
export function pxPerMsForSpeed(speed: number, judgeY: number): number {
  // 창이 판정선 여백보다 낮아도 0으로 나누지 않게 최소 1px
  return (Math.max(judgeY, 1) * speed) / DJMAX_TRAVEL_MS_AT_1X;
}

/** 레인별 열의 x와 폭. 모든 레인 같은 너비(트랙의 width 힌트는 보지 않는다), 합계를 가운데 정렬. */
export function trackColumns(canvasWidth: number, laneCount: number, laneWidth: number): { x: number; width: number }[] {
  let x = Math.floor((canvasWidth - laneCount * laneWidth) / 2);
  return Array.from({ length: laneCount }, () => {
    const col = { x, width: laneWidth };
    x += laneWidth;
    return col;
  });
}

/** 판정선 중심의 y. */
export function judgeLineY(height: number, layout: PlayfieldLayout): number {
  return height - layout.judgeLineFromBottom;
}

/** 롱노트 몸통 너비 (레인 가운데 정렬). */
export function holdBodyWidth(laneWidth: number): number {
  return Math.round(laneWidth * 0.69);
}

/** 노트 머리가 중심에서 위아래로 차지하는 길이. 화면 밖 여유 계산에 쓴다. */
export function noteHalfExtent(layout: PlayfieldLayout): number {
  return layout.noteShape === 'circle' ? (layout.laneWidth - NOTE_INSET * 2) / 2 : layout.noteHeight / 2;
}

/** 판정선 아래에 키 표시를 그릴 자리가 있는지. */
export function keyLabelsVisible(layout: PlayfieldLayout): boolean {
  return layout.judgeLineFromBottom >= KEY_LABEL_OFFSET;
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

/**
 * 노트 머리·꼬리의 스크롤 위치. 둘 다 줄어들지 않게 보정해 이진 탐색에 쓴다. 꼬리 없는 노트는 머리와 같다.
 * maxHoldSpanPos는 가장 긴 롱노트 길이(스크롤 위치 단위).
 */
export function notePositions(
  notes: readonly { startMs: number; endMs?: number }[],
  scroll: { positionAt(ms: number): number },
): { startPos: number[]; endPos: number[]; maxHoldSpanPos: number } {
  const startPos: number[] = [];
  const endPos: number[] = [];
  let maxHoldSpanPos = 0;
  let prevStart = -Infinity;
  for (const n of notes) {
    // positionAt은 구간 경계에서 1e-13쯤 줄어들 수 있어 누적 최댓값으로 오름차순을 보장한다
    const start = Math.max(prevStart, scroll.positionAt(n.startMs));
    const end = n.endMs === undefined ? start : Math.max(start, scroll.positionAt(n.endMs));
    startPos.push(start);
    endPos.push(end);
    maxHoldSpanPos = Math.max(maxHoldSpanPos, end - start);
    prevStart = start;
  }
  return { startPos, endPos, maxHoldSpanPos };
}
