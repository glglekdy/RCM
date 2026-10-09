import type { Chart, TimingMap } from '@rcm/core';
import { HOLD_RELEASE_TOLERANCE, type JudgeEvent, type Judgement } from './judge';
import { LANE_KEYS, laneForCode, laneForKey, laneKeyLabel } from './keymap';
import { PlayState } from './playState';
import {
  clampSpeed,
  firstAtOrAfter,
  JUDGE_LINE_FROM_BOTTOM,
  JUDGEMENT_SHOW_MS,
  LANE_WIDTH,
  lanesLeft,
  noteY,
  pxPerMsForSpeed,
  visibleRange,
} from './view';

export interface PlayfieldColors {
  background: string;
  lane: string;
  laneLine: string;
  /** 누르고 있는 레인 위에 덧칠하는 색 */
  pressedLane: string;
  note: string;
  judgeLine: string;
  keyLabel: string;
  keyLabelPressed: string;
  combo: string;
  perfect: string;
  great: string;
  good: string;
  miss: string;
}

/** 기본 색: 에디터 타임라인 노트 색(6.3절), 판정선은 `--accent` */
export const DEFAULT_PLAYFIELD_COLORS: PlayfieldColors = {
  background: '#141414',
  lane: '#161616',
  laneLine: '#2a2a2a',
  pressedLane: 'rgba(255, 255, 255, 0.08)',
  note: '#f2f2f2',
  judgeLine: '#8b5cf6',
  keyLabel: '#8c8c8c',
  keyLabelPressed: '#e6e6e6',
  combo: '#e6e6e6',
  perfect: '#c4b5fd',
  great: '#22d3ee',
  good: '#f59e0b',
  miss: '#ef4444',
};

export interface PlayfieldOptions {
  chart: Chart;
  tm: TimingMap;
  /** 곡 기준 현재 시각(ms). 준비 시간에는 음수일 수 있다. */
  getTimeMs: () => number;
  /** 이 시각 이전 노트는 판정하지 않는다 */
  fromMs: number;
  /** 노트 속도 1~10 (기본 5) */
  speed: number;
  colors?: Partial<PlayfieldColors>;
}

const NOTE_HEIGHT = 14;
const NOTE_RADIUS = 3;
const NOTE_INSET = 3;
const HOLD_BODY_INSET = 10;
const HOLD_BODY_ALPHA = 0.6;
/** 놓쳤거나 일찍 뗀 롱노트의 남은 부분 */
const MISSED_HOLD_ALPHA = 0.3;
const FONT = 'Pretendard, system-ui, sans-serif';

const JUDGEMENT_TEXT: Record<Judgement, string> = {
  perfect: 'PERFECT',
  great: 'GREAT',
  good: 'GOOD',
  miss: 'MISS',
};

/**
 * 떨어지는 노트를 Canvas에 그리고 레인 키 입력을 판정한다.
 * 편집기 테스트 플레이와 게임이 함께 쓰므로 DOM(캔버스·window 키 이벤트) 말고는 의존하지 않는다.
 */
