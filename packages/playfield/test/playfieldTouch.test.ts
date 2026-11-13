import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { basicTracks, DEFAULT_NOTE_COLOR, TimingMap, type Chart, type FreeChart, type FreeNote, type Note } from '@rcm/core';
import { DEFAULT_HIT_EFFECTS, DEFAULT_LAYOUT, DEFAULT_PLAYFIELD_COLORS, fitLaneWidth, FreePlayfield, freeFieldRect, judgeLineY, Playfield, trackColumns } from '../src';

// 120 BPM: 480 tick = 500 ms
const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0);
const H = 800;
const LANE_W = DEFAULT_LAYOUT.laneWidth;
const judgeY = judgeLineY(H, DEFAULT_LAYOUT);

type Handler = (e: unknown) => void;

/** 그린 fillRect 호출: 그때의 fillStyle·globalAlpha와 인자 */
interface Rect {
  style: unknown;
  alpha: unknown;
  x: number;
  y: number;
  w: number;
  h: number;
}
let rects: Rect[] = [];

/** drawImage 호출 (타격 이펙트 스프라이트) */
let images: unknown[][] = [];

/** fillText 호출: 글자와 y */
let texts: { text: string; y: number }[] = [];

/** 캔버스 높이 (테스트마다 H로 되돌린다) */
let canvasHeight = H;

/** arc 호출의 반지름 */
let arcRadii: number[] = [];

function fakeCtx() {
  const target: Record<string | symbol, unknown> = {};
  target.drawImage = (...args: unknown[]) => images.push(args);
  target.fillText = (text: string, _x: number, y: number) => texts.push({ text, y });
  target.arc = (_x: number, _y: number, r: number) => {
    if (r < 0) throw new RangeError('negative radius');
    arcRadii.push(r);
  };
  target.fillRect = (x: number, y: number, w: number, h: number) =>
    rects.push({ style: target.fillStyle, alpha: target.globalAlpha, x, y, w, h });
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
  rects = [];
  images = [];
  texts = [];
  rafCallback!();
}

/** 이번 프레임에서 눌린 레인 덧칠이 그려진 레인 칸 x들 */
const pressedLaneXs = () => rects.filter(r => r.style === DEFAULT_PLAYFIELD_COLORS.pressedLane).map(r => r.x);

