import { describe, expect, it } from 'vitest';
import {
  easeProgress,
  freeNoteErrors,
  freeNoteKey,
  isFreeChart,
  freeGimmickOf,
  lastNoteEndTick,
  slideSpanAt,
  parseAnyChart,
  parseChart,
  parseFreeChart,
  serializeFreeChart,
  type ParseResult,
} from '../src';

const freeText = (notes: unknown[], extra = {}) =>
  JSON.stringify({ formatVersion: 1, layout: 'free', name: 'MASTER', level: 30, columns: 12, flickMode: 'directional', notes, ...extra });
const errorsOf = (r: ParseResult<unknown>) => (r.ok ? [] : r.errors);
const slide = (points: unknown[], extra = {}) => ({ type: 'slide', points, ...extra });

const sample = [
  { tick: 0, type: 'tap', x: 0, width: 3 },
  { tick: 480, type: 'trace', x: 4.5, width: 2 },
  { tick: 960, type: 'flick', x: 6, width: 3, direction: 'upLeft' },
  slide(
    [
      { tick: 1440, x: 0, width: 3, ease: 'easeOut' },
      { tick: 1920, x: 4, width: 3, hidden: true },
      { tick: 2400, x: 9, width: 3 },
    ],
    { endFlick: true, direction: 'up' },
  ),
];

describe('parseFreeChart', () => {
  it('정상 채보', () => {
    const r = parseFreeChart(freeText(sample), 'm.chart.json');
    expect(errorsOf(r)).toEqual([]);
  });

  it('방향 무관 플릭', () => {
    const r = parseFreeChart(
      freeText([{ tick: 0, type: 'flick', x: 0, width: 2 }, slide([{ tick: 0, x: 4, width: 2 }, { tick: 480, x: 4, width: 2 }], { endFlick: true })], {
        flickMode: 'any',
      }),
      'm.chart.json',
    );
    expect(errorsOf(r)).toEqual([]);
  });

  it.each([
    [freeText([], { columns: 0 }), 'columns'],
    [freeText([], { columns: 33 }), 'columns'],
    [freeText([], { flickMode: 'swipe' }), 'flickMode'],
    [freeText([{ tick: 0, type: 'tap', x: -1, width: 2 }]), 'notes[0].x'],
    [freeText([{ tick: 0, type: 'tap', x: 0, width: 0 }]), 'notes[0].width'],
    [freeText([{ tick: 0, type: 'tap', x: 11, width: 2 }]), '칸 수'],
    [freeText([{ tick: 0, type: 'hold', x: 0, width: 2 }]), 'notes[0].type'],
    [freeText([{ tick: 0, type: 'tap', x: 0, width: 2, direction: 'up' }]), '플릭에만'],
    [freeText([{ tick: 0, type: 'flick', x: 0, width: 2 }]), 'notes[0].direction'],
    [freeText([{ tick: 0, type: 'flick', x: 0, width: 2, direction: 'down' }]), 'notes[0].direction'],
    [freeText([{ tick: 0, type: 'flick', x: 0, width: 2, direction: 'up' }], { flickMode: 'any' }), '"any"'],
    [freeText([slide([{ tick: 0, x: 0, width: 2 }])]), 'notes[0].points'],
    [freeText([slide([{ tick: 480, x: 0, width: 2 }, { tick: 480, x: 0, width: 2 }])]), 'points[1].tick'],
    [freeText([slide([{ tick: 0, x: 0, width: 2, hidden: true }, { tick: 480, x: 0, width: 2 }])]), '중간 지점'],
    [freeText([slide([{ tick: 0, x: 0, width: 2, ease: 'bounce' }, { tick: 480, x: 0, width: 2 }])]), 'points[0].ease'],
    [freeText([slide([{ tick: 0, x: 0, width: 2 }, { tick: 480, x: 0, width: 2 }], { direction: 'up' })]), 'endFlick'],
    [freeText([slide([{ tick: 0, x: 0, width: 2 }, { tick: 480, x: 0, width: 2 }], { endFlick: true })]), 'notes[0].direction'],
    [freeText([{ tick: 0, type: 'tap', x: 0, width: 3 }, { tick: 0, type: 'flick', x: 2, width: 3, direction: 'up' }]), '겹침'],
    [freeText([{ tick: 0, type: 'tap', x: 0, width: 3 }, slide([{ tick: 0, x: 1, width: 2 }, { tick: 480, x: 1, width: 2 }])]), '겹침'],
  ])('잘못된 채보 %#', (text, needle) => {
    const errors = errorsOf(parseFreeChart(text, 'm.chart.json'));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain('m.chart.json');
    expect(errors.join('\n')).toContain(needle);
  });

  it('끝이 맞닿은 노트와 다른 tick의 노트는 겹침이 아님', () => {
    const r = parseFreeChart(
      freeText([
        { tick: 0, type: 'tap', x: 0, width: 3 },
        { tick: 0, type: 'tap', x: 3, width: 3 },
        { tick: 480, type: 'tap', x: 0, width: 3 },
      ]),
      'm.chart.json',
    );
    expect(errorsOf(r)).toEqual([]);
  });
});