export class Playfield {
  readonly state: PlayState;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly colors: PlayfieldColors;
  private readonly lanes: number;
  private readonly labels: string[];
  /** 가장 긴 롱노트 길이(ms). 머리가 화면 아래로 지나간 롱노트도 그리기 위해 탐색 시작을 이만큼 당긴다. */
  private readonly maxHoldMs: number;
  private readonly pressed: boolean[];
  private speed: number;
  private last: { judgement: Judgement; ms: number } | null = null;
  private raf = 0;
  private running = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: PlayfieldOptions,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.colors = { ...DEFAULT_PLAYFIELD_COLORS, ...opts.colors };
    this.lanes = opts.chart.lanes;
    const keys = (LANE_KEYS as Record<number, readonly string[] | undefined>)[this.lanes] ?? [];
    this.labels = keys.map(laneKeyLabel);
    this.state = new PlayState(opts.chart, opts.tm, opts.fromMs);
    this.maxHoldMs = this.state.notes.reduce(
      (max, n) => (n.endMs === undefined ? max : Math.max(max, n.endMs - n.startMs)),
      0,
    );
    this.pressed = Array.from({ length: this.lanes }, () => false);
    this.speed = clampSpeed(opts.speed);
  }

  /** 그리기 루프와 키 입력을 시작한다. */
  start(): void {
    if (this.running) return;
    this.running = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    cancelAnimationFrame(this.raf);
  }

  setSpeed(speed: number): void {
    this.speed = clampSpeed(speed);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const lane = laneForKey(this.lanes, e);
    if (lane === null) return;
    // 5키·7키의 Space가 포커스된 버튼을 누르지 않게 막는다
    e.preventDefault();
    if (e.repeat || this.pressed[lane]) return;
    this.pressed[lane] = true;
    this.show(this.state.press(lane, this.opts.getTimeMs()));
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const lane = laneForCode(this.lanes, e.code);
    if (lane === null || !this.pressed[lane]) return;
    e.preventDefault();
    this.release(lane);
  };

  /** 창이 포커스를 잃으면 keyup이 오지 않으므로 눌린 레인을 모두 뗀다. */
  private readonly onBlur = (): void => {
    for (let lane = 0; lane < this.lanes; lane++) if (this.pressed[lane]) this.release(lane);
  };

  private release(lane: number): void {
    this.pressed[lane] = false;
    this.show(this.state.release(lane, this.opts.getTimeMs()));
  }

  private show(events: JudgeEvent[]): void {
    const e = events[events.length - 1];
    if (e) this.last = { judgement: e.judgement, ms: e.ms };
  }

  private readonly frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    const now = this.opts.getTimeMs();
    this.show(this.state.update(now));
    this.draw(now);
  };

  private draw(now: number): void {
    const { canvas, ctx, colors } = this;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(width * dpr);
    const bh = Math.round(height * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);
    if (width === 0 || height === 0) return;

    const left = lanesLeft(width, this.lanes);
    const fieldWidth = this.lanes * LANE_WIDTH;
    const judgeY = height - JUDGE_LINE_FROM_BOTTOM;
    const centerX = left + fieldWidth / 2;

    ctx.fillStyle = colors.lane;
    ctx.fillRect(left, 0, fieldWidth, height);
    ctx.fillStyle = colors.pressedLane;
    for (let lane = 0; lane < this.lanes; lane++) {
      if (this.pressed[lane]) ctx.fillRect(left + lane * LANE_WIDTH, 0, LANE_WIDTH, height);
    }
    ctx.fillStyle = colors.laneLine;
    for (let i = 0; i <= this.lanes; i++) ctx.fillRect(left + i * LANE_WIDTH, 0, 1, height);

    this.drawNotes(now, left, judgeY, height);

    ctx.fillStyle = colors.judgeLine;
    ctx.fillRect(left, judgeY - 1, fieldWidth, 3);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 14px ${FONT}`;
    for (let lane = 0; lane < this.lanes; lane++) {
      ctx.fillStyle = this.pressed[lane] ? colors.keyLabelPressed : colors.keyLabel;
      ctx.fillText(this.labels[lane] ?? '', left + lane * LANE_WIDTH + LANE_WIDTH / 2, judgeY + 48);
    }

    if (this.state.combo > 0) {
      ctx.fillStyle = colors.combo;
      ctx.font = `700 40px ${FONT}`;
      ctx.fillText(String(this.state.combo), centerX, judgeY - 250);
      ctx.font = `600 12px ${FONT}`;
      ctx.fillText('COMBO', centerX, judgeY - 222);
    }
    if (this.last && now - this.last.ms < JUDGEMENT_SHOW_MS) {
      ctx.fillStyle = colors[this.last.judgement];
      ctx.font = `800 28px ${FONT}`;
      ctx.fillText(JUDGEMENT_TEXT[this.last.judgement], centerX, judgeY - 180);
    }
  }

  /** 화면에 보이는 시간 범위의 노트만 그린다. 판정된 노트는 감추고, 누르는 중인 롱노트는 머리를 판정선에 붙인다. */
  private drawNotes(now: number, left: number, judgeY: number, height: number): void {
    const { ctx } = this;
    const pxPerMs = pxPerMsForSpeed(this.speed);
    const pad = NOTE_HEIGHT / pxPerMs;
    const { fromMs, toMs } = visibleRange(now, height, judgeY, pxPerMs);
    const notes = this.state.notes;
    const y = (ms: number) => noteY(ms, now, judgeY, pxPerMs);
    ctx.fillStyle = this.colors.note;
    for (let i = firstAtOrAfter(notes, fromMs - pad - this.maxHoldMs); i < notes.length; i++) {
      const n = notes[i];
      if (n.startMs > toMs + pad) break;
      if ((n.endMs ?? n.startMs) < fromMs - pad) continue;
      const x = left + n.lane * LANE_WIDTH;
      if (n.endMs === undefined) {
        if (!n.headJudged) this.drawHead(x, y(n.startMs));
        continue;
      }
      const held = this.state.heldNote(n.lane) === i;
      let headMs = n.startMs;
      let alpha = 1;
      if (held) headMs = Math.max(n.startMs, now);
      else if (n.headJudged) {
        // 끝났거나 성공으로 뗀 롱노트는 감추고, 놓쳤거나 일찍 뗀 롱노트는 끝이 다가올 때까지 흐리게
        if (now >= n.endMs - HOLD_RELEASE_TOLERANCE) continue;
        alpha = MISSED_HOLD_ALPHA;
      }
      const top = y(n.endMs);
      const bottom = y(headMs);
      ctx.globalAlpha = alpha * HOLD_BODY_ALPHA;
      ctx.fillRect(x + HOLD_BODY_INSET, top, LANE_WIDTH - HOLD_BODY_INSET * 2, bottom - top);
      ctx.globalAlpha = alpha;
      this.drawHead(x, bottom);
      ctx.globalAlpha = 1;
    }
  }

  private drawHead(laneX: number, y: number): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.roundRect(
      laneX + NOTE_INSET,
      y - NOTE_HEIGHT / 2,
      LANE_WIDTH - NOTE_INSET * 2,
      NOTE_HEIGHT,
      NOTE_RADIUS,
    );
    ctx.fill();
  }
}
