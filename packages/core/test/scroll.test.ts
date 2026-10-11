import { describe, expect, it } from 'vitest';
import { ScrollMap, TimingMap, formatSpeed } from '../src';

// tm120: 120 BPM, offset 0 → tick 480 = 500ms
const tm120 = new TimingMap([{ tick: 0, bpm: 120 }], 0);

describe('ScrollMap', () => {
  it('지점 없음: 위치 = 시간', () => {
    const s = new ScrollMap(undefined, tm120);
    expect(s.positionAt(1000)).toBe(1000);
    expect(s.positionAt(-200)).toBe(-200);
    expect(s.speedAt(5000)).toBe(1);
    expect(new ScrollMap(undefined, new TimingMap([{ tick: 0, bpm: 120 }], 100)).positionAt(1100)).toBe(1000);
  });
  it('즉시 ×2', () => {
    const s = new ScrollMap([{ tick: 960, speed: 2 }], tm120); // 1000ms
    expect(s.speedAt(999)).toBe(1);
    expect(s.speedAt(1000)).toBe(2);
    expect(s.positionAt(1500)).toBe(2000);
  });
  it('서서히 ×1 → ×3', () => {
    const s = new ScrollMap([{ tick: 960, speed: 1 }, { tick: 1920, speed: 3, ease: 'linear' }], tm120); // 1000→2000ms
    expect(s.speedAt(1500)).toBe(2);
    expect(s.positionAt(1500)).toBe(1750);
    expect(s.positionAt(2000)).toBe(3000);
    expect(s.positionAt(2500)).toBe(4500);
  });
  it('정지 구간에서는 위치가 그대로', () => {
    const s = new ScrollMap([{ tick: 960, speed: 0 }, { tick: 1440, speed: 1 }], tm120); // 1000→1500ms
    expect(s.positionAt(1200)).toBe(1000);
    expect(s.positionAt(1500)).toBe(1000);
    expect(s.positionAt(1700)).toBe(1200);
  });
  it('BPM이 바뀌는 곡: 변속 지점은 tick을 따라간다', () => {
    const tm = new TimingMap([{ tick: 0, bpm: 120 }, { tick: 960, bpm: 60 }], 0); // tick 1440 = 2000ms
    const s = new ScrollMap([{ tick: 1440, speed: 2 }], tm);
    expect(s.positionAt(2000)).toBe(2000);
    expect(s.positionAt(2500)).toBe(3000);
  });
  it('첫 지점이 서서히면 곡 시작(×1)부터 바뀐다', () => {
    const s = new ScrollMap([{ tick: 960, speed: 3, ease: 'linear' }], tm120);
    expect(s.speedAt(500)).toBe(2);
    expect(s.positionAt(1000)).toBe(2000);
    expect(new ScrollMap([{ tick: 0, speed: 2, ease: 'linear' }], tm120).positionAt(500)).toBe(1000);
  });
  it('위치는 줄어들지 않는다', () => {
    const s = new ScrollMap([{ tick: 480, speed: 0 }, { tick: 960, speed: 5, ease: 'linear' }, { tick: 1440, speed: 0.5 }], tm120);
    let prev = -Infinity;
    for (let ms = -500; ms <= 3000; ms += 7) { const p = s.positionAt(ms); expect(p).toBeGreaterThanOrEqual(prev); prev = p; }
  });
  it('formatSpeed', () => {
    expect([2, 1.25, 0.5, 1.234, 0].map(formatSpeed)).toEqual(['2.0', '1.25', '0.5', '1.23', '0.0']);
  });
});
