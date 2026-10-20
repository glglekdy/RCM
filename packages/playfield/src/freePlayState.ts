import { slideSpanAt, type FlickDirection, type FreeChart, type SlidePoint, type TimingMap } from '@rcm/core';
import { HOLD_RELEASE_TOLERANCE, JUDGE_WINDOWS, judgeDelta, timingOf, type Judgement, type Timing } from './judge';

/**
 * 자유형(모바일) 채보 판정. 입력은 포인터(손가락·마우스) 단위이고 위치는 칸 단위다.
 * 세로 위치도 칸 폭을 단위로 받아 플릭 거리를 화면 크기와 무관하게 잰다.
 */

/** 노트 양옆으로 이만큼(칸) 벗어나도 친 것으로 본다 */
export const TOUCH_MARGIN = 0.5;
/** 슬라이드를 잡고 있는 손가락이 경로에서 이만큼(칸) 벗어나도 봐준다 */
export const SLIDE_MARGIN = 1;
/** 누른 자리에서 이만큼(칸) 움직이면 플릭으로 본다 */
export const FLICK_DISTANCE = 0.75;
/** 플릭 방향이 정한 방향에서 이 각도(도)까지 벗어나도 맞는 방향이다 */
export const FLICK_ANGLE_TOLERANCE = 45;

export type FreeNoteKind = 'tap' | 'trace' | 'flick' | 'slide';

/** 플레이 중인 자유형 노트 하나 (시각은 ms). */
export interface FreePlayNote {
  kind: FreeNoteKind;
  startMs: number;
  /** 머리의 가로 구간 */
  x: number;
  width: number;
  /** 플릭(또는 끝 플릭 슬라이드)의 방향. 없으면 방향 무관 */
  direction?: FlickDirection;
  /** 슬라이드: 끝 시각, 경로, 판정하는 중간 지점 시각, 끝 플릭 */
  endMs?: number;
  points?: readonly SlidePoint[];
  pointMs?: readonly number[];
  tickMs?: readonly number[];
  endFlick?: boolean;
  headJudged: boolean;
  /** 판정한 중간 지점 수 */
  ticksJudged: number;
  tailJudged: boolean;
}

export interface FreeJudgeEvent {
  /** `notes` 인덱스 */
  note: number;
  judgement: Judgement;
  part: 'head' | 'tick' | 'tail';
  ms: number;
  timing?: Timing;
}

interface Pointer {
  col: number;
  row: number;
  /** 플릭 거리를 재는 기준점 (누른 자리, 플릭한 뒤에는 그 자리) */
  originCol: number;
  originRow: number;
  /** 누른 시각에 잡은 플릭 노트 (플릭을 기다리는 중) */
  flickNote: number;
  flickDownMs: number;
  /** 잡고 있는 슬라이드 */
  slide: number;
  /** 슬라이드 경로를 벗어난 시각 (안이면 null) */
  outSince: number | null;
}

const DIRECTION_ANGLES: Record<FlickDirection, number> = {
  right: 0,
  upRight: 45,
  up: 90,
  upLeft: 135,
  left: 180,
};

/** 움직인 벡터(dx 오른쪽 +, dy 아래 +)가 dir 방향인지. dir이 없으면 아무 방향이나 맞다. */
export function flickMatches(dx: number, dy: number, dir: FlickDirection | undefined): boolean {
  if (!dir) return true;
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
  let diff = Math.abs(angle - DIRECTION_ANGLES[dir]) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff <= FLICK_ANGLE_TOLERANCE;
}

export class FreePlayState {
  combo = 0;
  maxCombo = 0;
  readonly counts: Record<Judgement, number> = { perfect: 0, great: 0, good: 0, miss: 0 };

  private readonly playNotes: FreePlayNote[] = [];
  private readonly pointers = new Map<number, Pointer>();
  /** 판정 안 된 머리가 있는 가장 이른 노트 */
  private cursor = 0;

