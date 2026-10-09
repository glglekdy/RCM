import { describe, expect, it } from 'vitest';
import { basicTracks, TimingMap, type Chart, type Note } from '@rcm/core';
import { PlayState } from '../src';

const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0);
const chart = (notes: Note[]): Chart => ({ formatVersion: 1, name: 't', level: 1, tracks: basicTracks(4), notes });

describe('PlayState', () => {
  it('tap 판정과 콤보', () => {
    const s = new PlayState(chart([{ tick: 480, track: 'Note_1', type: 'tap' }, { tick: 960, track: 'Note_1', type: 'tap' }]), tm, 0);
    expect(s.press(0, 530)).toEqual([{ lane: 0, judgement: 'perfect', part: 'head', ms: 530 }]);
    expect(s.press(0, 700)).toEqual([]);
    expect(s.combo).toBe(1);
  });
  it('지나간 노트는 miss', () => {
    const s = new PlayState(chart([{ tick: 480, track: 'Note_1', type: 'tap' }]), tm, 0);
    expect(s.update(620)).toEqual([]);
    expect(s.update(621)).toEqual([{ lane: 0, judgement: 'miss', part: 'head', ms: 621 }]);
    expect(s.update(621)).toEqual([]);
    expect(s.combo).toBe(0);
    expect(s.counts.miss).toBe(1);
  });
  it('롱노트: 일찍 떼면 tail miss, 끝 -120 이후 떼면 성공', () => {
    const hold = chart([{ tick: 480, track: 'Note_2', type: 'hold', endTick: 1440 }]);
    const a = new PlayState(hold, tm, 0);
    a.press(1, 500);
    expect(a.release(1, 1379)).toEqual([{ lane: 1, judgement: 'miss', part: 'tail', ms: 1379 }]);
    const b = new PlayState(hold, tm, 0);
    b.press(1, 500);
    expect(b.release(1, 1380)).toEqual([{ lane: 1, judgement: 'perfect', part: 'tail', ms: 1380 }]);
    const c = new PlayState(hold, tm, 0);
    c.press(1, 500);
    expect(c.update(1500)).toEqual([{ lane: 1, judgement: 'perfect', part: 'tail', ms: 1500 }]);
  });
  it('놓친 롱노트는 head·tail 둘 다 miss', () => {
    const s = new PlayState(chart([{ tick: 480, track: 'Note_2', type: 'hold', endTick: 1440 }]), tm, 0);
    expect(s.update(700).map(e => e.part)).toEqual(['head', 'tail']);
  });
  it('시작 위치 이전 노트 제외', () => {
    const s = new PlayState(chart([{ tick: 480, track: 'Note_1', type: 'tap' }]), tm, 600);
    expect(s.update(5000)).toEqual([]);
  });
  it('update 이벤트는 노트 시작 순, head 다음 tail', () => {
    const s = new PlayState(chart([
      { tick: 480, track: 'Note_3', type: 'hold', endTick: 960 },
      { tick: 480, track: 'Note_1', type: 'tap' },
    ]), tm, 0);
    expect(s.update(700).map(e => `${e.lane}${e.part}`)).toEqual(['2head', '2tail', '0head']);
  });
  it('콤보 / maxCombo / counts', () => {
    const s = new PlayState(chart([
      { tick: 480, track: 'Note_1', type: 'tap' }, { tick: 960, track: 'Note_1', type: 'tap' }, { tick: 1440, track: 'Note_1', type: 'tap' },
    ]), tm, 0);
    s.press(0, 500);
    s.press(0, 1000);
    s.update(1700);
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(2);
    expect(s.counts).toEqual({ perfect: 2, great: 0, good: 0, miss: 1 });
  });
  it('이미 누르는 중인 레인의 press는 무시', () => {
    const s = new PlayState(chart([
      { tick: 480, track: 'Note_2', type: 'hold', endTick: 1440 }, { tick: 960, track: 'Note_2', type: 'tap' },
    ]), tm, 0);
    s.press(1, 500);
    expect(s.press(1, 1000)).toEqual([]);
  });
  it('트랙 순서가 바뀌어도 id로 판정', () => {
    const c: Chart = { formatVersion: 1, name: 't', level: 1, tracks: [{ id: 'B' }, { id: 'A' }], notes: [{ tick: 480, track: 'A', type: 'tap' }] };
    const s = new PlayState(c, tm, 0);
    expect(s.press(1, 500)).toEqual([{ lane: 1, judgement: 'perfect', part: 'head', ms: 500 }]);
  });
  it('notes는 시작 시각 순, heldNote는 누르는 중인 롱노트 인덱스', () => {
    const s = new PlayState(chart([
      { tick: 960, track: 'Note_1', type: 'tap' }, { tick: 480, track: 'Note_2', type: 'hold', endTick: 1440 },
    ]), tm, 0);
    expect(s.notes).toEqual([
      { lane: 1, startMs: 500, endMs: 1500, headJudged: false, tailJudged: false },
      { lane: 0, startMs: 1000, endMs: undefined, headJudged: false, tailJudged: false },
    ]);
    expect(s.heldNote(1)).toBe(-1);
    s.press(1, 510);
    expect(s.heldNote(1)).toBe(0);
    expect(s.notes[0].headJudged).toBe(true);
    s.release(1, 1450);
    expect(s.heldNote(1)).toBe(-1);
    expect(s.notes[0].tailJudged).toBe(true);
    expect(s.heldNote(7)).toBe(-1);
  });
});
