import { describe, expect, it } from 'vitest';
import { judgeClockMs, judgeDelta, timingOf } from '../src';

describe('judgeDelta', () => {
  it.each([[0, 'perfect'], [40, 'perfect'], [-41, 'great'], [80, 'great'], [120, 'good'], [-120, 'good'], [121, null]])(
    '판정 경계 %d', (d, j) => expect(judgeDelta(d)).toBe(j));
});

describe('timingOf', () => {
  it.each([[-41, 'great', 'early'], [81, 'good', 'late'], [-10, 'perfect', null], [130, 'miss', null]] as const)(
    '%d %s → %s', (d, j, t) => expect(timingOf(d, j)).toBe(t));
});

describe('judgeClockMs', () => {
  it('판정 시계는 화면 시계에서 오프셋을 뺀다', () => {
    expect(judgeClockMs(1000, 100)).toBe(900);
    expect(judgeClockMs(1000, -50)).toBe(1050);
  });
});
