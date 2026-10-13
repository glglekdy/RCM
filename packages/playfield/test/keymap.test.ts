import { describe, expect, it } from 'vitest';
import { HeldKeys, keyLabel, keysLabel, trackForCode, trackForKey } from '../src';

const km = new Map<string, string[]>([['Side_L', ['ShiftLeft']], ['Note_1', ['KeyS']], ['Note_2', []], ['Note_3', ['Space', 'KeyB']]]);

describe('track keymap', () => {
  it('키 → 트랙', () => {
    expect(trackForKey(km, { code: 'ShiftLeft', ctrlKey: false, metaKey: false, altKey: false })).toBe('Side_L');
    expect(trackForKey(km, { code: 'KeyS', ctrlKey: true, metaKey: false, altKey: false })).toBeNull();
    expect(trackForCode(km, 'KeyS')).toBe('Note_1');
    expect(trackForCode(km, 'KeyZ')).toBeNull();
  });
  it('보조 키도 같은 트랙', () => {
    expect(trackForCode(km, 'Space')).toBe('Note_3');
    expect(trackForCode(km, 'KeyB')).toBe('Note_3');
  });
  it('키 라벨', () => {
    expect(['KeyD', 'Semicolon', 'ShiftLeft', 'ShiftRight', 'Space'].map(keyLabel)).toEqual(['D', ';', 'L Shift', 'R Shift', 'Space']);
    expect(['Digit1', 'ArrowUp'].map(keyLabel)).toEqual(['1', 'ArrowUp']);
    expect(['Quote', 'Comma', 'Period', 'Slash'].map(keyLabel)).toEqual(["'", ',', '.', '/']);
    expect(['Numpad1', 'Numpad7'].map(keyLabel)).toEqual(['Num1', 'Num7']);
    expect([['Space', 'KeyB'], ['KeyD'], [], undefined].map(keysLabel)).toEqual(['Space/B', 'D', '-', '-']);
  });
  it('두 키로 누른 트랙은 둘 다 떼야 뗀다', () => {
    const h = new HeldKeys();
    expect(h.down('Note_3', 'Space')).toBe(true);
    expect(h.down('Note_3', 'Space')).toBe(false); // 키 반복
    expect(h.down('Note_3', 'KeyB')).toBe(false);
    expect(h.up('Note_3', 'Space')).toBe(false);
    expect(h.up('Note_3', 'KeyB')).toBe(true);
    expect(h.up('Note_3', 'KeyB')).toBe(false); // 누르지 않은 키
    h.down('Note_1', 'KeyS');
    h.clear();
    expect(h.down('Note_1', 'KeyS')).toBe(true);
  });
});
