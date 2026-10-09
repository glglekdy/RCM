import { describe, expect, it } from 'vitest';
import { judgeDelta } from '../src';

describe('judgeDelta', () => {
  it.each([[0, 'perfect'], [40, 'perfect'], [-41, 'great'], [80, 'great'], [120, 'good'], [-120, 'good'], [121, null]])(
    '판정 경계 %d', (d, j) => expect(judgeDelta(d)).toBe(j));
});
