import { describe, expect, it } from 'vitest';
import { clampSpeed, firstAtOrAbove, noteY, pxPerMsForSpeed, trackColumns, visibleScrollRange } from '../src';

describe('playfield view', () => {
  it('속도 → px/ms = speed × 0.1', () => {
    expect(pxPerMsForSpeed(5)).toBeCloseTo(0.5);
    expect(pxPerMsForSpeed(1)).toBeCloseTo(0.1);
  });
  it('속도는 1~10', () => {
    expect(clampSpeed(0.5)).toBe(1);
    expect(clampSpeed(10.5)).toBe(10);
    expect(clampSpeed(5.5)).toBe(5.5);
  });
  it('트랙 열: 폭 합계 가운데 정렬', () => {
    const cols = trackColumns(400, [{ id: 'S', width: 'wide' }, { id: 'N' }, { id: 'T', width: 'narrow' }]);
    expect(cols.map(c => c.width)).toEqual([107, 64, 43]);
    expect(cols[0].x).toBe(Math.floor((400 - 214) / 2));
    expect(cols[1].x).toBe(cols[0].x + 107);
  });
  it('노트 y: 판정선에서 남은 시간 × px/ms 만큼 위', () => {
    expect(noteY(1000, 800, 500, 0.5)).toBe(400);
    expect(noteY(800, 800, 500, 0.5)).toBe(500);
    expect(noteY(700, 800, 500, 0.5)).toBe(550);
  });
  it('스크롤 위치 단위의 화면 범위', () => {
    expect(visibleScrollRange(1000, 800, 680, 0.5)).toEqual({ fromPos: 760, toPos: 2360 });
  });
  it('firstAtOrAbove: 정지 구간처럼 같은 값이 이어져도 첫 것', () => {
    expect(firstAtOrAbove([0, 500, 1000, 1000, 1000, 1500], 1000)).toBe(2);
    expect(firstAtOrAbove([0, 500], 600)).toBe(2);
    expect(firstAtOrAbove([0, 500], -5)).toBe(0);
    expect(firstAtOrAbove([], 0)).toBe(0);
  });
});
