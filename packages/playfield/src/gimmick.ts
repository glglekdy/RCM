import { trackIndex, type Chart, type FreeChart, type SlidePoint, type TimingMap } from '@rcm/core';

/** 그리기만 하는 기믹 노트 하나 (시각은 ms). 판정 상태가 없다. */
export interface GimmickNote {
  lane: number;
  startMs: number;
  endMs?: number;
}

/** 기믹 트랙의 노트를 시작 시각 순으로. `PlayState`처럼 fromMs 이전 노트와 없는 트랙의 노트는 뺀다. */
export function gimmickNotes(chart: Chart, tm: TimingMap, fromMs: number): GimmickNote[] {
  const out: GimmickNote[] = [];
  for (const n of chart.notes) {
    const lane = trackIndex(chart.tracks, n.track);
    if (lane < 0 || chart.tracks[lane].kind !== 'gimmick') continue;
    const startMs = tm.tickToMs(n.tick);
    if (startMs < fromMs) continue;
    out.push(n.type === 'hold' ? { lane, startMs, endMs: tm.tickToMs(n.endTick) } : { lane, startMs });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** 그리기만 하는 자유형 기믹 노트 하나 (시각은 ms, 위치는 칸 단위). */
export interface FreeGimmickNote {
  startMs: number;
  /** 기믹 슬라이드: 끝 시각, 경로와 지점마다의 시각 */
  endMs?: number;
  points?: readonly SlidePoint[];
  pointMs?: readonly number[];
  /** 머리의 가로 구간 */
  x: number;
  width: number;
  color: string;
}

/** 자유형 채보의 기믹 노트(단발·기믹 슬라이드)를 시작 시각 순으로. fromMs 이전 노트와 종류가 없는 노트는 뺀다. */
export function freeGimmickNotes(chart: FreeChart, tm: TimingMap, fromMs: number): FreeGimmickNote[] {
  const colors = new Map((chart.gimmicks ?? []).map(g => [g.name, g.color]));
  const out: FreeGimmickNote[] = [];
  for (const n of chart.notes) {
    if (n.type === 'slide') {
      const color = n.gimmick === undefined ? undefined : colors.get(n.gimmick);
      const pointMs = n.points.map(p => tm.tickToMs(p.tick));
      if (color === undefined || pointMs[0] < fromMs) continue;
      const head = n.points[0];
      out.push({ startMs: pointMs[0], endMs: pointMs[pointMs.length - 1], points: n.points, pointMs, x: head.x, width: head.width, color });
      continue;
    }
    if (n.type !== 'gimmick') continue;
    const color = colors.get(n.gimmick);
    const startMs = tm.tickToMs(n.tick);
    if (color === undefined || startMs < fromMs) continue;
    out.push({ startMs, x: n.x, width: n.width, color });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}
