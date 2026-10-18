import { isFreeChart, type AnyChart, type FreeNote, type SlideEase, type SlidePoint } from './types';

/** 가로 구간 (칸 단위). */
export interface Span {
  x: number;
  width: number;
}

/** 노트가 시작하는 지점 (슬라이드는 첫 지점). */
export function freeNoteHead(note: FreeNote): { tick: number } & Span {
  return note.type === 'slide' ? note.points[0] : note;
}

/** 노트가 끝나는 tick (슬라이드는 마지막 지점, 나머지는 시작과 같다). */
export function freeNoteEndTick(note: FreeNote): number {
  return note.type === 'slide' ? note.points[note.points.length - 1].tick : note.tick;
}

/**
 * 채보 안에서 유일한 노트 키. 같은 tick에서 가로로 겹치는 노트는 없으므로 시작 tick과 왼쪽 x로 충분하다.
 */
export function freeNoteKey(note: FreeNote): string {
  const head = freeNoteHead(note);
  return `${head.tick}@${head.x}`;
}

/** 0~1 진행도를 이동 곡선에 맞춰 바꾼다. */
export function easeProgress(ease: SlideEase | undefined, t: number): number {
  const c = Math.min(1, Math.max(0, t));
  if (ease === 'easeIn') return c * c;
  if (ease === 'easeOut') return 1 - (1 - c) * (1 - c);
  return c;
}

/**
 * 슬라이드가 시각 `time`에 차지하는 가로 구간. `times`는 지점마다의 시각(같은 단위, 오름차순)이다.
 * 시작 전은 첫 지점, 끝난 뒤는 마지막 지점. 지점 사이는 앞 지점의 `ease`로 옮겨 간다.
 */
export function slideSpanAt(points: readonly SlidePoint[], times: readonly number[], time: number): Span {
  if (time <= times[0]) return { x: points[0].x, width: points[0].width };
  const last = points.length - 1;
  if (time >= times[last]) return { x: points[last].x, width: points[last].width };
  let i = 0;
  while (i < last - 1 && time >= times[i + 1]) i++;
  const a = points[i];
  const b = points[i + 1];
  const span = times[i + 1] - times[i];
  const t = easeProgress(a.ease, span > 0 ? (time - times[i]) / span : 1);
  return { x: a.x + (b.x - a.x) * t, width: a.width + (b.width - a.width) * t };
}

/** 노트마다의 시작 tick (레인형·자유형 공통, 채보 순서 그대로). */
export function noteStartTicks(chart: AnyChart): number[] {
  return isFreeChart(chart) ? chart.notes.map((n) => freeNoteHead(n).tick) : chart.notes.map((n) => n.tick);
}

/** 가장 늦게 끝나는 노트의 끝 tick. 노트가 없으면 0. */
export function lastNoteEndTick(chart: AnyChart): number {
  let last = 0;
  if (isFreeChart(chart)) for (const n of chart.notes) last = Math.max(last, freeNoteEndTick(n));
  else for (const n of chart.notes) last = Math.max(last, n.type === 'hold' ? n.endTick : n.tick);
  return last;
}
