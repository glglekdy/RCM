import { TICKS_PER_BEAT, snapStepTicks, type SnapDivision } from './constants';
import type { TimingPoint } from './types';

export interface Segment {
  index: number;
  startTick: number;
  startMs: number;
  bpm: number;
  beatsPerMeasure: number;
  /** 다음 지점 tick, 없으면 Infinity */
  endTick: number;
}

export interface GridLine {
  tick: number;
  kind: 'measure' | 'beat' | 'snap';
}

/** -0 을 0 으로 정규화한다. */
export function normTick(tick: number): number {
  return tick === 0 ? 0 : tick;
}

export class TimingMap {
  private readonly segments: Segment[] = [];

  constructor(timing: TimingPoint[], offsetMs: number) {
    const points = [...timing].sort((a, b) => a.tick - b.tick);
    if (points.length === 0) points.push({ tick: 0, bpm: 120 });
    let beats = 4;
    let ms = offsetMs;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.beatsPerMeasure !== undefined) beats = p.beatsPerMeasure;
      if (i > 0) {
        const prev = this.segments[i - 1];
        ms = prev.startMs + ((p.tick - prev.startTick) * 60000) / (prev.bpm * TICKS_PER_BEAT);
      }
      this.segments.push({
        index: i,
        startTick: p.tick,
        startMs: ms,
        bpm: p.bpm,
        beatsPerMeasure: beats,
        endTick: i + 1 < points.length ? points[i + 1].tick : Infinity,
      });
    }
  }

  segmentAt(tick: number): Segment {
    const segs = this.segments;
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].startTick <= tick) lo = mid;
      else hi = mid - 1;
    }
    return segs[lo];
  }

  tickToMs(tick: number): number {
    const s = this.segmentAt(tick);
    return s.startMs + ((tick - s.startTick) * 60000) / (s.bpm * TICKS_PER_BEAT);
  }

  /** 실수 tick 을 돌려준다. */
  msToTick(ms: number): number {
    const segs = this.segments;
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segs[mid].startMs <= ms) lo = mid;
      else hi = mid - 1;
    }
    const s = segs[lo];
    return normTick(s.startTick + ((ms - s.startMs) * s.bpm * TICKS_PER_BEAT) / 60000);
  }

  /** [fromTick, toTick] (양끝 포함) 범위의 격자선. 구간마다 격자가 새로 시작한다. */
  gridLines(fromTick: number, toTick: number, division: SnapDivision): GridLine[] {
    const lines: GridLine[] = [];
    const step = snapStepTicks(division);
    for (const s of this.segments) {
      const lo = s.index === 0 ? fromTick : Math.max(fromTick, s.startTick);
      const hi = Math.min(toTick, s.endTick);
      const measure = s.beatsPerMeasure * TICKS_PER_BEAT;
      for (let i = Math.ceil((lo - s.startTick) / step); ; i++) {
        const rel = i * step;
        const tick = s.startTick + rel;
        if (tick > hi) break;
        if (tick >= s.endTick) break; // 경계는 다음 구간의 시작선이 된다
        const kind = rel % measure === 0 ? 'measure' : rel % TICKS_PER_BEAT === 0 ? 'beat' : 'snap';
        lines.push({ tick: normTick(tick), kind });
      }
    }
    return lines;
  }
}
