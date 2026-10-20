import { describe, expect, it } from 'vitest';
import { TimingMap, type FlickMode, type FreeChart, type FreeNote } from '@rcm/core';
import { flickMatches, freeGimmickNotes, FreePlayState } from '../src';

// 120 BPM: 480 tick = 500 ms
const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0);
const chart = (notes: FreeNote[], flickMode: FlickMode = 'directional'): FreeChart => ({
  formatVersion: 1,
  layout: 'free',
  name: 't',
  level: 1,
  columns: 12,
  flickMode,
  notes,
});
const judgements = (events: { judgement: string; part: string }[]) => events.map(e => `${e.part}:${e.judgement}`);

describe('flickMatches', () => {
  it('정한 방향 ±45°만 맞다', () => {
    expect(flickMatches(0, -1, 'up')).toBe(true);
    expect(flickMatches(1, -1, 'up')).toBe(true);
    expect(flickMatches(1, 0, 'up')).toBe(false);
    expect(flickMatches(-1, -1, 'upLeft')).toBe(true);
    expect(flickMatches(-1, 0.1, 'left')).toBe(true);
    expect(flickMatches(1, 1, 'left')).toBe(false);
    expect(flickMatches(0, 1, undefined)).toBe(true);
  });
});

describe('FreePlayState', () => {
  it('탭: 구간 안을 누르면 시각 차로 판정, 밖이면 무시', () => {
    const s = new FreePlayState(chart([{ tick: 480, type: 'tap', x: 4, width: 3 }]), tm, 0);
    expect(s.down(1, 0, 0, 500)).toEqual([]);
    s.up(1, 520);
    const e = s.down(2, 5, 0, 560);
    expect(judgements(e)).toEqual(['head:great']);
    expect(e[0].timing).toBe('late');
  });

  it('탭: 양옆 0.5칸까지는 친 것으로 본다', () => {
    const s = new FreePlayState(chart([{ tick: 480, type: 'tap', x: 4, width: 3 }]), tm, 0);
    expect(judgements(s.down(1, 3.6, 0, 500))).toEqual(['head:perfect']);
  });

  it('여러 손가락으로 같은 시각의 노트를 각각 친다', () => {
    const s = new FreePlayState(
      chart([
        { tick: 480, type: 'tap', x: 0, width: 3 },
        { tick: 480, type: 'tap', x: 8, width: 3 },
      ]),
      tm,
      0,
    );
    expect(judgements(s.down(1, 1, 0, 500))).toEqual(['head:perfect']);
    expect(judgements(s.down(2, 9, 0, 505))).toEqual(['head:perfect']);
    expect(s.combo).toBe(2);
  });

  it('놓친 노트는 update에서 MISS', () => {
    const s = new FreePlayState(chart([{ tick: 480, type: 'tap', x: 0, width: 3 }]), tm, 0);
    expect(s.update(620)).toEqual([]);
    expect(judgements(s.update(621))).toEqual(['head:miss']);
  });

  it('플릭: 누른 뒤 맞는 방향으로 튕기면 누른 시각으로 판정', () => {
    const s = new FreePlayState(chart([{ tick: 480, type: 'flick', x: 4, width: 3, direction: 'up' }]), tm, 0);
    expect(s.down(1, 5, 5, 500)).toEqual([]);
    expect(s.move(1, 5, 4.6, 520)).toEqual([]);
    expect(judgements(s.move(1, 5, 4, 540))).toEqual(['head:perfect']);
  });

  it('플릭: 틀린 방향이나 튕기지 않고 떼면 MISS', () => {
    const s = new FreePlayState(
      chart([
        { tick: 480, type: 'flick', x: 0, width: 3, direction: 'left' },
        { tick: 960, type: 'flick', x: 0, width: 3, direction: 'left' },
      ]),
      tm,
      0,
    );
    s.down(1, 1, 5, 500);
    expect(judgements(s.move(1, 2, 5, 510))).toEqual(['head:miss']);
    s.up(1, 520);
    s.down(2, 1, 5, 1000);
    expect(judgements(s.up(2, 1010))).toEqual(['head:miss']);
  });

  it('플릭: 방향 무관이면 어느 쪽이든 맞다', () => {
    const s = new FreePlayState(chart([{ tick: 480, type: 'flick', x: 0, width: 3 }], 'any'), tm, 0);
    s.down(1, 1, 5, 500);
    expect(judgements(s.move(1, 1, 6, 510))).toEqual(['head:perfect']);
  });

  it('플릭: 누르고 기다리기만 하면 창이 지난 뒤 MISS', () => {
    const s = new FreePlayState(chart([{ tick: 480, type: 'flick', x: 0, width: 3, direction: 'up' }]), tm, 0);
    s.down(1, 1, 5, 500);
    expect(s.update(600)).toEqual([]);
    expect(judgements(s.update(700))).toEqual(['head:miss']);
  });

  it('트레이스: 미리 올려 둔 손가락은 시각이 되면 PERFECT, 늦게 닿으면 늦은 만큼', () => {
    const s = new FreePlayState(
      chart([
        { tick: 480, type: 'trace', x: 0, width: 3 },
        { tick: 960, type: 'trace', x: 6, width: 3 },
      ]),
      tm,
      0,
    );
    expect(s.down(1, 1, 0, 300)).toEqual([]);
    expect(judgements(s.update(470))).toEqual(['head:perfect']);
    expect(judgements(s.move(1, 7, 0, 1100))).toEqual(['head:good']);
  });

  it('슬라이드: 경로를 따라가면 중간 지점과 끝이 PERFECT, 숨은 지점은 판정 없음', () => {
    const s = new FreePlayState(
      chart([
        {
          type: 'slide',
          points: [
            { tick: 480, x: 0, width: 2 },
            { tick: 960, x: 4, width: 2 },
            { tick: 1440, x: 8, width: 2, hidden: true },
            { tick: 1920, x: 8, width: 2 },
          ],
        },
      ]),
      tm,
      0,
    );
    expect(judgements(s.down(1, 1, 0, 500))).toEqual(['head:perfect']);
    s.move(1, 5, 0, 1000);
    expect(judgements(s.update(1000))).toEqual(['tick:perfect']);
    s.move(1, 9, 0, 1500);
    expect(s.update(1500)).toEqual([]);
    expect(judgements(s.update(2000))).toEqual(['tail:perfect']);
    expect(s.counts.perfect).toBe(3);
  });

  it('슬라이드: 일찍 떼면 남은 지점과 끝이 MISS', () => {
    const s = new FreePlayState(
      chart([
        {
          type: 'slide',
          points: [
            { tick: 480, x: 0, width: 2 },
            { tick: 960, x: 0, width: 2 },
            { tick: 1440, x: 0, width: 2 },
          ],
        },
      ]),
      tm,
      0,
    );
    s.down(1, 1, 0, 500);
    expect(judgements(s.up(1, 700))).toEqual(['tick:miss', 'tail:miss']);
    expect(s.combo).toBe(0);
  });

  it('슬라이드: 경로에서 오래 벗어나면 끊긴다', () => {
    const s = new FreePlayState(
      chart([{ type: 'slide', points: [{ tick: 480, x: 0, width: 2 }, { tick: 1920, x: 0, width: 2 }] }]),
      tm,
      0,
    );
    s.down(1, 1, 0, 500);
    s.move(1, 10, 0, 600);
    expect(s.update(600)).toEqual([]);
    expect(judgements(s.update(800))).toEqual(['tail:miss']);
  });

  it('슬라이드 끝 플릭: 끝 무렵 튕겨야 끝 판정', () => {
    const s = new FreePlayState(
      chart([
        {
          type: 'slide',
          points: [{ tick: 480, x: 0, width: 2 }, { tick: 960, x: 0, width: 2 }],
          endFlick: true,
          direction: 'up',
        },
      ]),
      tm,
      0,
    );
    s.down(1, 1, 5, 500);
    expect(s.update(1000)).toEqual([]);
    expect(judgements(s.move(1, 1, 4, 1010))).toEqual(['tail:perfect']);
  });

  it('슬라이드 머리를 놓치면 끝까지 MISS', () => {
    const s = new FreePlayState(
      chart([{ type: 'slide', points: [{ tick: 480, x: 0, width: 2 }, { tick: 960, x: 0, width: 2 }] }]),
      tm,
      0,
    );
    expect(judgements(s.update(700))).toEqual(['head:miss', 'tail:miss']);
  });

  it('자동 플레이는 모두 PERFECT', () => {
    const s = new FreePlayState(
      chart([
        { tick: 480, type: 'flick', x: 0, width: 2, direction: 'up' },
        {
          type: 'slide',
          points: [{ tick: 960, x: 0, width: 2 }, { tick: 1440, x: 4, width: 2 }, { tick: 1920, x: 4, width: 2 }],
        },
      ]),
      tm,
      0,
    );
    s.autoStep(1200);
    expect(s.autoHolding(1)).toBe(true);
    s.autoStep(3000);
    expect(s.counts).toEqual({ perfect: 4, great: 0, good: 0, miss: 0 });
    expect(s.update(3000)).toEqual([]);
  });

  it('시작 위치 이전 노트는 뺀다', () => {
    const s = new FreePlayState(
      chart([
        { tick: 0, type: 'tap', x: 0, width: 2 },
        { tick: 960, type: 'tap', x: 0, width: 2 },
      ]),
      tm,
      500,
    );
    expect(s.notes).toHaveLength(1);
  });
});

