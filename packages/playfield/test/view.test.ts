import { describe, expect, it } from 'vitest';
import { ScrollMap, TICKS_PER_BEAT, TimingMap } from '@rcm/core';
import {
  clampSpeed,
  DEFAULT_LAYOUT,
  DEFAULT_SPEED,
  holdBodyWidth,
  judgeLineY,
  keyLabelsVisible,
  noteHalfExtent,
  DJMAX_TRAVEL_MS_AT_1X,
  MAX_SPEED,
  MIN_SPEED,
  SPEED_STEP,
  firstAtOrAbove,
  fitScale,
  FIT_SIDE_MARGIN,
  notePositions,
  noteY,
  pxPerMsForSpeed,
  trackColumns,
  visibleScrollRange,
} from '../src';

describe('playfield view', () => {
  it('낙하 시간: 판정선 높이와 상관없이 디맥과 같게 2692.857 / 배속 ms', () => {
    for (const judgeY of [500, 960]) {
      expect(judgeY / pxPerMsForSpeed(1, judgeY)).toBeCloseTo(2692.857, 2);
      expect(judgeY / pxPerMsForSpeed(4, judgeY)).toBeCloseTo(673.214, 2);
    }
    expect(DJMAX_TRAVEL_MS_AT_1X).toBeCloseTo((754 / 280) * 1000, 6);
  });
  it('판정선이 화면 위에 걸려도 px/ms는 양수', () => {
    expect(pxPerMsForSpeed(4, 0)).toBeGreaterThan(0);
    expect(pxPerMsForSpeed(4, -50)).toBeGreaterThan(0);
  });
  it('배속은 1.0~9.0, 0.1 단위로 반올림', () => {
    expect([MIN_SPEED, MAX_SPEED, DEFAULT_SPEED, SPEED_STEP]).toEqual([1, 9, 4, 0.1]);
    expect(clampSpeed(0.5)).toBe(1);
    expect(clampSpeed(9.5)).toBe(9);
    expect(clampSpeed(5.5)).toBe(5.5);
    expect(clampSpeed(0.1 + 0.2 + 4)).toBe(4.3);
    expect(clampSpeed(4.04)).toBe(4);
    expect(clampSpeed(NaN)).toBe(DEFAULT_SPEED);
  });
  it('트랙 열: 모두 같은 너비, 가운데 정렬', () => {
    const cols = trackColumns(400, 3, 64);
    expect(cols.map(c => c.width)).toEqual([64, 64, 64]);
    expect(cols[0].x).toBe(104);
    expect(cols[1].x).toBe(168);
  });
  it('holdBodyWidth: 레인 너비의 0.69', () => {
    expect([64, 30, 200].map(holdBodyWidth)).toEqual([44, 21, 138]);
  });
  it('noteHalfExtent: 바는 두께 절반, 동그라미는 반지름', () => {
    expect(noteHalfExtent(DEFAULT_LAYOUT)).toBe(7);
    expect(noteHalfExtent({ ...DEFAULT_LAYOUT, noteShape: 'circle' })).toBe(29);
  });
  it('최소 레인에서도 양수 크기', () => {
    expect(noteHalfExtent({ ...DEFAULT_LAYOUT, laneWidth: 30, noteShape: 'circle' })).toBe(12);
    expect(holdBodyWidth(30)).toBeGreaterThan(0);
  });
  it('keyLabelsVisible', () => {
    expect([120, 48, 47, 0].map(v => keyLabelsVisible({ ...DEFAULT_LAYOUT, judgeLineFromBottom: v }))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
  it('BPM이 달라도 같은 배속이면 낙하 시간이 같다 (132 / 140 BPM, 6.5배속)', () => {
    const judgeY = 680;
    const pxPerMs = pxPerMsForSpeed(6.5, judgeY);
    const travel = DJMAX_TRAVEL_MS_AT_1X / 6.5;
    for (const [bpm, offsetMs] of [[132, 90], [140, 0]]) {
      const tm = new TimingMap([{ tick: 0, bpm }], offsetMs);
      const scroll = new ScrollMap(undefined, tm);
      // 16마디째 노트
      const noteMs = tm.tickToMs(16 * 4 * TICKS_PER_BEAT);
      const notePos = scroll.positionAt(noteMs);
      const yAt = (ms: number) => noteY(notePos, scroll.positionAt(ms), judgeY, pxPerMs);
      expect(yAt(noteMs - travel)).toBeCloseTo(0, 6);
      expect(yAt(noteMs)).toBeCloseTo(judgeY, 6);
    }
  });
  it('fitScale: 화면 높이 전체와 모든 레인이 작은 캔버스에 들어간다', () => {
    // 300×480 미리보기, 실제 화면 높이 764
    const s1 = fitScale(300, 480, 764, 4, 64);
    expect(s1).toBeCloseTo(480 / 764, 9);
    // 레인이 넓으면 너비 기준으로 더 줄인다
    const s2 = fitScale(300, 480, 764, 4, 200);
    expect(s2).toBeCloseTo(300 / (800 + FIT_SIDE_MARGIN * 2), 9);
    for (const [lanes, laneWidth] of [[4, 64], [4, 200], [8, 200]]) {
      const s = fitScale(300, 480, 764, lanes, laneWidth);
      expect(300 / s).toBeGreaterThanOrEqual(lanes * laneWidth + FIT_SIDE_MARGIN * 2 - 1e-9);
      expect(480 / s).toBeGreaterThanOrEqual(764 - 1e-9);
      // 판정선을 최대(400)로 올려도 축소 전 화면 안에 있다
      expect(judgeLineY(480 / s, { ...DEFAULT_LAYOUT, judgeLineFromBottom: 400 })).toBeGreaterThan(0);
    }
    // 캔버스가 더 크면 키우지 않는다, 크기가 0이어도 1
    expect(fitScale(2000, 2000, 764, 4, 64)).toBe(1);
    expect(fitScale(0, 0, 764, 4, 64)).toBe(1);
  });
  it('판정선을 옮겨도 낙하 시간 유지', () => {
    for (const judgeLineFromBottom of [0, 400]) {
      const judgeY = judgeLineY(800, { ...DEFAULT_LAYOUT, judgeLineFromBottom });
      expect(judgeY).toBe(800 - judgeLineFromBottom);
      expect(judgeY / pxPerMsForSpeed(4, judgeY)).toBeCloseTo(673.214, 2);
    }
  });
  it('노트 y: 판정선에서 남은 스크롤 위치 × px/ms 만큼 위', () => {
    expect(noteY(1000, 800, 500, 0.5)).toBe(400);
    expect(noteY(800, 800, 500, 0.5)).toBe(500);
    expect(noteY(700, 800, 500, 0.5)).toBe(550);
  });
  it('스크롤 위치 단위의 화면 범위', () => {
    expect(visibleScrollRange(1000, 800, 680, 0.5)).toEqual({ fromPos: 760, toPos: 2360 });
  });
  it('firstAtOrAbove: 정지 구간처럼 같은 값이 이어져도 첫 것', () => {
    expect(firstAtOrAbove([0, 500, 1000, 1000, 1000, 1500], 1000)).toBe(2);
    expect(firstAtOrAbove([0, 500], 600)).toBe(2);
    expect(firstAtOrAbove([0, 500], -5)).toBe(0);
    expect(firstAtOrAbove([], 0)).toBe(0);
  });
  it('notePositions: ×0 정지 구간과 그 구간을 걸치는 롱노트', () => {
    // 120 BPM: 1000ms~2000ms 정지, 그 뒤 ×1
    const tm = new TimingMap([{ tick: 0, bpm: 120 }], 0);
    const scroll = new ScrollMap([{ tick: 960, speed: 0 }, { tick: 1920, speed: 1 }], tm);
    const notes = [
      { startMs: 500 },
      { startMs: 800, endMs: 2500 },
      { startMs: 1200 },
      { startMs: 1500 },
      { startMs: 3000 },
    ];
    const { startPos, endPos, maxHoldSpanPos } = notePositions(notes, scroll);
    expect(startPos).toEqual([500, 800, 1000, 1000, 2000].map(v => expect.closeTo(v)));
    expect(endPos).toEqual([500, 1500, 1000, 1000, 2000].map(v => expect.closeTo(v)));
    expect(maxHoldSpanPos).toBeCloseTo(700);
    for (let i = 1; i < startPos.length; i++) expect(startPos[i]).toBeGreaterThanOrEqual(startPos[i - 1]);
    startPos.forEach((s, i) => expect(endPos[i]).toBeGreaterThanOrEqual(s));
  });
});
