import { ScrollMap, slideSpanAt, type FlickDirection, type FreeChart, type TimingMap } from '@rcm/core';
import type { Judgement, Timing } from './judge';
import { DEFAULT_LAYOUT, sanitizeLayout, type PlayfieldLayout } from './layout';
import { DEFAULT_PLAYFIELD_COLORS, type PlayfieldColors } from './Playfield';
import { FreePlayState, type FreeJudgeEvent, type FreePlayNote } from './freePlayState';
import { freeGimmickNotes, type FreeGimmickNote } from './gimmick';
import { DEFAULT_HIT_EFFECTS, HitEffectLayer, HoldRepeater, slotFor, type HitEffects } from './hitEffects';
import { freeFieldRect, pointToCell, type FreeAspect, type FreeFieldRect } from './freeView';
import {
  clampSpeed,
  firstAtOrAbove,
  judgeLineY,
  JUDGEMENT_SHOW_MS,
  notePositions,
  noteY,
  pxPerMsForSpeed,
  visibleScrollRange,
} from './view';

/** 노트 종류별 색 (에디터 타임라인과 같다) */
export const FREE_NOTE_COLORS = {
  tap: '#60a5fa',
  trace: '#facc15',
  flick: '#f472b6',
  slide: '#34d399',
} as const;

export interface FreePlayfieldOptions {
  chart: FreeChart;
  tm: TimingMap;
  getTimeMs: () => number;
  fromMs: number;
  speed: number;
  colors?: Partial<PlayfieldColors>;
  /** 노트 두께·판정선 위치 (레인 폭은 쓰지 않는다) */
  layout?: PlayfieldLayout;
  /** false면 포인터 입력을 받지 않는다. 기본 true */
  input?: boolean;
  autoplay?: boolean;
  aspect?: FreeAspect;
  /** 타격 이펙트 (없으면 DEFAULT_HIT_EFFECTS). `setHitEffects`로 바꿀 수 있다 */
  hitEffects?: HitEffects;
}

const FRAME_COLOR = '#1b1b1b';
const NOTE_RADIUS = 4;
const NOTE_INSET = 2;
const TRACE_RATIO = 0.6;
const MID_POINT_RATIO = 0.55;
const BODY_ALPHA = 0.35;
/** 기믹 노트: 판정이 없으므로 흐린 테두리만 */
const GIMMICK_ALPHA = 0.6;
const GIMMICK_BORDER = 2;
/** 슬라이드 몸통을 지점 사이마다 이만큼 끊어 그린다 */
const BODY_SAMPLES = 24;
const ARROW_LENGTH = 18;
const TOUCH_RADIUS = 22;
const TOUCH_COLOR = 'rgba(255, 255, 255, 0.18)';
const FONT = 'Pretendard, system-ui, sans-serif';

