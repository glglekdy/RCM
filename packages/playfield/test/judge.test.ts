import { describe, expect, it } from 'vitest';
import { judgeClockMs, judgeDelta, timingOf } from '../src';

describe('judgeDelta', () => {
  it.each([[0, 'perfect'], [40, 'perfect'], [-41, 'great'], [80, 'great'], [120, 'good'], [-120, 'good'], [121, null]])(
    '판정 경계 %d', (d, j) => expect(judgeDelta(d)).toBe(j));
  it('rate를 주면 범위가 곡 시간으로 늘거나 준다', () => {
    expect(judgeDelta(80, 2)).toBe('perfect'); // 실제 40ms
    expect(judgeDelta(81, 2)).toBe('great');
    expect(judgeDelta(30, 0.5)).toBe('great'); // 실제 60ms
    expect(judgeDelta(61, 0.5)).toBeNull(); // 실제 122ms
    expect(judgeDelta(40)).toBe('perfect');
  });
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
