import { describe, it, expect } from 'vitest';
import { TimingMap } from '../src';

const single = new TimingMap([{ tick: 0, bpm: 120, beatsPerMeasure: 4 }], 100);
const multi = new TimingMap([{ tick: 0, bpm: 120, beatsPerMeasure: 4 }, { tick: 1920, bpm: 60 }], 0);

describe('TimingMap', () => {
  it('단일 BPM', () => {
    expect(single.tickToMs(0)).toBe(100);
    expect(single.tickToMs(480)).toBe(600);
    expect(single.msToTick(600)).toBe(480);
    expect(single.tickToMs(-480)).toBe(-400);
    expect(single.msToTick(-400)).toBe(-480);
  });
  it('BPM 변경', () => {
    expect(multi.tickToMs(1920)).toBe(2000);
    expect(multi.tickToMs(2400)).toBe(3000);
    expect(multi.msToTick(3000)).toBe(2400);
    expect(multi.msToTick(1500)).toBe(1440);
    expect(multi.segmentAt(2400).beatsPerMeasure).toBe(4);
    expect(multi.segmentAt(2400).bpm).toBe(60);
  });
  it('음수 오프셋', () => expect(new TimingMap([{ tick: 0, bpm: 120 }], -50).tickToMs(0)).toBe(-50));
  it('첫 지점 beatsPerMeasure 생략 시 4', () => {
    expect(new TimingMap([{ tick: 0, bpm: 120 }], 0).segmentAt(0).beatsPerMeasure).toBe(4);
  });
  it('segmentAt endTick', () => {
    expect(multi.segmentAt(0).endTick).toBe(1920);
    expect(multi.segmentAt(1920).index).toBe(1);
    expect(multi.segmentAt(1920).endTick).toBe(Infinity);
  });
  it('격자는 BPM 변경 지점에서 다시 시작', () => {
    const tm = new TimingMap([{ tick: 0, bpm: 120, beatsPerMeasure: 4 }, { tick: 1000, bpm: 120, beatsPerMeasure: 3 }], 0);
    const lines = tm.gridLines(0, 2440, 4);
    expect(lines.filter(l => l.kind === 'measure').map(l => l.tick)).toEqual([0, 1000, 2440]);
    expect(lines.filter(l => l.kind === 'beat').map(l => l.tick)).toEqual([480, 960, 1480, 1960]);
  });
  it('스냅 선은 박/마디와 겹치면 높은 종류 하나만', () => {
    const lines = single.gridLines(0, 480, 8);
    expect(lines).toEqual([{ tick: 0, kind: 'measure' }, { tick: 240, kind: 'snap' }, { tick: 480, kind: 'beat' }]);
  });
  it('음수 구간 격자와 -0 정규화', () => {
    const lines = single.gridLines(-480, 0, 4);
    expect(lines).toEqual([{ tick: -480, kind: 'beat' }, { tick: 0, kind: 'measure' }]);
  });
});
