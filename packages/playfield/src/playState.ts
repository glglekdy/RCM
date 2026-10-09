import type { Chart, TimingMap } from '@rcm/core';
import { HOLD_RELEASE_TOLERANCE, judgeDelta, type JudgeEvent, type Judgement } from './judge';

interface PlayNote {
  lane: number;
  startMs: number;
  endMs?: number;
  headJudged: boolean;
  tailJudged: boolean;
}

export class PlayState {
  combo = 0;
  maxCombo = 0;
  readonly counts: Record<Judgement, number> = { perfect: 0, great: 0, good: 0, miss: 0 };

  private readonly notes: PlayNote[] = [];
  /** 레인별 노트 인덱스(시작 시각 순) */
  private readonly laneNotes: number[][] = [];
  /** 레인별로 판정 안 된 가장 이른 머리의 laneNotes 위치 */
  private readonly cursor: number[] = [];
  /** 레인별 누르는 중인 hold의 노트 인덱스 (없으면 -1) */
  private readonly holding: number[] = [];

  constructor(chart: Chart, tm: TimingMap, fromMs: number) {
    for (const n of chart.notes) {
      const startMs = tm.tickToMs(n.tick);
      if (startMs < fromMs) continue;
      this.notes.push({
        lane: n.lane,
        startMs,
        endMs: n.type === 'hold' ? tm.tickToMs(n.endTick) : undefined,
        headJudged: false,
        tailJudged: false,
      });
    }
    this.notes.sort((a, b) => a.startMs - b.startMs);
    this.notes.forEach((n, i) => {
      (this.laneNotes[n.lane] ??= []).push(i);
    });
  }

  press(lane: number, ms: number): JudgeEvent[] {
    if ((this.holding[lane] ?? -1) >= 0) return [];
    const list = this.laneNotes[lane];
    if (!list) return [];
    let c = this.advance(lane);
    for (; c < list.length; c++) {
      const idx = list[c];
      const n = this.notes[idx];
      if (n.headJudged) continue;
      if (n.startMs - ms > 120) break;
      const j = judgeDelta(ms - n.startMs);
      if (j === null) continue;
      n.headJudged = true;
      if (n.endMs === undefined) n.tailJudged = true;
      else if (j !== 'miss') this.holding[lane] = idx;
      this.advance(lane);
      return [this.record(lane, j, 'head', ms)];
    }
    return [];
  }

  release(lane: number, ms: number): JudgeEvent[] {
    const idx = this.holding[lane] ?? -1;
    if (idx < 0) return [];
    const n = this.notes[idx];
    this.holding[lane] = -1;
    n.tailJudged = true;
    const j: Judgement = ms < n.endMs! - HOLD_RELEASE_TOLERANCE ? 'miss' : 'perfect';
    return [this.record(lane, j, 'tail', ms)];
  }

  update(ms: number): JudgeEvent[] {
    const pending: { idx: number; part: 0 | 1; lane: number; judgement: Judgement }[] = [];
    for (let lane = 0; lane < this.laneNotes.length; lane++) {
      if (!this.laneNotes[lane]) continue;
      const h = this.holding[lane] ?? -1;
      if (h >= 0 && ms >= this.notes[h].endMs!) {
        this.holding[lane] = -1;
        this.notes[h].tailJudged = true;
        pending.push({ idx: h, part: 1, lane, judgement: 'perfect' });
      }
      const list = this.laneNotes[lane];
      for (let c = this.advance(lane); c < list.length; c++) {
        const n = this.notes[list[c]];
        if (n.headJudged) continue;
        if (ms <= n.startMs + 120) break;
        n.headJudged = true;
        pending.push({ idx: list[c], part: 0, lane, judgement: 'miss' });
        if (n.endMs !== undefined) {
          n.tailJudged = true;
          pending.push({ idx: list[c], part: 1, lane, judgement: 'miss' });
        }
      }
      this.advance(lane);
    }
    pending.sort((a, b) => a.idx - b.idx || a.part - b.part);
    return pending.map(p => this.record(p.lane, p.judgement, p.part === 0 ? 'head' : 'tail', ms));
  }

  /** 레인 커서를 판정 안 된 첫 머리로 옮기고 그 위치를 돌려준다. */
  private advance(lane: number): number {
    const list = this.laneNotes[lane];
    let c = this.cursor[lane] ?? 0;
    while (c < list.length && this.notes[list[c]].headJudged) c++;
    this.cursor[lane] = c;
    return c;
  }

  private record(lane: number, judgement: Judgement, part: 'head' | 'tail', ms: number): JudgeEvent {
    this.counts[judgement]++;
    if (judgement === 'miss') this.combo = 0;
    else {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    }
    return { lane, judgement, part, ms };
  }
}
