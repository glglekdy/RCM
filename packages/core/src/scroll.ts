import type { TimingMap } from './timing';
import type { SpeedPoint } from './types';

interface Knot {
  ms: number;
  speed: number;
  /** 이 지점 시작 시점의 누적 스크롤 위치 */
  pos: number;
  /** 다음 지점으로 선형 변화하면 true */
  linearNext: boolean;
  /** 다음 지점까지의 길이(ms), 마지막이면 Infinity */
  length: number;
  nextSpeed: number;
}

/** 속도 배율 표기: 소수 둘째 자리까지, 최소 한 자리 (2 → "2.0", 1.25 → "1.25"). */
export function formatSpeed(speed: number): string {
  const s = speed.toFixed(2);
  return s.endsWith('0') ? s.slice(0, -1) : s;
}

/** 변속 지점으로 시각별 속도 v(t)와 스크롤 위치 S(t) 를 계산한다. */
export class ScrollMap {
  private readonly base: number;
  private readonly knots: Knot[] = [];

  constructor(speeds: readonly SpeedPoint[] | undefined, tm: TimingMap) {
    this.base = tm.tickToMs(0);
    const pts: { ms: number; speed: number; linear: boolean }[] = (speeds ?? []).map((p) => ({
      ms: tm.tickToMs(p.tick),
      speed: p.speed,
      linear: p.ease === 'linear' && p.tick > 0,
    }));
    // 첫 지점이 서서히면 이전 지점은 (곡 시작, ×1)
    if (pts.length > 0 && pts[0].linear) pts.unshift({ ms: this.base, speed: 1, linear: false });

    let pos = pts.length > 0 ? pts[0].ms - this.base : 0;
    pts.forEach((p, i) => {
      const next = pts[i + 1];
      const length = next ? next.ms - p.ms : Infinity;
      this.knots.push({
        ms: p.ms,
        speed: p.speed,
        pos,
        linearNext: !!next && next.linear,
        length,
        nextSpeed: next ? next.speed : p.speed,
      });
      if (next) pos += p.speed * length + (next.linear ? ((next.speed - p.speed) * length) / 2 : 0);
    });
  }

  private knotAt(ms: number): Knot | undefined {
    const ks = this.knots;
    if (ks.length === 0 || ms < ks[0].ms) return undefined;
    let lo = 0;
    let hi = ks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ks[mid].ms <= ms) lo = mid;
      else hi = mid - 1;
    }
    return ks[lo];
  }

  speedAt(ms: number): number {
    const k = this.knotAt(ms);
    if (!k) return 1;
    if (!k.linearNext) return k.speed;
    return k.speed + ((k.nextSpeed - k.speed) * (ms - k.ms)) / k.length;
  }

  positionAt(ms: number): number {
    const k = this.knotAt(ms);
    if (!k) return ms - this.base;
    const d = ms - k.ms;
    const pos = k.pos + k.speed * d;
    return k.linearNext ? pos + ((k.nextSpeed - k.speed) * d * d) / (2 * k.length) : pos;
  }
}