  constructor(chart: FreeChart, tm: TimingMap, fromMs: number) {
    for (const n of chart.notes) {
      // 기믹 노트·기믹 슬라이드는 판정하지 않는다 (그리기는 freeGimmickNotes)
      if (n.type === 'gimmick' || (n.type === 'slide' && n.gimmick !== undefined)) continue;
      if (n.type !== 'slide') {
        const startMs = tm.tickToMs(n.tick);
        if (startMs < fromMs) continue;
        const note: FreePlayNote = {
          kind: n.type,
          startMs,
          x: n.x,
          width: n.width,
          headJudged: false,
          ticksJudged: 0,
          tailJudged: true,
        };
        if (n.type === 'flick' && n.direction) note.direction = n.direction;
        this.playNotes.push(note);
        continue;
      }
      const pointMs = n.points.map(p => tm.tickToMs(p.tick));
      if (pointMs[0] < fromMs) continue;
      const last = n.points.length - 1;
      const note: FreePlayNote = {
        kind: 'slide',
        startMs: pointMs[0],
        x: n.points[0].x,
        width: n.points[0].width,
        endMs: pointMs[last],
        points: n.points,
        pointMs,
        tickMs: pointMs.filter((_, i) => i > 0 && i < last && !n.points[i].hidden),
        headJudged: false,
        ticksJudged: 0,
        tailJudged: false,
      };
      if (n.endFlick) {
        note.endFlick = true;
        if (n.direction) note.direction = n.direction;
      }
      this.playNotes.push(note);
    }
    this.playNotes.sort((a, b) => a.startMs - b.startMs);
  }

  get notes(): readonly Readonly<FreePlayNote>[] {
    return this.playNotes;
  }

  /** 슬라이드가 지금 시각에 있는 가로 구간 */
  slideSpan(note: Readonly<FreePlayNote>, ms: number): { x: number; width: number } {
    if (!note.points || !note.pointMs) return { x: note.x, width: note.width };
    return slideSpanAt(note.points, note.pointMs, ms);
  }

  /** 누군가 잡고 있는 슬라이드 (그리기용) */
  isHeld(index: number): boolean {
    for (const p of this.pointers.values()) if (p.slide === index) return true;
    return false;
  }

  /** 화면에 닿아 있는 포인터 id */
  pointerIds(): number[] {
    return [...this.pointers.keys()];
  }

  /** 화면에 닿아 있는 포인터 위치 (그리기용) */
  touches(): { col: number; row: number }[] {
    return [...this.pointers.values()].map(p => ({ col: p.col, row: p.row }));
  }

  down(id: number, col: number, row: number, ms: number): FreeJudgeEvent[] {
    const pointer: Pointer = {
      col,
      row,
      originCol: col,
      originRow: row,
      flickNote: -1,
      flickDownMs: 0,
      slide: -1,
      outSince: null,
    };
    this.pointers.set(id, pointer);
    // 창 안의 머리 중 시각이 가장 가까운 것 (트레이스는 누르지 않아도 되므로 뺀다)
    let best = -1;
    let bestDelta = Infinity;
    for (let i = this.advance(); i < this.playNotes.length; i++) {
      const n = this.playNotes[i];
      if (n.startMs - ms > JUDGE_WINDOWS.good) break;
      if (n.headJudged || n.kind === 'trace' || this.claimed(i)) continue;
      const delta = Math.abs(ms - n.startMs);
      if (delta > JUDGE_WINDOWS.good || !inSpan(col, n.x, n.width, TOUCH_MARGIN)) continue;
      if (delta < bestDelta) {
        best = i;
        bestDelta = delta;
      }
    }
    const events: FreeJudgeEvent[] = [];
    if (best >= 0) {
      const n = this.playNotes[best];
      if (n.kind === 'flick') {
        pointer.flickNote = best;
        pointer.flickDownMs = ms;
      } else {
        events.push(...this.judgeHead(best, ms - n.startMs, ms));
        if (n.kind === 'slide') pointer.slide = best;
      }
    }
    events.push(...this.traceTouch(col, ms));
    return events;
  }

  move(id: number, col: number, row: number, ms: number): FreeJudgeEvent[] {
    const p = this.pointers.get(id);
    if (!p) return [];
    p.col = col;
    p.row = row;
    const events: FreeJudgeEvent[] = [];
    const dx = col - p.originCol;
    const dy = row - p.originRow;
    if (Math.hypot(dx, dy) >= FLICK_DISTANCE) {
      // 플릭 한 번: 기준점을 옮겨 같은 움직임을 두 번 세지 않는다
      p.originCol = col;
      p.originRow = row;
      events.push(...this.flicked(p, dx, dy, ms));
    }
    events.push(...this.traceTouch(col, ms));
    return events;
  }

