import { describe, expect, it } from 'vitest';
import { clampSpeed, firstAtOrAfter, lanesLeft, noteY, pxPerMsForSpeed, visibleRange } from '../src';

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
  it('레인 묶음(64px × 레인 수)을 가운데 정렬', () => {
    expect(lanesLeft(1000, 4)).toBe(372);
    expect(lanesLeft(1001, 7)).toBe(276);
  });
  it('노트 y: 판정선에서 남은 시간 × px/ms 만큼 위', () => {
    expect(noteY(1000, 800, 500, 0.5)).toBe(400);
    expect(noteY(800, 800, 500, 0.5)).toBe(500);
    expect(noteY(700, 800, 500, 0.5)).toBe(550);
  });
  it('화면에 보이는 시간 범위', () => {
    // 높이 620, 판정선 y=500 → 위로 500px(1000ms), 아래로 120px(240ms)
    expect(visibleRange(1000, 620, 500, 0.5)).toEqual({ fromMs: 760, toMs: 2000 });
  });
  it('startMs가 ms 이상인 첫 인덱스 (이진 탐색)', () => {
    const notes = [{ startMs: 0 }, { startMs: 10 }, { startMs: 10 }, { startMs: 20 }];
    expect(firstAtOrAfter(notes, -5)).toBe(0);
    expect(firstAtOrAfter(notes, 10)).toBe(1);
    expect(firstAtOrAfter(notes, 11)).toBe(3);
    expect(firstAtOrAfter(notes, 25)).toBe(4);
    expect(firstAtOrAfter([], 0)).toBe(0);
  });
});