beforeEach(() => {
  now = 0;
  width = 400;
  rects = [];
  images = [];
  texts = [];
  arcRadii = [];
  canvasHeight = H;
  handlers = new Map();
  const ctx = fakeCtx();
  canvas = {
    get clientWidth() {
      return width;
    },
    get clientHeight() {
      return canvasHeight;
    },
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
  extra: { lanes?: number; gimmickIndex?: number; autoplay?: boolean; judgeOffsetMs?: number; rate?: number } = {},
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
    rate: extra.rate,
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
    // 기믹 레인은 눌린 레인 덧칠도 없다 (touchable 가드가 없으면 눌림)
    frameAt(510);
    expect(pressedLaneXs()).toEqual([]);
  });

  it('일반 레인을 터치하면 그 레인이 눌린 레인으로 그려진다', () => {
    make([{ tick: 480, track: 'Note_2', type: 'tap' }]);
    frameAt(500);
    send('pointerdown', touch(1, centerX(1)));
    frameAt(510);
    expect(pressedLaneXs()).toEqual([cols4[1].x]);
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
    // 터치가 치면 400ms(100ms 일찍)에 판정이 나고 레인이 눌린다
    const c = pf.state.counts;
    expect(c.perfect + c.great + c.good + c.miss).toBe(0);
    frameAt(410);
    expect(pressedLaneXs()).toEqual([]);
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
    frameAt(600);
    send('pointerdown', touch(1, centerX(1)));
    expect(pf.state.counts.perfect).toBe(1);
  });

  it('rate 2: 판정 보정은 실제 시간이라 곡 시간으로 두 배 늦춘다', () => {
    const pf = make([{ tick: 480, track: 'Note_2', type: 'tap' }], { judgeOffsetMs: 100, rate: 2 });
    frameAt(700);
    send('pointerdown', touch(1, centerX(1)));
    expect(pf.state.counts.perfect).toBe(1);
  });

  it('MISS도 오프셋만큼 늦게 난다', () => {
    // 화면 시각 650: 오프셋 100이면 판정 시각 550(노트 500 + 120 안)이라 MISS가 아니고, 오프셋이 없으면 MISS
    const withOffset = make([{ tick: 480, track: 'Note_2', type: 'tap' }], { judgeOffsetMs: 100 });
    frameAt(650);
    expect(withOffset.state.counts.miss).toBe(0);
    const plain = make([{ tick: 480, track: 'Note_2', type: 'tap' }]);
    frameAt(650);
    expect(plain.state.counts.miss).toBe(1);
  });

  it('롱노트를 잡은 채 판정 끝(화면 끝+오프셋)까지 가도 몸통이 판정선 아래로 뒤집혀 그려지지 않는다', () => {
    const pf = make([{ tick: 480, track: 'Note_1', type: 'hold', endTick: 1440 }], { judgeOffsetMs: 100 });
    frameAt(600);
    send('pointerdown', touch(1, centerX(0)));
    expect(pf.state.counts.perfect).toBe(1);
    // 화면 1550(끝 1500 지남)은 판정 1450: 아직 잡고 있다
    frameAt(1550);
    expect(pf.state.heldNote(0)).toBe(0);
    const bodies = rects.filter(r => r.alpha === 0.6 && r.style === (basicTracks(4)[0].color ?? DEFAULT_NOTE_COLOR));
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) expect(b.h).toBeGreaterThanOrEqual(0);
  });

  it('음수 오프셋에서 성공으로 끝난 롱노트는 흐린 몸통으로 남지 않는다', () => {
    const pf = make([{ tick: 480, track: 'Note_1', type: 'hold', endTick: 1440 }], { judgeOffsetMs: -300 });
    frameAt(200);
    send('pointerdown', touch(1, centerX(0)));
    // 화면 1300은 판정 1600: 꼬리가 PERFECT로 끝났다
    frameAt(1300);
    expect(pf.state.counts.perfect).toBe(2);
    expect(rects.filter(r => r.style === (basicTracks(4)[0].color ?? DEFAULT_NOTE_COLOR) && r.alpha !== 1 && r.h > 0)).toEqual([]);
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

  function makeFree(judgeOffsetMs: number, rate?: number) {
    const pf = new FreePlayfield(canvas, {
      chart: freeChart([{ tick: 480, type: 'tap', x: 4, width: 2 }]),
      tm,
      getTimeMs: () => now,
      fromMs: 0,
      speed: 2,
      judgeOffsetMs,
      rate,
    });
    pf.start();
    frameAt(0);
    return pf;
  }
  const tapAt = (pointerId: number) =>
    send('pointerdown', touch(pointerId, rect.fieldX + 5 * rect.colPx, judgeY));

  it('오프셋만큼 늦게 친 입력은 PERFECT', () => {
    const pf = makeFree(100);
    frameAt(600);
    tapAt(1);
    expect(pf.state.counts.perfect).toBe(1);
  });

  it('rate 2: 판정 보정은 실제 시간이라 곡 시간으로 두 배 늦춘다', () => {
    const pf = makeFree(100, 2);
    frameAt(700);
    tapAt(1);
    expect(pf.state.counts.perfect).toBe(1);
  });

  it('MISS도 오프셋만큼 늦게 난다', () => {
    const withOffset = makeFree(100);
    frameAt(650);
    expect(withOffset.state.counts.miss).toBe(0);
    const plain = makeFree(0);
    frameAt(650);
    expect(plain.state.counts.miss).toBe(1);
  });

  it('오프셋이 없으면 늦게 친 입력은 PERFECT가 아니다', () => {
    const pf = makeFree(0);
    frameAt(600);
    tapAt(1);
    expect(pf.state.counts.perfect).toBe(0);
  });

  it('잡고 있는 슬라이드의 반복 이펙트는 화면에 그려진 슬라이드 위치를 따른다', () => {
    const SIZE = 128;
    const P = { name: 'perfect' } as unknown as CanvasImageSource;
    const hitEffects = {
      ...DEFAULT_HIT_EFFECTS,
      size: SIZE,
      perfect: { frames: [{ image: P, sx: 0, sy: 0, sw: 100, sh: 100 }], fps: 1 },
    };
    const pf = new FreePlayfield(canvas, {
      chart: freeChart([
        {
          type: 'slide',
          points: [
            { tick: 480, x: 0, width: 2 },
            { tick: 1440, x: 10, width: 2 },
          ],
        },
      ]),
      tm,
      getTimeMs: () => now,
      fromMs: 0,
      speed: 2,
      judgeOffsetMs: 100,
      hitEffects,
    });
    pf.start();
    frameAt(0);
    frameAt(600);
    send('pointerdown', touch(1, rect.fieldX + 1 * rect.colPx, judgeY));
    frameAt(600);
    expect(pf.state.isHeld(0)).toBe(true);
    // 600에서 터진 머리 이펙트는 판정 시각 500의 경로 위치(가운데 1칸)
    expect(images[0]).toEqual([P, 0, 0, 100, 100, rect.fieldX + 1 * rect.colPx - SIZE / 2, judgeY - SIZE / 2, SIZE, SIZE]);
    // 750: 화면에 그려진 슬라이드는 (750-500)/1000*10 = 2.5칸에 있다 (가운데 3.5칸)
    frameAt(750);
    expect(images).toHaveLength(2);
    expect(images[1]).toEqual([P, 0, 0, 100, 100, rect.fieldX + 3.5 * rect.colPx - SIZE / 2, judgeY - SIZE / 2, SIZE, SIZE]);
  });
});

