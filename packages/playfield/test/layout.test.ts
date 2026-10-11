import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, LAYOUT_LIMITS, layoutEquals, sanitizeLayout } from '../src';

describe('gameplay layout', () => {
  it('기본값과 범위', () => {
    expect(DEFAULT_LAYOUT).toEqual({
      laneWidth: 64,
      noteHeight: 14,
      noteShape: 'bar',
      judgeLineThickness: 3,
      judgeLineFromBottom: 120,
    });
    expect(LAYOUT_LIMITS).toEqual({
      laneWidth: { min: 30, max: 200 },
      noteHeight: { min: 4, max: 60 },
      judgeLineThickness: { min: 1, max: 20 },
      judgeLineFromBottom: { min: 0, max: 400 },
    });
  });

  it('객체가 아니면 기본값', () => {
    for (const raw of [null, 'x', [], undefined]) {
      const l = sanitizeLayout(raw);
      expect(l).toEqual(DEFAULT_LAYOUT);
      expect(l).not.toBe(DEFAULT_LAYOUT);
    }
  });

  it('범위로 자르고 반올림', () => {
    expect(
      sanitizeLayout({ laneWidth: 10, noteHeight: 99, judgeLineThickness: 2.6, judgeLineFromBottom: 500, noteShape: 'circle' }),
    ).toEqual({ laneWidth: 30, noteHeight: 60, noteShape: 'circle', judgeLineThickness: 3, judgeLineFromBottom: 400 });
  });

  it('잘못된 키만 기본값', () => {
    expect(sanitizeLayout({ laneWidth: '80', noteHeight: NaN, noteShape: 'square', judgeLineThickness: 5 })).toEqual({
      laneWidth: 64,
      noteHeight: 14,
      noteShape: 'bar',
      judgeLineThickness: 5,
      judgeLineFromBottom: 120,
    });
  });

  it('layoutEquals', () => {
    expect(layoutEquals(DEFAULT_LAYOUT, { ...DEFAULT_LAYOUT })).toBe(true);
    expect(layoutEquals(DEFAULT_LAYOUT, { ...DEFAULT_LAYOUT, judgeLineFromBottom: 121 })).toBe(false);
    expect(layoutEquals(DEFAULT_LAYOUT, { ...DEFAULT_LAYOUT, noteShape: 'circle' })).toBe(false);
  });
});
