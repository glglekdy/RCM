import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EFFECT_MS,
  DEFAULT_HIT_EFFECTS,
  frameAt,
  HitEffectLayer,
  HoldRepeater,
  MAX_LIVE_EFFECTS,
  sheetFrames,
  slotFor,
  spriteDurationMs,
  type HitEffects,
} from '../src/hitEffects';

const img = {} as CanvasImageSource;
const colors = { perfect: '#c4b5fd', great: '#22d3ee', good: '#f59e0b' };

/** 호출을 기록하는 가짜 2D 컨텍스트. 그리는 동안의 합치기 방식·선 색도 남긴다 */
function fakeCtx() {
  const log = { ops: [] as string[], strokeStyles: [] as string[] };
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    strokeStyle: '',
    lineWidth: 1,
    save: vi.fn(() => log.ops.push('save')),
    restore: vi.fn(() => {
      log.ops.push('restore');
      ctx.globalCompositeOperation = 'source-over';
    }),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(() => {
      log.strokeStyles.push(ctx.strokeStyle);
      log.ops.push(`stroke:${ctx.globalCompositeOperation}`);
    }),
    drawImage: vi.fn(() => log.ops.push(`drawImage:${ctx.globalCompositeOperation}`)),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, raw: ctx, log };
}

const withSprite = (patch: Partial<HitEffects>): HitEffects => ({ ...DEFAULT_HIT_EFFECTS, ...patch });

describe('slotFor', () => {
  it('PERFECT만 단독, GREAT·GOOD 공용, MISS 없음', () => {
    expect(slotFor('perfect')).toBe('perfect');
    expect(slotFor('great')).toBe('normal');
    expect(slotFor('good')).toBe('normal');
    expect(slotFor('miss')).toBeNull();
  });
});

describe('sheetFrames', () => {
  it('왼→오, 위→아래, count에서 멈춤', () => {
    const f = sheetFrames(img, 400, 200, 4, 2, 6);
    expect(f).toHaveLength(6);
    expect(f[0]).toMatchObject({ image: img, sx: 0, sy: 0, sw: 100, sh: 100 });
    expect(f[3]).toMatchObject({ sx: 300, sy: 0 });
    expect(f[4]).toMatchObject({ sx: 0, sy: 100 });
  });

  it('count는 칸×줄을 넘지 않음', () => {
    expect(sheetFrames(img, 400, 200, 4, 2, 99)).toHaveLength(8);
  });

  it('작은 시트도 0 크기 프레임을 만들지 않음', () => {
    const f = sheetFrames(img, 16, 16, 32, 32, 1024);
    expect(f.every(fr => fr.sw >= 1 && fr.sh >= 1)).toBe(true);
  });
});

describe('frameAt', () => {
  it('fps로 프레임을 고르고 끝나면 null', () => {
    const s = { frames: sheetFrames(img, 400, 100, 4, 1, 4), fps: 10 };
    expect(spriteDurationMs(s)).toBe(400);
    expect(frameAt(s, 0)).toBe(s.frames[0]);
    expect(frameAt(s, 250)).toBe(s.frames[2]);
    expect(frameAt(s, 400)).toBeNull();
  });
});

