import { describe, it, expect } from 'vitest';
import { TICKS_PER_BEAT, snapStepTicks, SNAP_DIVISIONS, noteKey, TRACK_KINDS } from '../src';

describe('constants', () => {
  it('1박은 480 tick', () => expect(TICKS_PER_BEAT).toBe(480));
  it('스냅 한 칸 tick', () => {
    expect(SNAP_DIVISIONS.map(snapStepTicks)).toEqual([480, 240, 160, 120, 80, 60]);
  });
  it('트랙 종류', () => expect(TRACK_KINDS).toEqual(['play', 'gimmick']));
  it('noteKey', () => expect(noteKey({ tick: 960, track: 'Side_L', type: 'tap' })).toBe('Side_L:960'));
});
