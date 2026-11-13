import { describe, expect, it } from 'vitest';
import { clampRate, RateClock, RATE_STEP } from '../src';

describe('clampRate', () => {
  it('0.1~5.0으로 자르고 0.1 단위로 반올림', () => {
    expect(clampRate(0)).toBe(0.1);
    expect(clampRate(-3)).toBe(0.1);
    expect(clampRate(99)).toBe(5);
    expect(clampRate(1.26)).toBe(1.3);
    expect(clampRate(Number.NaN)).toBe(1);
    expect(clampRate(Infinity)).toBe(1);
  });
  it('0.1부터 0.1씩 49번 올리면 정확히 5.0, 더 올려도 5.0', () => {
    let r = 0.1;
    for (let i = 0; i < 49; i++) r = clampRate(r + RATE_STEP);
    expect(r).toBe(5);
    expect(clampRate(r + RATE_STEP)).toBe(5);
  });
});

describe('RateClock', () => {
  it('rate 1이면 곡 시각 그대로', () => {
    expect(new RateClock().toReal(1234.5)).toBe(1234.5);
  });
  it('rate 2면 곡 2000ms가 실제 1000ms', () => {
    expect(new RateClock(2).toReal(2000)).toBe(1000);
  });
  it('도중에 바꿔도 그 순간 값이 이어진다', () => {
    const c = new RateClock();
    c.setRate(0.5, 1000);
    expect(c.toReal(1000)).toBe(1000);
    expect(c.toReal(1100)).toBe(1200);
    expect(c.rate).toBe(0.5);
  });
});