describe('짧은 화면의 콤보·판정 글자', () => {
  it('높이 340에서도 콤보·판정·타이밍 글자가 화면 안에서 순서대로 나온다', () => {
    canvasHeight = 340;
    const pf = make([{ tick: 480, track: 'Note_2', type: 'tap' }]);
    frameAt(500);
    send('pointerdown', touch(1, centerX(1), judgeLineY(340, DEFAULT_LAYOUT)));
    expect(pf.state.counts.perfect).toBe(1);
    frameAt(510);
    const y = (t: string) => texts.find(x => x.text === t)!.y;
    const ys = [y('1'), y('COMBO'), y('PERFECT')];
    for (const v of ys) expect(v).toBeGreaterThanOrEqual(0);
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    expect(y('PERFECT')).toBeLessThan(340);
  });

  it('충분히 큰 화면에서는 예전 위치 그대로', () => {
    const pf = make([{ tick: 480, track: 'Note_2', type: 'tap' }]);
    frameAt(500);
    send('pointerdown', touch(1, centerX(1)));
    frameAt(510);
    expect(pf.state.counts.perfect).toBe(1);
    const y = (t: string) => texts.find(x => x.text === t)!.y;
    expect(y('1')).toBe(judgeY - 250);
    expect(y('COMBO')).toBe(judgeY - 222);
    expect(y('PERFECT')).toBe(judgeY - 180);
  });
});

describe('자동 플레이와 판정 오프셋', () => {
  it('Playfield: 자동 플레이는 화면 시계로 노트 시각에 친다', () => {
    const pf = make([{ tick: 480, track: 'Note_2', type: 'tap' }], { autoplay: true, judgeOffsetMs: 200 });
    frameAt(490);
    expect(pf.state.counts.perfect).toBe(0);
    frameAt(500);
    expect(pf.state.counts.perfect).toBe(1);
  });

  it('FreePlayfield: 자동 플레이는 화면 시계로 노트 시각에 친다', () => {
    const pf = new FreePlayfield(canvas, {
      chart: { formatVersion: 1, layout: 'free', name: 't', level: 1, columns: 12, flickMode: 'any', notes: [{ tick: 480, type: 'tap', x: 4, width: 2 }] },
      tm,
      getTimeMs: () => now,
      fromMs: 0,
      speed: 2,
      autoplay: true,
      judgeOffsetMs: 200,
    });
    pf.start();
    frameAt(0);
    frameAt(490);
    expect(pf.state.counts.perfect).toBe(0);
    frameAt(500);
    expect(pf.state.counts.perfect).toBe(1);
  });
});

describe('아주 좁은 레인', () => {
  it('동그라미 노트의 반지름이 음수가 되어 그리기가 멈추지 않는다', () => {
    width = 20;
    const pf = new Playfield(canvas, {
      chart: makeChart([{ tick: 480, track: 'Note_1', type: 'tap' }], 7),
      tm,
      getTimeMs: () => now,
      fromMs: 0,
      speed: 2,
      keymap: new Map(),
      layout: { ...DEFAULT_LAYOUT, noteShape: 'circle' },
    });
    pf.start();
    expect(() => frameAt(400)).not.toThrow();
    expect(arcRadii.length).toBeGreaterThan(0);
    expect(arcRadii.every(r => r >= 0)).toBe(true);
  });
});