describe('HitEffectLayer', () => {
  it('스프라이트 슬롯은 drawImage, 끝나면 지움', () => {
    const layer = new HitEffectLayer();
    const effects = withSprite({ perfect: { frames: sheetFrames(img, 400, 100, 4, 1, 4), fps: 10 } });
    const { ctx, raw } = fakeCtx();
    layer.spawn(100, 100, 'perfect', 0);
    layer.draw(ctx, 100, effects, colors);
    expect(raw.drawImage).toHaveBeenCalledTimes(1);
    layer.draw(ctx, 401, effects, colors);
    expect(raw.drawImage).toHaveBeenCalledTimes(1);
    expect(layer.count).toBe(0);
  });

  it('GREAT·GOOD은 normal 슬롯 스프라이트를 씀', () => {
    const layer = new HitEffectLayer();
    const effects = withSprite({ normal: { frames: sheetFrames(img, 100, 100, 1, 1, 1), fps: 10 } });
    const { ctx, raw } = fakeCtx();
    layer.spawn(0, 0, 'good', 0);
    layer.draw(ctx, 10, effects, colors);
    expect(raw.drawImage).toHaveBeenCalledTimes(1);
  });

  it('스프라이트 없는 슬롯은 기본 이펙트를 판정 색으로 그리고 300ms 뒤 지움', () => {
    expect(DEFAULT_EFFECT_MS).toBe(300);
    const layer = new HitEffectLayer();
    const { ctx, raw, log } = fakeCtx();
    layer.spawn(50, 50, 'great', 0);
    layer.draw(ctx, 100, DEFAULT_HIT_EFFECTS, colors);
    expect(raw.arc).toHaveBeenCalled();
    expect(raw.drawImage).not.toHaveBeenCalled();
    expect(log.strokeStyles.length).toBeGreaterThan(0);
    expect(log.strokeStyles.every(s => s === colors.great)).toBe(true);
    layer.draw(ctx, 301, DEFAULT_HIT_EFFECTS, colors);
    expect(layer.count).toBe(0);
  });

  it('긴 변을 size에 맞추고 가운데에 그림', () => {
    const layer = new HitEffectLayer();
    const sprite = { frames: [{ image: img, sx: 0, sy: 0, sw: 100, sh: 50 }], fps: 10 };
    const { ctx, raw } = fakeCtx();
    layer.spawn(200, 300, 'perfect', 0);
    layer.draw(ctx, 0, withSprite({ size: 128, perfect: sprite }), colors);
    expect(raw.drawImage).toHaveBeenCalledWith(img, 0, 0, 100, 50, 136, 268, 128, 64);
  });

  it('add면 lighter로 합치고 원래대로 돌림', () => {
    const layer = new HitEffectLayer();
    const { ctx, raw, log } = fakeCtx();
    layer.spawn(0, 0, 'perfect', 0);
    layer.draw(ctx, 10, withSprite({ blend: 'add' }), colors);
    expect(log.ops).toContain('stroke:lighter');
    expect(log.ops[0]).toBe('save');
    expect(log.ops[log.ops.length - 1]).toBe('restore');
    expect(raw.globalCompositeOperation).toBe('source-over');
  });

  it('그리다 예외가 나도 restore로 합치기 방식을 되돌림', () => {
    const layer = new HitEffectLayer();
    const { ctx, raw, log } = fakeCtx();
    raw.drawImage.mockImplementation(() => {
      throw new Error('InvalidStateError');
    });
    layer.spawn(0, 0, 'perfect', 0);
    const effects = withSprite({ blend: 'add', perfect: { frames: sheetFrames(img, 100, 100, 1, 1, 1), fps: 1 } });
    expect(() => layer.draw(ctx, 10, effects, colors)).toThrow();
    expect(log.ops[log.ops.length - 1]).toBe('restore');
  });

  it('닫힌(크기 0) 이미지 프레임은 건너뜀', () => {
    const layer = new HitEffectLayer();
    const { ctx, raw } = fakeCtx();
    const closed = { width: 0, height: 0 } as unknown as CanvasImageSource;
    layer.spawn(0, 0, 'perfect', 0);
    layer.draw(ctx, 10, withSprite({ perfect: { frames: [{ image: closed, sx: 0, sy: 0, sw: 10, sh: 10 }], fps: 1 } }), colors);
    expect(raw.drawImage).not.toHaveBeenCalled();
  });

  it('enabled false면 그리지 않음', () => {
    const layer = new HitEffectLayer();
    const { ctx, raw } = fakeCtx();
    layer.spawn(0, 0, 'perfect', 0);
    layer.draw(ctx, 10, withSprite({ enabled: false }), colors);
    expect(raw.arc).not.toHaveBeenCalled();
    expect(raw.drawImage).not.toHaveBeenCalled();
  });

  it('되감으면 지움', () => {
    const layer = new HitEffectLayer();
    const { ctx } = fakeCtx();
    layer.spawn(0, 0, 'perfect', 1000);
    layer.draw(ctx, 500, DEFAULT_HIT_EFFECTS, colors);
    expect(layer.count).toBe(0);
  });

  it('최대 64개, 넘치면 오래된 것부터', () => {
    expect(MAX_LIVE_EFFECTS).toBe(64);
    const layer = new HitEffectLayer();
    for (let i = 0; i < 70; i++) layer.spawn(0, 0, 'perfect', i);
    expect(layer.count).toBe(64);
    const { ctx } = fakeCtx();
    // 가장 오래 남은 것(6ms에 생성)도 아직 300ms가 안 지났다
    layer.draw(ctx, 305, DEFAULT_HIT_EFFECTS, colors);
    expect(layer.count).toBe(64);
    layer.draw(ctx, 306, DEFAULT_HIT_EFFECTS, colors);
    expect(layer.count).toBe(63);
  });

  it('clear는 모두 지움', () => {
    const layer = new HitEffectLayer();
    layer.spawn(0, 0, 'good', 0);
    layer.clear();
    expect(layer.count).toBe(0);
  });
});

describe('HoldRepeater', () => {
  it('처음 false, 150ms마다 true, 놓으면 다시 처음부터', () => {
    const r = new HoldRepeater<number>();
    expect(r.tick(0, 0)).toBe(false);
    r.sweep();
    expect(r.tick(0, 149)).toBe(false);
    r.sweep();
    expect(r.tick(0, 150)).toBe(true);
    r.sweep();
    expect(r.tick(0, 299)).toBe(false);
    r.sweep();
    expect(r.tick(0, 300)).toBe(true);
    r.sweep();
    r.sweep(); // 이번 프레임엔 안 잡음 → 지워짐
    expect(r.tick(0, 400)).toBe(false);
  });

  it('시각이 되돌아가면 그 시각부터 다시 잰다', () => {
    const r = new HoldRepeater<number>();
    r.tick(0, 1000);
    r.sweep();
    expect(r.tick(0, 500)).toBe(false);
    r.sweep();
    expect(r.tick(0, 650)).toBe(true);
  });

  it('키마다 따로 잰다', () => {
    const r = new HoldRepeater<number>();
    r.tick(0, 0);
    r.tick(1, 100);
    r.sweep();
    expect(r.tick(0, 150)).toBe(true);
    expect(r.tick(1, 150)).toBe(false);
  });
});
