import { describe, expect, it } from 'vitest';
import { keyLabel, trackForCode, trackForKey } from '../src';

const km = new Map<string, string | null>([['Side_L', 'ShiftLeft'], ['Note_1', 'KeyS'], ['Note_2', null]]);

describe('track keymap', () => {
  it('키 → 트랙', () => {
    expect(trackForKey(km, { code: 'ShiftLeft', ctrlKey: false, metaKey: false, altKey: false })).toBe('Side_L');
    expect(trackForKey(km, { code: 'KeyS', ctrlKey: true, metaKey: false, altKey: false })).toBeNull();
    expect(trackForCode(km, 'KeyS')).toBe('Note_1');
    expect(trackForCode(km, 'KeyZ')).toBeNull();
  });
  it('키 라벨', () => {
    expect(['KeyD', 'Semicolon', 'ShiftLeft', 'ShiftRight', 'Space'].map(keyLabel)).toEqual(['D', ';', 'L Shift', 'R Shift', 'Space']);
    expect(['Digit1', 'ArrowUp'].map(keyLabel)).toEqual(['1', 'ArrowUp']);
  });
});