  up(id: number, ms: number): FreeJudgeEvent[] {
    const p = this.pointers.get(id);
    if (!p) return [];
    this.pointers.delete(id);
    const events: FreeJudgeEvent[] = [];
    if (p.flickNote >= 0) {
      // 튕기지 않고 뗀 플릭
      const n = this.playNotes[p.flickNote];
      if (!n.headJudged) events.push(...this.judgeHead(p.flickNote, null, ms));
    }
    if (p.slide >= 0) events.push(...this.releaseSlide(p.slide, ms, false));
    return events;
  }

  update(ms: number): FreeJudgeEvent[] {
    const events: FreeJudgeEvent[] = [];
    // 잡고 있는 슬라이드: 경로를 따라가는지, 중간 지점·끝
    for (const p of this.pointers.values()) {
      if (p.slide < 0) continue;
      const i = p.slide;
      const n = this.playNotes[i];
      const span = this.slideSpan(n, ms);
      if (inSpan(p.col, span.x, span.width, SLIDE_MARGIN)) p.outSince = null;
      else if (p.outSince === null) p.outSince = ms;
      else if (ms - p.outSince > HOLD_RELEASE_TOLERANCE) {
        events.push(...this.releaseSlide(i, ms, true));
        p.slide = -1;
        continue;
      }
      const ticks = n.tickMs ?? [];
      while (n.ticksJudged < ticks.length && ms >= ticks[n.ticksJudged]) {
        n.ticksJudged++;
        events.push(this.record(i, p.outSince === null ? 'perfect' : 'miss', 'tick', ms));
      }
      if (!n.endFlick && ms >= n.endMs!) {
        n.tailJudged = true;
        p.slide = -1;
        events.push(this.record(i, 'perfect', 'tail', ms));
      } else if (n.endFlick && ms > n.endMs! + JUDGE_WINDOWS.good) {
        events.push(...this.releaseSlide(i, ms, true));
        p.slide = -1;
      }
    }
    // 플릭을 기다리다 창이 지난 노트
    for (const p of this.pointers.values()) {
      if (p.flickNote < 0) continue;
      const n = this.playNotes[p.flickNote];
      if (!n.headJudged && ms > n.startMs + JUDGE_WINDOWS.good) events.push(...this.judgeHead(p.flickNote, null, ms));
      if (n.headJudged) p.flickNote = -1;
    }
    // 트레이스: 시각이 됐을 때 손가락이 올라가 있으면 친 것
    for (const p of this.pointers.values()) events.push(...this.traceTouch(p.col, ms));
    // 놓친 머리
    for (let i = this.advance(); i < this.playNotes.length; i++) {
      const n = this.playNotes[i];
      if (ms <= n.startMs + JUDGE_WINDOWS.good) break;
      if (n.headJudged || this.claimed(i)) continue;
      events.push(...this.judgeHead(i, null, ms));
    }
    return events;
  }

  /**
   * 자동 플레이 한 프레임: 시각이 된 머리는 PERFECT, 슬라이드 중간 지점·끝도 시각에 PERFECT.
   * 사람의 입력(포인터)과 섞지 않는다.
   */
  autoStep(ms: number): FreeJudgeEvent[] {
    const events: FreeJudgeEvent[] = [];
    for (let i = this.advance(); i < this.playNotes.length; i++) {
      const n = this.playNotes[i];
      if (n.startMs > ms) break;
      if (!n.headJudged && !this.claimed(i)) events.push(...this.judgeHead(i, 0, n.startMs));
    }
    this.playNotes.forEach((n, i) => {
      if (n.kind !== 'slide' || !n.headJudged || n.tailJudged || this.claimed(i)) return;
      const ticks = n.tickMs ?? [];
      while (n.ticksJudged < ticks.length && ms >= ticks[n.ticksJudged]) {
        events.push(this.record(i, 'perfect', 'tick', ticks[n.ticksJudged]));
        n.ticksJudged++;
      }
      if (ms >= n.endMs!) {
        n.tailJudged = true;
        events.push(this.record(i, 'perfect', 'tail', n.endMs!));
      }
    });
    return events;
  }

  /** 자동 플레이가 지금 잡고 있는 슬라이드인지 (머리는 쳤고 끝은 아직) */
  autoHolding(index: number): boolean {
    const n = this.playNotes[index];
    return n.kind === 'slide' && n.headJudged && !n.tailJudged && !this.claimed(index);
  }

