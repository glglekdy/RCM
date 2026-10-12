import { DEFAULT_NOTE_COLOR, ScrollMap, type Chart, type TimingMap } from '@rcm/core';
import { HOLD_RELEASE_TOLERANCE, type JudgeEvent, type Judgement, type Timing } from './judge';
import { keyLabel, trackForCode, trackForKey } from './keymap';
import { autoplayStep } from './autoplay';
import { DEFAULT_LAYOUT, sanitizeLayout, type PlayfieldLayout } from './layout';
import { PlayState } from './playState';
import {
  clampSpeed,
  fitScale,
  firstAtOrAbove,
  holdBodyWidth,
  KEY_LABEL_OFFSET,
  keyLabelsVisible,
  NOTE_INSET,
  noteHalfExtent,
  judgeLineY,
  JUDGEMENT_SHOW_MS,
  trackColumns,
  notePositions,
  noteY,
  pxPerMsForSpeed,
  visibleScrollRange,
} from './view';

export interface PlayfieldColors {
  background: string;
  lane: string;
  laneLine: string;
  /** 누르고 있는 레인 위에 덧칠하는 색 */
  pressedLane: string;
  judgeLine: string;
  keyLabel: string;
  keyLabelPressed: string;
  combo: string;
  perfect: string;
  great: string;
  good: string;
  miss: string;
  /** 판정 글자 밑 EARLY / LATE */
  early: string;
  late: string;
}

/** 기본 색: 에디터 타임라인 색(6.3절), 판정선은 `--accent`. 노트는 트랙 색으로 그린다 */
export const DEFAULT_PLAYFIELD_COLORS: PlayfieldColors = {
  background: '#141414',
  lane: '#161616',
  laneLine: '#2a2a2a',
  pressedLane: 'rgba(255, 255, 255, 0.08)',
  judgeLine: '#8b5cf6',
  keyLabel: '#8c8c8c',
  keyLabelPressed: '#e6e6e6',
  combo: '#e6e6e6',
  perfect: '#c4b5fd',
  great: '#22d3ee',
  good: '#f59e0b',
  miss: '#ef4444',
  early: '#60a5fa',
  late: '#f87171',
};

export interface PlayfieldOptions {
  chart: Chart;
  tm: TimingMap;
  /** 곡 기준 현재 시각(ms). 준비 시간에는 음수일 수 있다. */
  getTimeMs: () => number;
  /** 이 시각 이전 노트는 판정하지 않는다 */
  fromMs: number;
  /** 배속 1.0~9.0 (DJMAX 고정 배속) */
  speed: number;
  /** 트랙 id → 키 code (없으면 null). 키 없는 트랙은 칠 수 없다. */
  keymap: ReadonlyMap<string, string | null>;
  colors?: Partial<PlayfieldColors>;
  /** 레인·노트·판정선 크기 (없으면 DEFAULT_LAYOUT) */
  layout?: PlayfieldLayout;
  /** false면 키 입력을 받지 않는다 (미리보기). 기본 true */
  input?: boolean;
  /**
   * 작은 미리보기용: 실제 플레이 화면의 높이(px). 주면 그 높이의 화면을 캔버스에 맞게 축소해 그린다
   * (레인과 판정선이 캔버스 밖으로 넘치지 않는다). 없으면 캔버스 크기 그대로 그린다.
   */
  viewHeight?: () => number;
  /** true면 모든 노트를 노트 시각에 자동으로 친다 (미리보기). 기본 false. `setAutoplay`로 바꿀 수 있다 */
  autoplay?: boolean;
}

const NOTE_RADIUS = 3;
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

