import { describe, expect, it } from 'vitest';
import { LANE_KEYS, laneForCode, laneForKey, laneKeyLabel } from '../src';

describe('lane keymap', () => {
  it('레인 수와 키 개수가 같음', () => {
    for (const n of [4, 5, 6, 7, 8] as const) expect(LANE_KEYS[n]).toHaveLength(n);
  });
  it('7키', () => expect(LANE_KEYS[7].map(laneKeyLabel)).toEqual(['S', 'D', 'F', 'Space', 'J', 'K', 'L']));
  it('8키 세미콜론', () => expect(laneForCode(8, 'Semicolon')).toBe(7));
  it('없는 키', () => expect(laneForCode(4, 'KeyA')).toBeNull());
  it('laneForKey: Ctrl/Alt/Meta를 누른 채면 레인 키가 아님 (Ctrl+S 등)', () => {
    type Mod = 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey';
    const key = (code: string, mods: Partial<Record<Mod, boolean>> = {}) =>
      ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
    expect(laneForKey(7, key('Space'))).toBe(3);
    expect(laneForKey(7, key('KeyS', { shiftKey: true }))).toBe(0);
    expect(laneForKey(7, key('KeyS', { ctrlKey: true }))).toBeNull();
    expect(laneForKey(7, key('KeyS', { metaKey: true }))).toBeNull();
    expect(laneForKey(7, key('KeyS', { altKey: true }))).toBeNull();
    expect(laneForKey(4, key('KeyA'))).toBeNull();
  });
});
