import { describe, expect, it } from 'vitest';
import { LANE_KEYS, laneForCode, laneKeyLabel } from '../src';

describe('lane keymap', () => {
  it('레인 수와 키 개수가 같음', () => {
    for (const n of [4, 5, 6, 7, 8] as const) expect(LANE_KEYS[n]).toHaveLength(n);
  });
  it('7키', () => expect(LANE_KEYS[7].map(laneKeyLabel)).toEqual(['S', 'D', 'F', 'Space', 'J', 'K', 'L']));
  it('8키 세미콜론', () => expect(laneForCode(8, 'Semicolon')).toBe(7));
  it('없는 키', () => expect(laneForCode(4, 'KeyA')).toBeNull());
});