  private flicked(p: Pointer, dx: number, dy: number, ms: number): FreeJudgeEvent[] {
    if (p.flickNote >= 0) {
      const i = p.flickNote;
      p.flickNote = -1;
      const n = this.playNotes[i];
      if (n.headJudged) return [];
      // 맞는 방향이면 누른 시각으로 판정, 틀리면 MISS
      if (!flickMatches(dx, dy, n.direction)) return this.judgeHead(i, null, ms);
      return this.judgeHead(i, p.flickDownMs - n.startMs, ms);
    }
    if (p.slide >= 0) {
      const i = p.slide;
      const n = this.playNotes[i];
      if (!n.endFlick || ms < n.endMs! - JUDGE_WINDOWS.good) return [];
      p.slide = -1;
      return this.finishSlide(i, ms, flickMatches(dx, dy, n.direction) ? judgeDelta(ms - n.endMs!) : 'miss');
    }
    return [];
  }

  /** 슬라이드에서 손을 뗐거나 경로를 벗어났다. broke면 지금까지 못 판정한 중간 지점·끝을 MISS로. */
  private releaseSlide(i: number, ms: number, broke: boolean): FreeJudgeEvent[] {
    const n = this.playNotes[i];
    if (n.tailJudged) return [];
    // 끝 플릭이 아닌 슬라이드는 끝 직전에 떼면 봐준다 (레인형 롱노트와 같다)
    const ok = !broke && !n.endFlick && ms >= n.endMs! - HOLD_RELEASE_TOLERANCE;
    return this.finishSlide(i, ms, ok ? 'perfect' : 'miss');
  }

  private finishSlide(i: number, ms: number, tail: Judgement | null): FreeJudgeEvent[] {
    const n = this.playNotes[i];
    const events: FreeJudgeEvent[] = [];
    const ticks = n.tickMs ?? [];
    const okTicks = tail !== 'miss' && tail !== null;
    while (n.ticksJudged < ticks.length) {
      n.ticksJudged++;
      events.push(this.record(i, okTicks ? 'perfect' : 'miss', 'tick', ms));
    }
    n.tailJudged = true;
    events.push(this.record(i, tail ?? 'miss', 'tail', ms));
    return events;
  }

  /** 트레이스: 시각 창 안에 손가락이 올라가 있으면 판정한다. 시각 전에 미리 올려 둔 것은 시각이 되면 PERFECT. */
  private traceTouch(col: number, ms: number): FreeJudgeEvent[] {
    const events: FreeJudgeEvent[] = [];
    for (let i = this.advance(); i < this.playNotes.length; i++) {
      const n = this.playNotes[i];
      if (n.startMs - ms > JUDGE_WINDOWS.perfect) break;
      if (n.kind !== 'trace' || n.headJudged || !inSpan(col, n.x, n.width, TOUCH_MARGIN)) continue;
      events.push(...this.judgeHead(i, Math.max(0, ms - n.startMs), ms));
    }
    return events;
  }

  /** delta가 null이면 MISS. 슬라이드 머리를 놓치면 중간 지점과 끝도 그 자리에서 MISS (머리 → 지점 → 끝 순). */
  private judgeHead(i: number, delta: number | null, ms: number): FreeJudgeEvent[] {
    const n = this.playNotes[i];
    n.headJudged = true;
    const j = delta === null ? 'miss' : (judgeDelta(delta) ?? 'miss');
    const e = this.record(i, j, 'head', ms);
    const timing = delta === null ? null : timingOf(delta, j);
    if (timing) e.timing = timing;
    this.advance();
    if (n.kind === 'slide' && j === 'miss') return [e, ...this.finishSlide(i, ms, 'miss')];
    return [e];
  }

  /** 플릭을 기다리는 포인터가 잡은 노트인지 */
  private claimed(i: number): boolean {
    for (const p of this.pointers.values()) if (p.flickNote === i || p.slide === i) return true;
    return false;
  }

  private advance(): number {
    while (this.cursor < this.playNotes.length && this.playNotes[this.cursor].headJudged) this.cursor++;
    return this.cursor;
  }

  private record(note: number, judgement: Judgement, part: FreeJudgeEvent['part'], ms: number): FreeJudgeEvent {
    this.counts[judgement]++;
    if (judgement === 'miss') this.combo = 0;
    else {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    }
    return { note, judgement, part, ms };
  }
}

function inSpan(col: number, x: number, width: number, margin: number): boolean {
  return col >= x - margin && col <= x + width + margin;
}
