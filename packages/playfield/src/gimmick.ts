import { trackIndex, type Chart, type TimingMap } from '@rcm/core';

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