describe('자유형 기믹 노트', () => {
  const withGimmicks = (notes: FreeNote[]): FreeChart => ({
    ...chart(notes),
    gimmicks: [{ name: '폭탄', color: '#ef4444' }],
  });
  const notes: FreeNote[] = [
    { tick: 480, type: 'gimmick', gimmick: '폭탄', x: 0, width: 3 },
    { tick: 960, type: 'tap', x: 4, width: 3 },
    { tick: 0, type: 'gimmick', gimmick: '폭탄', x: 6, width: 2 },
  ];

  it('판정 대상이 아니다', () => {
    const s = new FreePlayState(withGimmicks(notes), tm, 0);
    expect(s.notes.map(n => n.kind)).toEqual(['tap']);
    expect(s.down(1, 1, 0, 500)).toEqual([]);
  });

  it('freeGimmickNotes는 종류의 색을 붙여 시각 순으로 돌려준다 (fromMs 이전은 뺀다)', () => {
    expect(freeGimmickNotes(withGimmicks(notes), tm, 0)).toEqual([
      { startMs: 0, x: 6, width: 2, color: '#ef4444' },
      { startMs: 500, x: 0, width: 3, color: '#ef4444' },
    ]);
    expect(freeGimmickNotes(withGimmicks(notes), tm, 100)).toEqual([{ startMs: 500, x: 0, width: 3, color: '#ef4444' }]);
  });

  it('기믹 슬라이드는 판정하지 않고, 경로와 끝 시각을 붙여 그린다', () => {
    const laser: FreeNote = {
      type: 'slide',
      gimmick: '폭탄',
      points: [
        { tick: 480, x: 0, width: 3 },
        { tick: 1440, x: 6, width: 2 },
      ],
    };
    const s = new FreePlayState(withGimmicks([laser]), tm, 0);
    expect(s.notes).toEqual([]);
    expect(freeGimmickNotes(withGimmicks([laser]), tm, 0)).toEqual([
      { startMs: 500, endMs: 1500, points: laser.type === 'slide' ? laser.points : [], pointMs: [500, 1500], x: 0, width: 3, color: '#ef4444' },
    ]);
  });
});