const JUDGEMENT_TEXT: Record<Judgement, string> = { perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS' };
const TIMING_TEXT: Record<Timing, string> = { early: 'EARLY', late: 'LATE' };

const DIRECTION_VECTORS: Record<FlickDirection, [number, number]> = {
  up: [0, -1],
  left: [-1, 0],
  right: [1, 0],
  upLeft: [-Math.SQRT1_2, -Math.SQRT1_2],
  upRight: [Math.SQRT1_2, -Math.SQRT1_2],
};

/**
 * 자유형(모바일) 채보를 Canvas에 그리고 포인터(마우스·터치) 입력을 판정한다.
 * 터치 화면에서는 손가락마다 따로 판정하므로 동시 누름도 칠 수 있다.
 */
export class FreePlayfield {
  readonly state: FreePlayState;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly colors: PlayfieldColors;
  private readonly scroll: ScrollMap;
  private readonly startPos: number[];
  private readonly endPos: number[];
  private readonly maxHoldSpanPos: number;
  private readonly gimmicks: FreeGimmickNote[];
  private readonly gimmickPos: { startPos: number[]; endPos: number[]; maxHoldSpanPos: number };
  private speed: number;
  private layout: PlayfieldLayout;
  private autoplay: boolean;
  private aspect: FreeAspect;
  /** 마지막으로 그린 판 배치 (포인터 좌표 변환용) */
  private rect: FreeFieldRect | null = null;
  private last: { judgement: Judgement; ms: number; timing?: Timing } | null = null;
  private hitEffects: HitEffects;
  private readonly effectLayer = new HitEffectLayer();
  private readonly holdRepeat = new HoldRepeater<number>();
  /** 노트별 머리 판정. 잡고 있는 슬라이드의 반복 이펙트가 따른다 */
  private readonly headJudgement = new Map<number, Judgement>();
  /** 다음 그리기에서 터뜨릴 판정 (화면 위치는 그릴 때 정해진다) */
  private pendingBursts: { note: number; judgement: Judgement; ms: number }[] = [];
  private raf = 0;
  private running = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: FreePlayfieldOptions,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.colors = { ...DEFAULT_PLAYFIELD_COLORS, ...opts.colors };
    this.state = new FreePlayState(opts.chart, opts.tm, opts.fromMs);
    this.scroll = new ScrollMap(opts.chart.speeds, opts.tm);
    const pos = notePositions(this.state.notes, this.scroll);
    this.startPos = pos.startPos;
    this.endPos = pos.endPos;
    this.maxHoldSpanPos = pos.maxHoldSpanPos;
    this.gimmicks = freeGimmickNotes(opts.chart, opts.tm, opts.fromMs);
    this.gimmickPos = notePositions(this.gimmicks, this.scroll);
    this.speed = clampSpeed(opts.speed);
    this.layout = sanitizeLayout(opts.layout ?? DEFAULT_LAYOUT);
    this.autoplay = opts.autoplay === true;
    this.aspect = opts.aspect ?? 'portrait';
    this.hitEffects = opts.hitEffects ?? DEFAULT_HIT_EFFECTS;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    if (this.opts.input !== false) {
      // 터치로 끌 때 화면이 스크롤·확대되지 않게 한다
      this.canvas.style.touchAction = 'none';
      this.canvas.addEventListener('pointerdown', this.onPointerDown);
      this.canvas.addEventListener('pointermove', this.onPointerMove);
      this.canvas.addEventListener('pointerup', this.onPointerUp);
      this.canvas.addEventListener('pointercancel', this.onPointerUp);
      window.addEventListener('blur', this.onBlur);
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('blur', this.onBlur);
    cancelAnimationFrame(this.raf);
    this.pendingBursts = [];
    this.effectLayer.clear();
  }

  setSpeed(speed: number): void {
    this.speed = clampSpeed(speed);
  }

  setLayout(layout: PlayfieldLayout): void {
    this.layout = sanitizeLayout(layout);
  }

  /** 켜져 있는 동안 포인터 입력은 무시한다. */
  setAutoplay(on: boolean): void {
    if (on) this.onBlur();
    this.autoplay = on;
  }

  setAspect(aspect: FreeAspect): void {
    this.aspect = aspect;
  }

  setHitEffects(hitEffects: HitEffects): void {
    this.hitEffects = hitEffects;
  }

  private cell(e: PointerEvent): { col: number; row: number } | null {
    if (!this.rect) return null;
    const box = this.canvas.getBoundingClientRect();
    return pointToCell(this.rect, e.clientX - box.left, e.clientY - box.top);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.autoplay || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const c = this.cell(e);
    if (!c) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.show(this.state.down(e.pointerId, c.col, c.row, this.opts.getTimeMs()));
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.autoplay) return;
    const c = this.cell(e);
    if (!c) return;
    this.show(this.state.move(e.pointerId, c.col, c.row, this.opts.getTimeMs()));
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.autoplay) return;
    this.show(this.state.up(e.pointerId, this.opts.getTimeMs()));
  };

  /** 창이 포커스를 잃으면 닿아 있던 포인터를 모두 뗀 것으로 한다. */
  private readonly onBlur = (): void => {
    const now = this.opts.getTimeMs();
    for (const id of this.state.pointerIds()) this.show(this.state.up(id, now));
  };

  private show(events: FreeJudgeEvent[]): void {
    for (const e of events) {
      if (e.part === 'head') this.headJudgement.set(e.note, e.judgement);
      if (slotFor(e.judgement)) this.pendingBursts.push(e);
    }
    const e = events[events.length - 1];
    if (e) this.last = { judgement: e.judgement, ms: e.ms, timing: e.timing };
  }

  private readonly frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    const now = this.opts.getTimeMs();
    if (this.autoplay) this.show(this.state.autoStep(now));
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

    const rect = freeFieldRect(width, height, this.opts.chart.columns, this.aspect);
    this.rect = rect;
    const { fieldX, fieldWidth, colPx } = rect;
    const judgeY = judgeLineY(height, this.layout);

    ctx.fillStyle = FRAME_COLOR;
    ctx.fillRect(rect.frameX, 0, rect.frameWidth, height);
    ctx.fillStyle = colors.lane;
    ctx.fillRect(fieldX, 0, fieldWidth, height);
    ctx.fillStyle = colors.laneLine;
    for (let c = 0; c <= this.opts.chart.columns; c++) ctx.fillRect(Math.round(fieldX + c * colPx), 0, 1, height);

    this.drawGimmicks(now, rect, judgeY, height);
    this.drawNotes(now, rect, judgeY, height);

    ctx.fillStyle = colors.judgeLine;
    const t = this.layout.judgeLineThickness;
    ctx.fillRect(fieldX, Math.round(judgeY - t / 2), fieldWidth, t);
    this.drawEffects(now, rect, judgeY);

    ctx.fillStyle = TOUCH_COLOR;
    for (const p of this.state.touches()) {
      ctx.beginPath();
      ctx.arc(fieldX + p.col * colPx, p.row * colPx, TOUCH_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    const centerX = fieldX + fieldWidth / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
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

  private drawNotes(now: number, rect: FreeFieldRect, judgeY: number, height: number): void {
    const { ctx, layout } = this;
    const pxPerMs = pxPerMsForSpeed(this.speed, judgeY);
    const pad = layout.noteHeight / pxPerMs;
    const nowPos = this.scroll.positionAt(now);
    const { fromPos, toPos } = visibleScrollRange(nowPos, height, judgeY, pxPerMs);
    const yAt = (ms: number) => noteY(this.scroll.positionAt(ms), nowPos, judgeY, pxPerMs);
    const xOf = (col: number) => rect.fieldX + col * rect.colPx;
    const notes = this.state.notes;
    // 늦게 시작한 노트가 위에 오도록 시작 순서대로 그린다
    for (let i = firstAtOrAbove(this.startPos, fromPos - pad - this.maxHoldSpanPos); i < notes.length; i++) {
      const n = notes[i];
      if (this.startPos[i] > toPos + pad) break;
      if (this.endPos[i] < fromPos - pad) continue;
      if (n.kind !== 'slide') {
        if (n.headJudged) continue;
        const h = n.kind === 'trace' ? layout.noteHeight * TRACE_RATIO : layout.noteHeight;
        const y = yAt(n.startMs);
        this.bar(xOf(n.x), xOf(n.x + n.width), y, h, FREE_NOTE_COLORS[n.kind]);
        if (n.kind === 'flick') this.arrow(xOf(n.x + n.width / 2), y - h / 2 - 4, n.direction, FREE_NOTE_COLORS.flick);
        continue;
      }
      if (n.tailJudged) continue;
      this.drawSlide(i, n, now, yAt, xOf);
    }
  }

  /**
   * 판정 난 노트를 그 시각의 가로 가운데(슬라이드는 경로 위치)에서 터뜨리고,
   * 잡고 있는 슬라이드는 머리 판정을 따라 일정 간격으로 지금 위치에서 다시 터뜨린다.
   */
  private drawEffects(now: number, rect: FreeFieldRect, judgeY: number): void {
    const notes = this.state.notes;
    const spawn = (i: number, judgement: Judgement, ms: number) => {
      if (judgement === 'miss') return;
      const n = notes[i];
      const span = n.kind === 'slide' ? this.state.slideSpan(n, ms) : n;
      this.effectLayer.spawn(rect.fieldX + (span.x + span.width / 2) * rect.colPx, judgeY, judgement, ms);
    };
    for (const b of this.pendingBursts) spawn(b.note, b.judgement, b.ms);
    this.pendingBursts = [];
    const nowPos = this.scroll.positionAt(now);
    for (let i = firstAtOrAbove(this.startPos, nowPos - this.maxHoldSpanPos); i < notes.length; i++) {
      if (this.startPos[i] > nowPos) break;
      const n = notes[i];
      if (n.kind !== 'slide' || !n.headJudged || n.tailJudged) continue;
      const held = this.state.isHeld(i) || (this.autoplay && this.state.autoHolding(i));
      if (held && this.holdRepeat.tick(i, now)) spawn(i, this.headJudgement.get(i) ?? 'perfect', now);
    }
    this.holdRepeat.sweep();
    this.effectLayer.draw(this.ctx, now, this.hitEffects, this.colors);
  }

  /** 기믹 노트는 치는 노트 아래에 테두리로만 그린다 */
  private drawGimmicks(now: number, rect: FreeFieldRect, judgeY: number, height: number): void {
    const { ctx, layout } = this;
    const pxPerMs = pxPerMsForSpeed(this.speed, judgeY);
    const pad = layout.noteHeight / pxPerMs;
    const nowPos = this.scroll.positionAt(now);
    const { fromPos, toPos } = visibleScrollRange(nowPos, height, judgeY, pxPerMs);
    const h = layout.noteHeight;
    const { startPos, endPos, maxHoldSpanPos } = this.gimmickPos;
    ctx.lineWidth = GIMMICK_BORDER;
    for (let i = firstAtOrAbove(startPos, fromPos - pad - maxHoldSpanPos); i < this.gimmicks.length; i++) {
      const n = this.gimmicks[i];
      if (startPos[i] > toPos + pad) break;
      if (endPos[i] < fromPos - pad) continue;
      const y = noteY(startPos[i], nowPos, judgeY, pxPerMs);
      const x0 = rect.fieldX + n.x * rect.colPx + NOTE_INSET;
      const w = Math.max(1, n.width * rect.colPx - NOTE_INSET * 2);
      ctx.strokeStyle = n.color;
      ctx.fillStyle = n.color;
      if (n.points && n.pointMs) {
        // 기믹 슬라이드: 경로를 따라 흐린 띠
        const { points, pointMs } = n;
        const samples: number[] = [pointMs[0]];
        for (let k = 0; k < pointMs.length - 1; k++) {
          for (let s = 1; s <= BODY_SAMPLES; s++) samples.push(pointMs[k] + ((pointMs[k + 1] - pointMs[k]) * s) / BODY_SAMPLES);
        }
        const spans = samples.map(t => slideSpanAt(points, pointMs, t));
        const ys = samples.map(t => noteY(this.scroll.positionAt(t), nowPos, judgeY, pxPerMs));
        const xOf = (col: number) => rect.fieldX + col * rect.colPx;
        ctx.beginPath();
        samples.forEach((_, k) => (k === 0 ? ctx.moveTo(xOf(spans[k].x), ys[k]) : ctx.lineTo(xOf(spans[k].x), ys[k])));
        for (let k = samples.length - 1; k >= 0; k--) ctx.lineTo(xOf(spans[k].x + spans[k].width), ys[k]);
        ctx.closePath();
        ctx.globalAlpha = GIMMICK_ALPHA * BODY_ALPHA;
        ctx.fill();
        ctx.globalAlpha = GIMMICK_ALPHA;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.roundRect(x0, y - h / 2, w, h, NOTE_RADIUS);
      ctx.globalAlpha = GIMMICK_ALPHA;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawSlide(
    index: number,
    n: Readonly<FreePlayNote>,
    now: number,
    yAt: (ms: number) => number,
    xOf: (col: number) => number,
  ): void {
    const { ctx, layout } = this;
    const points = n.points!;
    const times = n.pointMs!;
    const held = this.state.isHeld(index) || (this.autoplay && this.state.autoHolding(index));
    // 잡고 있으면 판정선부터, 아니면 머리부터 그린다
    const from = held ? Math.max(now, times[0]) : times[0];
    const samples: number[] = [from];
    for (let k = 0; k < times.length - 1; k++) {
      const a = times[k];
      const b = times[k + 1];
      for (let s = 1; s <= BODY_SAMPLES; s++) {
        const t = a + ((b - a) * s) / BODY_SAMPLES;
        if (t > from) samples.push(t);
      }
    }
    const spans = samples.map(t => slideSpanAt(points, times, t));
    const ys = samples.map(yAt);
    ctx.globalAlpha = BODY_ALPHA;
    ctx.fillStyle = FREE_NOTE_COLORS.slide;
    ctx.beginPath();
    samples.forEach((_, k) => {
      const x = xOf(spans[k].x);
      if (k === 0) ctx.moveTo(x, ys[k]);
      else ctx.lineTo(x, ys[k]);
    });
    for (let k = samples.length - 1; k >= 0; k--) ctx.lineTo(xOf(spans[k].x + spans[k].width), ys[k]);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    const last = points.length - 1;
    // 판정하는 중간 지점 (지나간 것은 그리지 않는다)
    for (let k = 1; k < last; k++) {
      if (points[k].hidden || times[k] < from) continue;
      this.bar(xOf(points[k].x), xOf(points[k].x + points[k].width), yAt(times[k]), layout.noteHeight * MID_POINT_RATIO, FREE_NOTE_COLORS.slide);
    }
    const endColor = n.endFlick ? FREE_NOTE_COLORS.flick : FREE_NOTE_COLORS.slide;
    const yEnd = yAt(times[last]);
    this.bar(xOf(points[last].x), xOf(points[last].x + points[last].width), yEnd, layout.noteHeight, endColor);
    if (n.endFlick) {
      this.arrow(xOf(points[last].x + points[last].width / 2), yEnd - layout.noteHeight / 2 - 4, n.direction, endColor);
    }
    // 머리: 잡고 있으면 판정선 위의 지금 위치
    if (held) this.bar(xOf(spans[0].x), xOf(spans[0].x + spans[0].width), ys[0], layout.noteHeight, FREE_NOTE_COLORS.slide);
    else if (!n.headJudged) this.bar(xOf(n.x), xOf(n.x + n.width), yAt(times[0]), layout.noteHeight, FREE_NOTE_COLORS.slide);
  }

  private bar(x0: number, x1: number, y: number, h: number, color: string): void {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x0 + NOTE_INSET, y - h / 2, Math.max(1, x1 - x0 - NOTE_INSET * 2), h, NOTE_RADIUS);
    ctx.fill();
  }

  /** 플릭 화살표. 방향이 없으면(방향 무관) 위쪽 꺾쇠 두 개. */
  private arrow(x: number, y: number, dir: FlickDirection | undefined, color: string): void {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    if (!dir) {
      ctx.beginPath();
      for (const dy of [0, 8]) {
        ctx.moveTo(x - 9, y - dy);
        ctx.lineTo(x, y - dy - 8);
        ctx.lineTo(x + 9, y - dy);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
      return;
    }
    const [vx, vy] = DIRECTION_VECTORS[dir];
    const sx = x - (vx * ARROW_LENGTH) / 2;
    const sy = vy === 0 ? y - 6 : y;
    const ex = sx + vx * ARROW_LENGTH;
    const ey = sy + vy * ARROW_LENGTH;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    const back = 8;
    const side = 7;
    const bx = ex - vx * back;
    const by = ey - vy * back;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(bx - vy * side, by + vx * side);
    ctx.lineTo(bx + vy * side, by - vx * side);
    ctx.closePath();
    ctx.fill();
    ctx.lineCap = 'butt';
  }
}
