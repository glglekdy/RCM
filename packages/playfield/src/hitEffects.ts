import type { Judgement } from './judge';

/** 타격 이펙트 슬롯. `normal`은 GREAT·GOOD이 함께 쓴다 */
export type HitEffectSlot = 'perfect' | 'normal';
/** `add`는 검은 배경 이펙트용 가산 합치기 (`lighter`) */
export type HitEffectBlend = 'normal' | 'add';

/** 이미지에서 잘라 그릴 한 프레임 */
export interface SpriteFrame {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface HitEffectSprite {
  frames: SpriteFrame[];
  fps: number;
}

export interface HitEffects {
  enabled: boolean;
  /** 이펙트 긴 변 길이(px) */
  size: number;
  blend: HitEffectBlend;
  /** 없으면 기본 이펙트 */
  perfect?: HitEffectSprite;
  normal?: HitEffectSprite;
}

export const DEFAULT_HIT_EFFECTS: Readonly<HitEffects> = Object.freeze({ enabled: true, size: 128, blend: 'normal' });

/** 롱노트·슬라이드를 잡고 있는 동안 이 간격으로 다시 터뜨린다 */
export const HOLD_EFFECT_INTERVAL_MS = 150;
/** 기본 이펙트 길이 */
export const DEFAULT_EFFECT_MS = 300;
/** 한 번에 살아 있는 이펙트 수. 넘치면 오래된 것부터 버린다 */
export const MAX_LIVE_EFFECTS = 64;

const SPARKS = 8;

export type EffectColors = Record<'perfect' | 'great' | 'good', string>;

export function slotFor(judgement: Judgement): HitEffectSlot | null {
  if (judgement === 'miss') return null;
  return judgement === 'perfect' ? 'perfect' : 'normal';
}

/** 시트를 왼→오, 위→아래 순으로 잘라 `count`개(최대 칸×줄) 프레임을 만든다. 프레임은 1px보다 작아지지 않는다 */
export function sheetFrames(
  image: CanvasImageSource,
  width: number,
  height: number,
  cols: number,
  rows: number,
  count: number,
): SpriteFrame[] {
  const sw = Math.max(1, Math.floor(width / cols));
  const sh = Math.max(1, Math.floor(height / rows));
  const n = Math.min(count, cols * rows);
  const frames: SpriteFrame[] = [];
  for (let i = 0; i < n; i++) {
    frames.push({ image, sx: (i % cols) * sw, sy: Math.floor(i / cols) * sh, sw, sh });
  }
  return frames;
}

export function spriteDurationMs(sprite: HitEffectSprite): number {
  return (sprite.frames.length * 1000) / sprite.fps;
}

/** 생성 뒤 `ageMs`에 보일 프레임. 애니메이션이 끝났으면 null */
export function frameAt(sprite: HitEffectSprite, ageMs: number): SpriteFrame | null {
  return sprite.frames[Math.floor((ageMs * sprite.fps) / 1000)] ?? null;
}

interface LiveEffect {
  x: number;
  y: number;
  judgement: Exclude<Judgement, 'miss'>;
  ms: number;
}

/** 판정선에서 터지는 이펙트들. 시각은 곡 시각(ms)이라 멈추면 같이 멈추고, 되감으면 사라진다 */
export class HitEffectLayer {
  private live: LiveEffect[] = [];

  get count(): number {
    return this.live.length;
  }

  spawn(x: number, y: number, judgement: Exclude<Judgement, 'miss'>, ms: number): void {
    this.live.push({ x, y, judgement, ms });
    if (this.live.length > MAX_LIVE_EFFECTS) this.live.splice(0, this.live.length - MAX_LIVE_EFFECTS);
  }

  clear(): void {
    this.live = [];
  }

  draw(ctx: CanvasRenderingContext2D, ms: number, effects: HitEffects, colors: EffectColors): void {
    if (!effects.enabled) {
      this.live = [];
      return;
    }
    ctx.save();
    // 그리다 예외가 나도 합치기 방식이 다음 프레임 배경까지 번지지 않게 되돌린다
    try {
      if (effects.blend === 'add') ctx.globalCompositeOperation = 'lighter';
      this.drawLive(ctx, ms, effects, colors);
    } finally {
      ctx.restore();
    }
  }

  private drawLive(ctx: CanvasRenderingContext2D, ms: number, effects: HitEffects, colors: EffectColors): void {
    this.live = this.live.filter(e => {
      const age = ms - e.ms;
      if (age < 0) return false;
      const sprite = effects[slotFor(e.judgement)!];
      if (!sprite) {
        if (age >= DEFAULT_EFFECT_MS) return false;
        drawBurst(ctx, e.x, e.y, age / DEFAULT_EFFECT_MS, effects.size, colors[e.judgement]);
        return true;
      }
      const f = frameAt(sprite, age);
      if (!f) return false;
      // 닫힌 ImageBitmap은 크기가 0이고 그리면 예외가 난다 (새 이미지로 바뀌는 사이)
      if ((f.image as { width?: unknown }).width === 0) return true;
      const k = effects.size / Math.max(f.sw, f.sh);
      const w = f.sw * k;
      const h = f.sh * k;
      ctx.globalAlpha = 1;
      ctx.drawImage(f.image, f.sx, f.sy, f.sw, f.sh, e.x - w / 2, e.y - h / 2, w, h);
      return true;
    });
  }
}

/** 기본 이펙트: 판정 색 링이 퍼지고 파편이 흩어진다. `p`는 0~1 진행률 */
function drawBurst(ctx: CanvasRenderingContext2D, x: number, y: number, p: number, size: number, color: string): void {
  const ease = 1 - (1 - p) ** 3;
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.04 * (1 - p));
  ctx.beginPath();
  ctx.arc(x, y, size * (0.15 + 0.35 * ease), 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  const from = size * (0.2 + 0.3 * ease);
  const to = size * (0.3 + 0.3 * ease);
  for (let i = 0; i < SPARKS; i++) {
    const a = (i / SPARKS) * Math.PI * 2;
    ctx.moveTo(x + Math.cos(a) * from, y + Math.sin(a) * from);
    ctx.lineTo(x + Math.cos(a) * to, y + Math.sin(a) * to);
  }
  ctx.stroke();
}

/**
 * 잡고 있는 롱노트·슬라이드를 일정 간격으로 다시 터뜨리기 위한 타이머.
 * 매 프레임 잡고 있는 키마다 `tick`하고 끝에 `sweep`하면 놓은 키는 잊는다.
 */
export class HoldRepeater<K> {
  private readonly keys = new Map<K, { last: number; seen: boolean }>();

  /** 다시 터뜨릴 때가 되면 true. 처음 잡은 프레임은 false (머리 판정이 이미 터뜨렸다) */
  tick(key: K, ms: number): boolean {
    const k = this.keys.get(key);
    if (!k) {
      this.keys.set(key, { last: ms, seen: true });
      return false;
    }
    k.seen = true;
    if (ms < k.last) {
      k.last = ms;
      return false;
    }
    if (ms - k.last < HOLD_EFFECT_INTERVAL_MS) return false;
    k.last = ms;
    return true;
  }

  sweep(): void {
    for (const [key, k] of this.keys) {
      if (!k.seen) this.keys.delete(key);
      else k.seen = false;
    }
  }
}