describe('parseAnyChart', () => {
  it('layout으로 종류를 나눈다', () => {
    const free = parseAnyChart(freeText(sample), 'm.chart.json');
    expect(free.ok && isFreeChart(free.value)).toBe(true);
    const lanes = parseAnyChart(
      JSON.stringify({ formatVersion: 1, name: 'N', level: 1, tracks: [{ id: 'A' }], notes: [] }),
      'n.chart.json',
    );
    expect(lanes.ok && !isFreeChart(lanes.value)).toBe(true);
  });

  it('parseChart는 자유형을 레인형으로 읽지 않는다', () => {
    expect(errorsOf(parseChart(freeText([]), 'm.chart.json')).join('\n')).toContain('layout');
  });
});

describe('serializeFreeChart', () => {
  it('왕복해도 같고, 기본값은 생략하며 tick → x 순으로 정렬한다', () => {
    const notes = [
      { tick: 0, type: 'tap', x: 6, width: 2 },
      slide([{ tick: 0, x: 0, width: 2, ease: 'linear', hidden: false }, { tick: 480, x: 3, width: 2 }], { endFlick: false }),
    ];
    const r = parseFreeChart(freeText(notes), 'm.chart.json');
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const text = serializeFreeChart(r.value);
    expect(JSON.parse(text).notes).toEqual([
      { type: 'slide', points: [{ tick: 0, x: 0, width: 2 }, { tick: 480, x: 3, width: 2 }] },
      { tick: 0, type: 'tap', x: 6, width: 2 },
    ]);
    const again = parseFreeChart(text, 'm.chart.json');
    expect(again.ok && serializeFreeChart(again.value)).toBe(text);
  });

  it('전체 예시 왕복', () => {
    const r = parseFreeChart(freeText(sample), 'm.chart.json');
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(JSON.parse(serializeFreeChart(r.value)).notes).toEqual(sample);
  });
});

describe('자유형 헬퍼', () => {
  it('freeNoteKey는 시작 tick과 x', () => {
    expect(freeNoteKey({ tick: 480, type: 'tap', x: 2.5, width: 3 })).toBe('480@2.5');
    expect(freeNoteKey({ type: 'slide', points: [{ tick: 0, x: 1, width: 2 }, { tick: 480, x: 5, width: 2 }] })).toBe('0@1');
  });

  it('easeProgress', () => {
    expect(easeProgress(undefined, 0.5)).toBe(0.5);
    expect(easeProgress('easeIn', 0.5)).toBe(0.25);
    expect(easeProgress('easeOut', 0.5)).toBe(0.75);
    expect(easeProgress('linear', 2)).toBe(1);
  });

  it('slideSpanAt은 지점 사이를 앞 지점의 곡선으로 보간한다', () => {
    const points = [
      { tick: 0, x: 0, width: 2 },
      { tick: 480, x: 4, width: 4, ease: 'easeIn' as const },
      { tick: 960, x: 8, width: 4 },
    ];
    const times = [0, 100, 200];
    expect(slideSpanAt(points, times, -10)).toEqual({ x: 0, width: 2 });
    expect(slideSpanAt(points, times, 50)).toEqual({ x: 2, width: 3 });
    expect(slideSpanAt(points, times, 150)).toEqual({ x: 5, width: 4 });
    expect(slideSpanAt(points, times, 999)).toEqual({ x: 8, width: 4 });
  });

  it('freeNoteErrors', () => {
    expect(freeNoteErrors({ tick: 0, type: 'tap', x: 0, width: 2 }, 12, 'any')).toEqual([]);
    expect(freeNoteErrors({ tick: 0, type: 'tap', x: 11, width: 2 }, 12, 'any').length).toBe(1);
    expect(freeNoteErrors({ tick: 0, type: 'flick', x: 0, width: 2 }, 12, 'directional').length).toBe(1);
  });
});

