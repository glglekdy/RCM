import { describe, it, expect } from 'vitest';
import { TimingMap, snapTick, stepTick } from '../src';

const tm = new TimingMap([{ tick: 0, bpm: 120 }, { tick: 1000, bpm: 120 }], 0);

describe('snap', () => {
  it('가장 가까운 스냅', () => {
    expect(snapTick(tm, 130, 16)).toBe(120);
    expect(snapTick(tm, 990, 4)).toBe(1000);
    expect(snapTick(tm, 1010, 4)).toBe(1000);
    expect(snapTick(tm, -100, 4)).toBe(0);
    expect(snapTick(tm, -300, 4)).toBe(-480);
  });
  it('한 칸 이동', () => {
    expect(stepTick(tm, 0, 4, 1)).toBe(480);
    expect(stepTick(tm, 130, 16, -1)).toBe(120);
    expect(stepTick(tm, 960, 4, 1)).toBe(1000);
    expect(stepTick(tm, 0, 4, -1)).toBe(-480);
  });
  it('구간 경계에서 뒤로/앞으로 이동', () => {
    expect(stepTick(tm, 1000, 4, -1)).toBe(960);
    expect(stepTick(tm, 1000, 4, 1)).toBe(1480);
  });
});
