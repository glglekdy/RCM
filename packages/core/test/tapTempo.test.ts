import { describe, it, expect } from 'vitest';
import { estimateTempo } from '../src';

describe('estimateTempo', () => {
  it('정확한 탭', () => {
    const r = estimateTempo([0, 1, 2, 3, 4, 5, 6, 7].map(i => 100 + i * 400))!;
    expect(r.bpm).toBe(150);
    expect(r.firstBeatMs).toBeCloseTo(100, 6);
    expect(r.deviationMs).toBeCloseTo(0, 6);
    expect(r.count).toBe(8);
  });
  it('첫 박은 첫 탭 이전의 가장 이른 박', () => {
    const r = estimateTempo([0, 1, 2, 3, 4].map(i => 1000 + i * 500))!;
    expect(r.bpm).toBe(120);
    expect(r.firstBeatMs).toBeCloseTo(0, 6);
  });
  it('흔들린 탭', () => {
    const r = estimateTempo([0, 402, 798, 1201, 1600])!;
    expect(Math.abs(r.bpm - 150)).toBeLessThan(0.5);
    expect(r.deviationMs).toBeGreaterThan(0);
  });
  it('3번 이하는 null', () => expect(estimateTempo([0, 400, 800])).toBeNull());
});