describe('기믹 노트', () => {
  const gimmicks = [
    { name: '폭탄', color: '#EF4444' },
    { name: 'Lane Light', color: '#a78bfa' },
  ];
  const bomb = { tick: 480, type: 'gimmick', gimmick: '폭탄', x: 2, width: 3 };

  it('종류 목록과 노트를 읽고 쓴다 (색은 소문자로)', () => {
    const r = parseFreeChart(freeText([bomb, { tick: 480, type: 'tap', x: 6, width: 2 }], { gimmicks }), 'm.chart.json');
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.value.gimmicks).toEqual([
      { name: '폭탄', color: '#ef4444' },
      { name: 'Lane Light', color: '#a78bfa' },
    ]);
    expect(r.value.notes[0]).toEqual(bomb);
    const text = serializeFreeChart(r.value);
    expect(JSON.parse(text).gimmicks).toEqual(r.value.gimmicks);
    const again = parseFreeChart(text, 'm.chart.json');
    expect(again.ok && serializeFreeChart(again.value)).toBe(text);
  });

  it('종류가 없으면 gimmicks를 쓰지 않는다', () => {
    const r = parseFreeChart(freeText([], { gimmicks: [] }), 'm.chart.json');
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.value.gimmicks).toBeUndefined();
    expect(JSON.parse(serializeFreeChart(r.value)).gimmicks).toBeUndefined();
  });

  it('없는 종류 이름, 방향, 잘못된 목록은 오류', () => {
    expect(errorsOf(parseFreeChart(freeText([{ ...bomb, gimmick: '없음' }], { gimmicks }), 'm.chart.json'))).toEqual([
      'm.chart.json › notes[0].gimmick: gimmicks에 없는 이름 "없음"',
    ]);
    expect(errorsOf(parseFreeChart(freeText([{ ...bomb, direction: 'up' }], { gimmicks }), 'm.chart.json'))).toEqual([
      'm.chart.json › notes[0].direction: 플릭에만 쓸 수 있음',
    ]);
    const bad = [{ name: ' 폭탄', color: '#fff' }, { name: '폭탄', color: '#ef4444' }, { name: '폭탄', color: '#ef4444' }];
    expect(errorsOf(parseFreeChart(freeText([], { gimmicks: bad }), 'm.chart.json'))).toEqual([
      'm.chart.json › gimmicks[0].name: 앞뒤에 공백이 있으면 안 됨',
      'm.chart.json › gimmicks[0].color: #rrggbb 형식이어야 함',
    ]);
    expect(errorsOf(parseFreeChart(freeText([], { gimmicks: [gimmicks[0], gimmicks[0]] }), 'm.chart.json'))).toEqual([
      'm.chart.json › gimmicks[1].name: 이름 "폭탄"이 중복됨',
    ]);
  });

  it('기믹 노트도 같은 tick에서 다른 노트와 겹치면 안 된다', () => {
    expect(
      errorsOf(parseFreeChart(freeText([bomb, { tick: 480, type: 'tap', x: 3, width: 2 }], { gimmicks }), 'm.chart.json')),
    ).toEqual(['m.chart.json › notes[1]: notes[0]와 겹침']);
  });

  it('freeNoteErrors는 넘긴 종류 목록으로 이름을 본다', () => {
    expect(freeNoteErrors(bomb, 12, 'directional', gimmicks)).toEqual([]);
    expect(freeNoteErrors(bomb, 12, 'directional')).toEqual(['note › note.gimmick: gimmicks에 없는 이름 "폭탄"']);
  });
});

describe('기믹 슬라이드', () => {
  const gimmicks = [{ name: '레이저', color: '#22d3ee' }];
  const laser = {
    type: 'slide',
    gimmick: '레이저',
    points: [
      { tick: 480, x: 0, width: 4 },
      { tick: 960, x: 6, width: 2, ease: 'easeIn' },
      { tick: 1440, x: 2, width: 6 },
    ],
  };

  it('gimmick을 읽고 쓰며, 끝 tick 계산에 들어간다', () => {
    const r = parseFreeChart(freeText([laser], { gimmicks }), 'm.chart.json');
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.value.notes[0]).toEqual(laser);
    expect(JSON.parse(serializeFreeChart(r.value)).notes[0]).toEqual(laser);
    expect(lastNoteEndTick(r.value)).toBe(1440);
    expect(freeGimmickOf(r.value.notes[0])).toBe('레이저');
  });

  it('없는 이름이나 끝 플릭은 오류', () => {
    expect(errorsOf(parseFreeChart(freeText([{ ...laser, gimmick: '없음' }], { gimmicks }), 'm.chart.json'))).toEqual([
      'm.chart.json › notes[0].gimmick: gimmicks에 없는 이름 "없음"',
    ]);
    expect(
      errorsOf(parseFreeChart(freeText([{ ...laser, endFlick: true, direction: 'up' }], { gimmicks }), 'm.chart.json')),
    ).toEqual(['m.chart.json › notes[0].endFlick: 기믹 슬라이드에는 쓸 수 없음']);
  });
});
