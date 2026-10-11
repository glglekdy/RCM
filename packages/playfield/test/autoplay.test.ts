import { describe, expect, it } from 'vitest';
import { basicTracks, TimingMap, type Chart, type Note } from '@rcm/core';
import { autoplayStep, PlayState, type JudgeEvent } from '../src';

const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0);
const chart = (notes: Note[]): Chart => ({ formatVersion: 1, name: 't', level: 1, tracks: basicTracks(4), notes });

/** 0ms부터 endMs까지 16ms마다 자동 플레이 → 판정 갱신. */
function run(state: PlayState, endMs: number): JudgeEvent[] {
  const events: JudgeEvent[] = [];
  for (let now = 0; now <= endMs; now += 16) {
    events.push(...autoplayStep(state, now), ...state.update(now));
  }
  return events;
}

describe('autoplayStep', () => {
  it('모두 PERFECT', () => {
    const s = new PlayState(
      chart([
        { tick: 480, track: 'Note_1', type: 'tap' },
        { tick: 960, track: 'Note_2', type: 'tap' },
        { tick: 1440, track: 'Note_1', type: 'tap' },
        { tick: 1440, track: 'Note_4', type: 'tap' },
        { tick: 1920, track: 'Note_3', type: 'hold', endTick: 2880 },
      ]),
      tm,
      0,
    );
    run(s, 5000);
    expect(s.counts).toEqual({ perfect: 6, great: 0, good: 0, miss: 0 });
  });

  it('롱노트는 끝 시각에 뗀다', () => {
    const s = new PlayState(chart([{ tick: 480, track: 'Note_2', type: 'hold', endTick: 1440 }]), tm, 0);
    const tail = run(s, 3000).find(e => e.part === 'tail');
    expect(tail).toEqual({ lane: 1, judgement: 'perfect', part: 'tail', ms: 1500 });
  });

  it('롱노트 끝과 같은 시각의 다음 노트', () => {
    const s = new PlayState(
      chart([
        { tick: 480, track: 'Note_1', type: 'hold', endTick: 960 },
        { tick: 960, track: 'Note_1', type: 'tap' },
      ]),
      tm,
      0,
    );
    run(s, 3000);
    expect(s.counts).toEqual({ perfect: 3, great: 0, good: 0, miss: 0 });
  });

  it('프레임이 크게 건너뛰어도 롱노트 뒤 같은 레인 노트를 놓치지 않음', () => {
    const s = new PlayState(
      chart([
        { tick: 480, track: 'Note_2', type: 'hold', endTick: 960 },
        { tick: 1440, track: 'Note_2', type: 'tap' },
      ]),
      tm,
      0,
    );
    autoplayStep(s, 5000);
    s.update(5000);
    expect(s.counts).toEqual({ perfect: 3, great: 0, good: 0, miss: 0 });
  });

  it('아직 오지 않은 노트는 누르지 않음', () => {
    const s = new PlayState(chart([{ tick: 480, track: 'Note_1', type: 'tap' }]), tm, 0);
    expect(autoplayStep(s, 499)).toEqual([]);
    expect(autoplayStep(s, 500)).toEqual([{ lane: 0, judgement: 'perfect', part: 'head', ms: 500 }]);
  });
});
