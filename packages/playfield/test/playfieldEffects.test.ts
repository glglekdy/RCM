import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { basicTracks, TimingMap, type Chart, type FreeChart, type FreeNote, type Note } from '@rcm/core';
import {
  DEFAULT_HIT_EFFECTS,
  DEFAULT_LAYOUT,
  FreePlayfield,
  freeFieldRect,
  judgeLineY,
  Playfield,
  trackColumns,
  type HitEffects,
} from '../src';

// 120 BPM: 480 tick = 500 ms
const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0);
const W = 400;
const H = 800;
const SIZE = 128;

/** 스프라이트 이미지마다 다른 객체라 drawImage 호출로 어느 슬롯인지 안다 */
const P = { name: 'perfect' } as unknown as CanvasImageSource;
const N = { name: 'normal' } as unknown as CanvasImageSource;
/** 1프레임, 1fps → 1초 동안 보인다 */
const sprite = (image: CanvasImageSource) => ({ frames: [{ image, sx: 0, sy: 0, sw: 100, sh: 100 }], fps: 1 });
const effects: HitEffects = { ...DEFAULT_HIT_EFFECTS, size: SIZE, perfect: sprite(P), normal: sprite(N) };

/** 어떤 메서드든 받아 주는 가짜 2D 컨텍스트. drawImage만 기록한다 */
function fakeCtx() {
  const drawImage = vi.fn();
  const target: Record<string | symbol, unknown> = { drawImage };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : (t[k] = () => {})),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  });
  return { ctx, drawImage };
}

let now = 0;
let rafCallback: (() => void) | null = null;
let drawImage: ReturnType<typeof vi.fn>;
let canvas: HTMLCanvasElement;

/** 시각을 옮기고 한 프레임 그린다. 그 프레임의 drawImage 호출만 돌려준다 */
function frameAt(ms: number): unknown[][] {
  now = ms;
  drawImage.mockClear();
  const cb = rafCallback!;
  cb();
  return drawImage.mock.calls;
}

beforeEach(() => {
  now = 0;
  const fake = fakeCtx();
  drawImage = fake.drawImage;
  canvas = {
    clientWidth: W,
    clientHeight: H,
    width: 0,
    height: 0,
    style: {},
    getContext: () => fake.ctx,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as HTMLCanvasElement;
  vi.stubGlobal('window', { devicePixelRatio: 1, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    rafCallback = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

const laneChart = (notes: Note[]): Chart => ({ formatVersion: 1, name: 't', level: 1, tracks: basicTracks(4), notes });

function lanePlayfield(notes: Note[], autoplay: boolean, hitEffects: HitEffects = effects) {
  const pf = new Playfield(canvas, {
    chart: laneChart(notes),
    tm,
    getTimeMs: () => now,
    fromMs: 0,
    speed: 2,
    keymap: new Map(),
    autoplay,
    hitEffects,
  });
  pf.start();
  return pf;
}

describe('Playfield 타격 이펙트', () => {
  const cols = trackColumns(W, 4, DEFAULT_LAYOUT.laneWidth);
  const judgeY = judgeLineY(H, DEFAULT_LAYOUT);
  const at = (lane: number) => [cols[lane].x + cols[lane].width / 2 - SIZE / 2, judgeY - SIZE / 2, SIZE, SIZE];

  it('PERFECT로 친 노트는 그 레인 판정선 가운데에서 perfect 스프라이트', () => {
    lanePlayfield([{ tick: 480, track: 'Note_3', type: 'tap' }], true);
    expect(frameAt(400)).toEqual([]);
    expect(frameAt(500)).toEqual([[P, 0, 0, 100, 100, ...at(2)]]);
  });

  it('MISS는 터지지 않음', () => {
    lanePlayfield([{ tick: 480, track: 'Note_1', type: 'tap' }], false);
    frameAt(500);
    expect(frameAt(1000)).toEqual([]);
  });

  it('잡고 있는 롱노트는 150ms마다 다시 터지고 끝에서 한 번 더', () => {
    lanePlayfield([{ tick: 480, track: 'Note_2', type: 'hold', endTick: 960 }], true);
    expect(frameAt(500)).toHaveLength(1);
    expect(frameAt(600)).toHaveLength(1);
    expect(frameAt(650)).toHaveLength(2);
    expect(frameAt(800)).toHaveLength(3);
    // 끝(1000ms): 꼬리 판정 이펙트가 더해진다
    expect(frameAt(1000).length).toBeGreaterThan(frameAt(950).length);
  });

  it('setHitEffects로 끄면 바로 안 그림', () => {
    const pf = lanePlayfield([{ tick: 480, track: 'Note_1', type: 'tap' }], true);
    expect(frameAt(500)).toHaveLength(1);
    pf.setHitEffects({ ...effects, enabled: false });
    expect(frameAt(510)).toEqual([]);
  });

  it('옵션이 없으면 기본 이펙트 (스프라이트 없음)', () => {
    const pf = new Playfield(canvas, {
      chart: laneChart([{ tick: 480, track: 'Note_1', type: 'tap' }]),
      tm,
      getTimeMs: () => now,
      fromMs: 0,
      speed: 2,
      keymap: new Map(),
      autoplay: true,
    });
    pf.start();
    expect(frameAt(500)).toEqual([]);
  });
});

const freeChart = (notes: FreeNote[]): FreeChart => ({
  formatVersion: 1,
  layout: 'free',
  name: 't',
  level: 1,
  columns: 12,
  flickMode: 'any',
  notes,
});

function freePlayfield(notes: FreeNote[]) {
  const pf = new FreePlayfield(canvas, {
    chart: freeChart(notes),
    tm,
    getTimeMs: () => now,
    fromMs: 0,
    speed: 2,
    autoplay: true,
    hitEffects: effects,
  });
  pf.start();
  return pf;
}

describe('FreePlayfield 타격 이펙트', () => {
  const rect = freeFieldRect(W, H, 12, 'portrait');
  const judgeY = judgeLineY(H, DEFAULT_LAYOUT);
  const at = (col: number) => [rect.fieldX + col * rect.colPx - SIZE / 2, judgeY - SIZE / 2, SIZE, SIZE];

  it('탭은 노트 가로 가운데에서 터짐', () => {
    freePlayfield([{ tick: 480, type: 'tap', x: 4, width: 2 }]);
    frameAt(400);
    expect(frameAt(500)).toEqual([[P, 0, 0, 100, 100, ...at(5)]]);
  });

  it('잡고 있는 슬라이드는 지금 위치에서 150ms마다 다시 터짐', () => {
    freePlayfield([
      {
        type: 'slide',
        points: [
          { tick: 480, x: 0, width: 2 },
          { tick: 1440, x: 10, width: 2 },
        ],
      },
    ]);
    frameAt(400);
    expect(frameAt(500)).toEqual([[P, 0, 0, 100, 100, ...at(1)]]);
    const calls = frameAt(650);
    expect(calls).toHaveLength(2);
    // 650ms: 500→1500ms 동안 x 0→10으로 가므로 x = 1.5, 가운데 2.5칸
    expect(calls[1]).toEqual([P, 0, 0, 100, 100, ...at(2.5)]);
  });
});