const TIMING_TEXT: Record<Timing, string> = { early: 'EARLY', late: 'LATE' };

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
  private readonly noteColors: string[];
  private readonly scroll: ScrollMap;
  /** state.notes 순서대로 머리·꼬리의 스크롤 위치 (notePositions 참고). */
  private readonly startPos: number[];
  private readonly endPos: number[];
  /** 가장 긴 롱노트 길이(스크롤 위치 단위). 머리가 화면 아래로 지나간 롱노트도 그리기 위해 탐색 시작을 이만큼 당긴다. */
  private readonly maxHoldSpanPos: number;
  private readonly pressed: boolean[];
  private speed: number;
  private layout: PlayfieldLayout;
  private autoplay: boolean;
  private last: { judgement: Judgement; ms: number; timing?: Timing } | null = null;
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
    this.lanes = opts.chart.tracks.length;
    this.labels = opts.chart.tracks.map(t => {
      const code = opts.keymap.get(t.id);
      return code ? keyLabel(code) : '-';
    });
    this.noteColors = opts.chart.tracks.map(t => t.color ?? DEFAULT_NOTE_COLOR);
    this.state = new PlayState(opts.chart, opts.tm, opts.fromMs);
    this.scroll = new ScrollMap(opts.chart.speeds, opts.tm);
    const pos = notePositions(this.state.notes, this.scroll);
    this.startPos = pos.startPos;
    this.endPos = pos.endPos;
    this.maxHoldSpanPos = pos.maxHoldSpanPos;
    this.pressed = Array.from({ length: this.lanes }, () => false);
    this.speed = clampSpeed(opts.speed);
    this.layout = sanitizeLayout(opts.layout ?? DEFAULT_LAYOUT);
    this.autoplay = opts.autoplay === true;
  }

  /** 그리기 루프와 키 입력을 시작한다. */
  start(): void {
    if (this.running) return;
    this.running = true;
    if (this.opts.input !== false) {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('blur', this.onBlur);
    }
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

  /** 다음 프레임부터 새 크기로 그린다. */
  setLayout(layout: PlayfieldLayout): void {
    this.layout = sanitizeLayout(layout);
  }

  /**
   * 플레이 도중 자동 플레이를 켜고 끈다. 켜져 있는 동안 레인 키는 무시한다.
   * 끌 때 자동 플레이가 잡고 있던 롱노트는 끝까지 이어진다.
   */
  setAutoplay(on: boolean): void {
    this.autoplay = on;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const lane = this.laneOf(trackForKey(this.opts.keymap, e));
    if (lane < 0) return;
    // Space 키 트랙이 포커스된 버튼을 누르지 않게 막는다
    e.preventDefault();
    if (e.repeat || this.pressed[lane] || this.autoplay) return;
    this.pressed[lane] = true;
    this.show(this.state.press(lane, this.opts.getTimeMs()));
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const lane = this.laneOf(trackForCode(this.opts.keymap, e.code));
    if (lane < 0 || !this.pressed[lane]) return;
    e.preventDefault();
    this.release(lane);
  };

  private laneOf(id: string | null): number {
    return id === null ? -1 : this.opts.chart.tracks.findIndex(t => t.id === id);
  }

  /** 창이 포커스를 잃으면 keyup이 오지 않으므로 눌린 레인을 모두 뗀다. */
  private readonly onBlur = (): void => {
    for (let lane = 0; lane < this.lanes; lane++) if (this.pressed[lane]) this.release(lane);
  };

  private release(lane: number): void {
    this.pressed[lane] = false;
    // 누른 채로 자동 플레이를 켰으면 그 레인의 롱노트는 자동 플레이가 뗀다
    if (!this.autoplay) this.show(this.state.release(lane, this.opts.getTimeMs()));
  }

  private show(events: JudgeEvent[]): void {
    const e = events[events.length - 1];
    if (e) this.last = { judgement: e.judgement, ms: e.ms, timing: e.timing };
  }

  private readonly frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    const now = this.opts.getTimeMs();
    if (this.autoplay) this.show(autoplayStep(this.state, now));
    this.show(this.state.update(now));
    this.draw(now);
  };

  private draw(now: number): void {
    const { canvas, ctx, colors } = this;
    const boxWidth = canvas.clientWidth;
    const boxHeight = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(boxWidth * dpr);
    const bh = Math.round(boxHeight * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const viewHeight = this.opts.viewHeight?.();
    const scale =
      viewHeight === undefined
        ? 1
        : fitScale(boxWidth, boxHeight, viewHeight, this.lanes, this.layout.laneWidth);
    // 이 아래는 축소 전 크기로 그린다
    const width = boxWidth / scale;
    const height = boxHeight / scale;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);
    if (width === 0 || height === 0) return;

    const { layout } = this;
    const cols = trackColumns(width, this.lanes, layout.laneWidth);
    const last = cols[cols.length - 1];
    const left = cols[0].x;
    const fieldWidth = last.x + last.width - left;
    const judgeY = judgeLineY(height, layout);
    const centerX = left + fieldWidth / 2;

    ctx.fillStyle = colors.lane;
    ctx.fillRect(left, 0, fieldWidth, height);
    ctx.fillStyle = colors.pressedLane;
    for (let lane = 0; lane < this.lanes; lane++) {
      if (this.lanePressed(lane)) ctx.fillRect(cols[lane].x, 0, cols[lane].width, height);
    }
    ctx.fillStyle = colors.laneLine;
    for (const c of cols) ctx.fillRect(c.x, 0, 1, height);
    ctx.fillRect(last.x + last.width, 0, 1, height);

    this.drawNotes(now, cols, judgeY, height);

    ctx.fillStyle = colors.judgeLine;
    const t = layout.judgeLineThickness;
    // 픽셀 경계에 맞춘다 (기본 3px이면 예전과 같은 judgeY - 1)
    ctx.fillRect(left, Math.round(judgeY - t / 2), fieldWidth, t);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 14px ${FONT}`;
    if (keyLabelsVisible(layout)) {
      for (let lane = 0; lane < this.lanes; lane++) {
        ctx.fillStyle = this.lanePressed(lane) ? colors.keyLabelPressed : colors.keyLabel;
        ctx.fillText(this.labels[lane], cols[lane].x + cols[lane].width / 2, judgeY + KEY_LABEL_OFFSET);
      }
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
      const { timing } = this.last;
      if (timing) {
        ctx.fillStyle = colors[timing];
        ctx.font = `700 13px ${FONT}`;
        ctx.fillText(TIMING_TEXT[timing], centerX, judgeY - 156);
      }
    }
  }

  /** 화면에 보이는 스크롤 위치 범위의 노트만 그린다. 판정된 노트는 감추고, 누르는 중인 롱노트는 머리를 판정선에 붙인다. */
  private drawNotes(
    now: number,
    cols: readonly { x: number; width: number }[],
    judgeY: number,
    height: number,
  ): void {
    const { ctx } = this;
    const pxPerMs = pxPerMsForSpeed(this.speed, judgeY);
    const pad = noteHalfExtent(this.layout) / pxPerMs;
    const nowPos = this.scroll.positionAt(now);
    const { fromPos, toPos } = visibleScrollRange(nowPos, height, judgeY, pxPerMs);
    const notes = this.state.notes;
    const y = (pos: number) => noteY(pos, nowPos, judgeY, pxPerMs);
    for (let i = firstAtOrAbove(this.startPos, fromPos - pad - this.maxHoldSpanPos); i < notes.length; i++) {
      const n = notes[i];
      if (this.startPos[i] > toPos + pad) break;
      if (this.endPos[i] < fromPos - pad) continue;
      const { x, width: w } = cols[n.lane];
      ctx.fillStyle = this.noteColors[n.lane];
      if (n.endMs === undefined) {
        if (!n.headJudged) this.drawHead(x, w, y(this.startPos[i]));
        continue;
      }
      const held = this.state.heldNote(n.lane) === i;
      let headPos = this.startPos[i];
      let alpha = 1;
      if (held) headPos = Math.max(headPos, nowPos);
      else if (n.headJudged) {
        // 끝났거나 성공으로 뗀 롱노트는 감추고, 놓쳤거나 일찍 뗀 롱노트는 끝이 다가올 때까지 흐리게
        if (now >= n.endMs - HOLD_RELEASE_TOLERANCE) continue;
        alpha = MISSED_HOLD_ALPHA;
      }
      const top = y(this.endPos[i]);
      const bottom = y(headPos);
      ctx.globalAlpha = alpha * HOLD_BODY_ALPHA;
      const bw = holdBodyWidth(w);
      ctx.fillRect(x + (w - bw) / 2, top, bw, bottom - top);
      ctx.globalAlpha = alpha;
      this.drawHead(x, w, bottom);
      ctx.globalAlpha = 1;
    }
  }

  /** 키를 누르고 있거나 자동 플레이가 롱노트를 잡고 있는 레인 (키빔) */
  private lanePressed(lane: number): boolean {
    return this.pressed[lane] || (this.autoplay && this.state.heldNote(lane) >= 0);
  }

  private drawHead(laneX: number, laneWidth: number, y: number): void {
    const { ctx, layout } = this;
    ctx.beginPath();
    if (layout.noteShape === 'circle') {
      ctx.arc(laneX + laneWidth / 2, y, (laneWidth - NOTE_INSET * 2) / 2, 0, Math.PI * 2);
    } else {
      ctx.roundRect(
        laneX + NOTE_INSET,
        y - layout.noteHeight / 2,
        laneWidth - NOTE_INSET * 2,
        layout.noteHeight,
        NOTE_RADIUS,
      );
    }
    ctx.fill();
  }
}
