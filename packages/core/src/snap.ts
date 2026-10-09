import { snapStepTicks, type SnapDivision } from './constants';
import { normTick, type TimingMap } from './timing';

/** 가장 가까운 스냅 지점. 현재 구간의 격자와 다음 구간 시작점을 함께 고려한다. */
export function snapTick(tm: TimingMap, tick: number, division: SnapDivision): number {
  const step = snapStepTicks(division);
  const seg = tm.segmentAt(tick);
  let best = seg.startTick + Math.round((tick - seg.startTick) / step) * step;
  if (best >= seg.endTick) best = seg.endTick;
  if (seg.endTick !== Infinity && Math.abs(seg.endTick - tick) < Math.abs(best - tick)) {
    best = seg.endTick;
  }
  return normTick(best);
}

/** 한 칸 이동. 구간 경계를 한 번에 넘지 않고, 경계 자체는 멈춤 지점이다. */
export function stepTick(tm: TimingMap, tick: number, division: SnapDivision, dir: 1 | -1): number {
  const step = snapStepTicks(division);
  let seg = tm.segmentAt(tick);
  if (dir === 1) {
    const next = seg.startTick + (Math.floor((tick - seg.startTick) / step) + 1) * step;
    return normTick(Math.min(next, seg.endTick));
  }
  if (tick <= seg.startTick && seg.index > 0) {
    seg = tm.segmentAt(seg.startTick - 1);
  }
  const prev = seg.startTick + (Math.ceil((tick - seg.startTick) / step) - 1) * step;
  return normTick(prev);
}
