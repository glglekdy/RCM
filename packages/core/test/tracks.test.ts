import { describe, expect, it } from 'vitest';
import { basicTracks, compareNotes, isGimmick, isValidTrackId, nextTrackId, trackErrors, trackIndex, type Note } from '../src';

describe('tracks', () => {
  it('트랙 id 규칙', () => {
    expect(isValidTrackId('Side_L')).toBe(true);
    expect(isValidTrackId('a-1')).toBe(true);
    expect(isValidTrackId('')).toBe(false);
    expect(isValidTrackId('노트')).toBe(false);
    expect(isValidTrackId('x'.repeat(33))).toBe(false);
  });
  it('basicTracks / nextTrackId', () => {
    expect(basicTracks(3).map((t) => t.id)).toEqual(['Note_1', 'Note_2', 'Note_3']);
    expect(nextTrackId([{ id: 'Note_1' }, { id: 'Note_3' }])).toBe('Note_2');
    expect(nextTrackId([{ id: 'Side_L' }])).toBe('Note_1');
  });
  it('트랙 순서 정렬', () => {
    const tracks = [{ id: 'Side_L' }, { id: 'Note_1' }];
    const notes: Note[] = [{ tick: 0, track: 'Note_1', type: 'tap' }, { tick: 0, track: 'Side_L', type: 'tap' }];
    expect([...notes].sort(compareNotes(tracks)).map((n) => n.track)).toEqual(['Side_L', 'Note_1']);
  });
  it('trackIndex', () => {
    expect(trackIndex([{ id: 'A' }, { id: 'B' }], 'B')).toBe(1);
    expect(trackIndex([{ id: 'A' }], 'Z')).toBe(-1);
  });
  it('trackErrors', () => {
    expect(trackErrors([{ id: 'A' }], 'x › tracks')).toEqual([]);
    expect(trackErrors('no', 'x › tracks')).toHaveLength(1);
    expect(trackErrors([{ id: 'A' }, { id: 'A' }], 'x › tracks')[0]).toContain('x › tracks[1].id');
    expect(trackErrors([{ id: 'A', kind: 'x' }], 'tracks')).toEqual(['tracks[0].kind: play, gimmick 중 하나여야 함']);
    expect(trackErrors([{ id: 'A', width: 'huge' }, { id: 'B', kind: 'gimmick' }], 'tracks')).toEqual([]);
  });
  it('isGimmick', () => {
    expect(isGimmick({ kind: 'gimmick' })).toBe(true);
    expect(isGimmick({ kind: 'play' })).toBe(false);
    expect(isGimmick({})).toBe(false);
  });
});
