import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { basicTracks, TimingMap, type Chart, type FreeChart, type FreeNote, type Note } from '@rcm/core';
import { DEFAULT_LAYOUT, fitLaneWidth, FreePlayfield, freeFieldRect, judgeLineY, Playfield, trackColumns } from '../src';

// 120 BPM: 480 tick = 500 ms
const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0);
const H = 800;
const LANE_W = DEFAULT_LAYOUT.laneWidth;
const judgeY = judgeLineY(H, DEFAULT_LAYOUT);

type Handler = (e: unknown) => void;

function fakeCtx() {
  const target: Record<string | symbol, unknown> = {};
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : (t[k] = () => {})),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  });
}

let now = 0;
let rafCallback: (() => void) | null = null;
let canvas: HTMLCanvasElement;
let handlers: Map<string, Handler>;
let width = 400;

function frameAt(ms: number): void {
  now = ms;
  rafCallback!();
}

beforeEach(() => {
  now = 0;
  width = 400;
  handlers = new Map();
  const ctx = fakeCtx();
  canvas = {
    get clientWidth() {
      return width;
    },
    clientHeight: H,
    width: 0,
    height: 0,
    style: {},
    getContext: () => ctx,
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture: () => {},
  } as unknown as HTMLCanvasElement;
  vi.stubGlobal('window', { devicePixelRatio: 1, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    rafCallback = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

function makeChart(notes: Note[], lanes = 4, gimmickIndex?: number): Chart {
  const tracks = basicTracks(lanes);
  if (gimmickIndex !== undefined) tracks[gimmickIndex] = { ...tracks[gimmickIndex], kind: 'gimmick' };
  return { formatVersion: 1, name: 't', level: 1, tracks, notes };
}

function make(
  notes: Note[],
  extra: { lanes?: number; gimmickIndex?: number; autoplay?: boolean; judgeOffsetMs?: number } = {},
) {
  const pf = new Playfield(canvas, {
    chart: makeChart(notes, extra.lanes, extra.gimmickIndex),
    tm,
    getTimeMs: () => now,
    fromMs: 0,
    speed: 2,
    keymap: new Map(),
    autoplay: extra.autoplay,
    judgeOffsetMs: extra.judgeOffsetMs,
  });
  pf.start();
  frameAt(0);
  return pf;
}

interface Touch {
  pointerId: number;
  pointerType: string;
  button: number;
  clientX: number;
  clientY: number;
  preventDefault: () => void;
}
const touch = (pointerId: number, clientX: number, clientY = judgeY, pointerType = 'touch'): Touch => ({
  pointerId,
  pointerType,
  button: 0,
  clientX,
  clientY,
  preventDefault: () => {},
});
const send = (type: string, e: Touch) => handlers.get(type)?.(e);

const cols4 = trackColumns(400, 4, LANE_W);
const centerX = (lane: number) => cols4[lane].x + LANE_W / 2;

describe('Playfield 터치 입력', () => {
  it('판정선을 손가락으로 치면 그 레인 노트가 PERFECT', () => {
    const pf = make([{ tick: 480, track: 'Note_2', type: 'tap' }]);
    frameAt(500);
    send('pointerdown', touch(1, centerX(1)));
    expect(pf.state.counts.perfect).toBe(1);
  });

  it('마우스 클릭은 치지 않는다', () => {
    const pf = make([{ tick: 480, track: 'Note_2', type: 'tap' }]);
    frameAt(500);
    send('pointerdown', touch(1, centerX(1), judgeY, 'mouse'));
    expect(pf.state.counts.perfect).toBe(0);
  });

  it('기믹 트랙 레인은 치지 않는다', () => {
    const pf = make([{ tick: 480, track: 'Note_2', type: 'tap' }], { gimmickIndex: 1 });
    frameAt(500);
    send('pointerdown', touch(1, centerX(1)));
    expect(pf.state.counts.perfect).toBe(0);
  });

  it('같은 레인의 두 손가락 중 하나를 떼도 레인은 눌려 있다', () => {
    const pf = make([{ tick: 480, track: 'Note_1', type: 'hold', endTick: 1440 }]);
    frameAt(500);
    send('pointerdown', touch(1, centerX(0)));
    send('pointerdown', touch(2, centerX(0)));
    frameAt(800);
    send('pointerup', touch(1, centerX(0)));
    frameAt(1500);
    expect(pf.state.counts.miss).toBe(0);
  });

  it('옆 레인으로 미끄러지면 원래 레인 롱노트를 뗀다', () => {
    const pf = make([
      { tick: 480, track: 'Note_1', type: 'hold', endTick: 1440 },
      { tick: 768, track: 'Note_2', type: 'tap' },
    ]);
    frameAt(500);
    send('pointerdown', touch(1, centerX(0)));
    frameAt(800);
    send('pointermove', touch(1, centerX(1)));
    // 원래 레인을 일찍 뗐으므로 롱노트 꼬리는 MISS
    expect(pf.state.counts.miss).toBe(1);
    // 새 레인은 눌렸다: 800ms에 있던 그 레인 노트가 PERFECT (머리 + 탭)
    expect(pf.state.counts.perfect).toBe(2);
  });

  it('pointerup을 놓친 같은 손가락이 다시 누르면 먼저 뗀 것으로 처리한다', () => {
    const pf = make([
      { tick: 480, track: 'Note_1', type: 'hold', endTick: 1440 },
      { tick: 1920, track: 'Note_1', type: 'tap' },
    ]);
    frameAt(500);
    send('pointerdown', touch(1, centerX(0)));
    frameAt(800);
    // pointerup 없이 같은 id로 다시 누름: 롱노트가 일찍 떼진다
    send('pointerdown', touch(1, centerX(0)));
    expect(pf.state.counts.miss).toBe(1);
    // 레인이 눌린 채 갇히지 않아 이어서 뗀 뒤 다시 칠 수 있다
    send('pointerup', touch(1, centerX(0)));
    frameAt(2000);
    send('pointerdown', touch(1, centerX(0)));
    expect(pf.state.counts.perfect).toBe(2);
  });

  it('자동 플레이 중에는 터치를 무시한다', () => {
    const pf = make([{ tick: 480, track: 'Note_2', type: 'tap' }], { autoplay: true });
    frameAt(400);
    send('pointerdown', touch(1, centerX(1)));
    expect(pf.state.counts.perfect).toBe(0);
  });

  it('input: false면 포인터 리스너를 달지 않는다', () => {
    const pf = new Playfield(canvas, {
      chart: makeChart([]),
      tm,
      getTimeMs: () => now,
      fromMs: 0,
      speed: 2,
      keymap: new Map(),
      input: false,
    });
    pf.start();
    expect(handlers.size).toBe(0);
  });

  it('stop하면 포인터 리스너를 뗀다', () => {
    const pf = make([]);
    expect(handlers.has('pointerdown')).toBe(true);
    pf.stop();
    expect(handlers.size).toBe(0);
  });

  it('오프셋만큼 늦게 친 입력은 PERFECT', () => {
    const pf = make([{ tick: 480, track: 'Note_2', type: 'tap' }], { judgeOffsetMs: 100 });
    // 화면 시각 580은 판정 시각 480: 아직 MISS가 아니다
    frameAt(580);
    expect(pf.state.counts.miss).toBe(0);
    frameAt(600);
    send('pointerdown', touch(1, centerX(1)));
    expect(pf.state.counts.perfect).toBe(1);
  });

  it('레인이 화면보다 넓으면 바깥 레인도 칠 수 있다', () => {
    width = 360;
    const pf = make([{ tick: 480, track: 'Note_7', type: 'tap' }], { lanes: 7 });
    const w = fitLaneWidth(360, 7, LANE_W);
    expect(w).toBeLessThan(LANE_W);
    const cols = trackColumns(360, 7, w);
    frameAt(500);
    send('pointerdown', touch(1, cols[6].x + w / 2));
    expect(pf.state.counts.perfect).toBe(1);
  });
});

describe('FreePlayfield 판정 오프셋', () => {
  const rect = freeFieldRect(400, H, 12, 'portrait');
  const freeChart = (notes: FreeNote[]): FreeChart => ({
    formatVersion: 1,
    layout: 'free',
    name: 't',
    level: 1,
    columns: 12,
    flickMode: 'any',
    notes,
  });

  function makeFree(judgeOffsetMs: number) {
    const pf = new FreePlayfield(canvas, {
      chart: freeChart([{ tick: 480, type: 'tap', x: 4, width: 2 }]),
      tm,
      getTimeMs: () => now,
      fromMs: 0,
      speed: 2,
      judgeOffsetMs,
    });
    pf.start();
    frameAt(0);
    return pf;
  }
  const tapAt = (pointerId: number) =>
    send('pointerdown', touch(pointerId, rect.fieldX + 5 * rect.colPx, judgeY));

  it('오프셋만큼 늦게 친 입력은 PERFECT', () => {
    const pf = makeFree(100);
    frameAt(580);
    expect(pf.state.counts.miss).toBe(0);
    frameAt(600);
    tapAt(1);
    expect(pf.state.counts.perfect).toBe(1);
  });

  it('오프셋이 없으면 늦게 친 입력은 PERFECT가 아니다', () => {
    const pf = makeFree(0);
    frameAt(600);
    tapAt(1);
    expect(pf.state.counts.perfect).toBe(0);
  });
});
