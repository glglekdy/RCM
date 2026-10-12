import { describe, expect, it } from 'vitest';
import { TimingMap, type Chart } from '@rcm/core';
import { gimmickNotes } from '../src';

const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0);

describe('gimmickNotes', () => {
  const chart: Chart = {
    formatVersion: 1, name: 't', level: 1,
    tracks: [{ id: 'A' }, { id: 'G', kind: 'gimmick' }],
    notes: [
      { tick: 960, track: 'G', type: 'hold', endTick: 1920 },
      { tick: 0, track: 'G', type: 'tap' },
      { tick: 480, track: 'A', type: 'tap' },
      { tick: 1440, track: 'Nope', type: 'tap' },
    ],
  };
  it('기믹 레인 노트만 시작 시각 순으로', () => {
    expect(gimmickNotes(chart, tm, 0)).toEqual([
      { lane: 1, startMs: 0 },
      { lane: 1, startMs: 1000, endMs: 2000 },
    ]);
  });
  it('fromMs 이전 노트는 뺀다 (PlayState와 같은 규칙)', () => {
    expect(gimmickNotes(chart, tm, 100)).toEqual([{ lane: 1, startMs: 1000, endMs: 2000 }]);
  });
});
