import { describe, expect, it } from 'vitest';
import { notesOverlap, parseChart, parseEditorData, parseSong, type ParseResult } from '../src';

const chartText = (notes: unknown[], extra = {}) =>
  JSON.stringify({ formatVersion: 1, name: 'HARD', level: 12, lanes: 7, notes, ...extra });
const errorsOf = (r: ParseResult<unknown>) => (r.ok ? [] : r.errors);

describe('parseChart', () => {
  it('정상 채보', () => {
    const r = parseChart(
      chartText([{ tick: 2400, lane: 3, type: 'hold', endTick: 3360 }, { tick: 0, lane: 0, type: 'tap' }]),
      'hard.chart.json',
    );
    expect(r.ok).toBe(true);
  });
  it.each([
    [chartText([], { formatVersion: 2 }), 'formatVersion'],
    [chartText([], { lanes: 9 }), 'lanes'],
    [chartText([{ tick: 0, lane: 0, type: 'tap' }, { tick: 0, lane: 7, type: 'tap' }]), 'notes[1]'],
    [chartText([{ tick: 480, lane: 0, type: 'hold', endTick: 480 }]), 'notes[0]'],
    [chartText([{ tick: -1, lane: 0, type: 'tap' }]), 'notes[0]'],
    [chartText([{ tick: 1.5, lane: 0, type: 'tap' }]), 'notes[0]'],
    [chartText([{ tick: 0, lane: 0, type: 'hold', endTick: 960 }, { tick: 480, lane: 0, type: 'tap' }]), '겹침'],
    ['{ not json', 'JSON'],
  ])('잘못된 채보 %#', (text, needle) => {
    const errors = errorsOf(parseChart(text, 'hard.chart.json'));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain('hard.chart.json');
    expect(errors.join('\n')).toContain(needle);
  });
  it('lane 범위 오류 메시지 형식', () => {
    const errors = errorsOf(parseChart(chartText([{ tick: 0, lane: 7, type: 'tap' }]), 'hard.chart.json'));
    expect(errors).toEqual(['hard.chart.json › notes[0]: lane 7은 범위를 벗어남 (0~6)']);
  });
  it('모르는 필드는 버린다', () => {
    const r = parseChart(chartText([{ tick: 0, lane: 0, type: 'tap', foo: 1 }], { extra: 1 }), 'a.chart.json');
    expect(r.ok && r.value).toEqual({
      formatVersion: 1, name: 'HARD', level: 12, lanes: 7, notes: [{ tick: 0, lane: 0, type: 'tap' }],
    });
  });
  it('최상위가 객체가 아니면 오류', () => {
    expect(errorsOf(parseChart('[]', 'a.chart.json')).length).toBe(1);
  });
});

describe('parseSong', () => {
  it.each([
    [{ timing: [] }, 'timing'],
    [{ timing: [{ tick: 480, bpm: 120 }] }, 'timing[0]'],
    [{ timing: [{ tick: 0, bpm: 120 }, { tick: 0, bpm: 90 }] }, 'timing[1]'],
    [{ timing: [{ tick: 0, bpm: 0 }] }, 'timing[0]'],
    [{ timing: [{ tick: 0, bpm: 120, beatsPerMeasure: 0 }] }, 'timing[0]'],
    [{ title: 3 }, 'title'],
    [{ offsetMs: 'x' }, 'offsetMs'],
  ])('잘못된 song %#', (patch, needle) => {
    const base = { formatVersion: 1, title: 't', artist: 'a', audio: 'audio.ogg', offsetMs: 0, previewStartMs: 0, timing: [{ tick: 0, bpm: 120 }] };
    expect(errorsOf(parseSong(JSON.stringify({ ...base, ...patch }))).join('\n')).toContain(needle);
  });
  it('기본 파일명은 song.json', () => {
    expect(errorsOf(parseSong('{')).join('\n')).toContain('song.json: JSON 형식이 올바르지 않음');
  });
});

describe('parseEditorData', () => {
  it('markers 기본값', () => {
    const r = parseEditorData('{"formatVersion":1}');
    expect(r.ok && r.value.markers).toEqual([]);
  });
  it('label 누락은 빈 문자열', () => {
    const r = parseEditorData('{"formatVersion":1,"markers":[{"ms":1.5}]}');
    expect(r.ok && r.value.markers).toEqual([{ ms: 1.5, label: '' }]);
  });
  it('ms가 숫자가 아니면 오류', () => {
    expect(errorsOf(parseEditorData('{"formatVersion":1,"markers":[{"ms":"a"}]}')).join('\n')).toContain('markers[0]');
  });
  it('손으로 고친 파일의 마커도 ms 순으로 (같은 ms는 원래 순서)', () => {
    const r = parseEditorData(
      '{"formatVersion":1,"markers":[{"ms":3000,"label":"c"},{"ms":1000,"label":"a"},{"ms":2000,"label":"b1"},{"ms":2000,"label":"b2"}]}',
    );
    expect(r.ok && r.value.markers.map((m) => m.label)).toEqual(['a', 'b1', 'b2', 'c']);
  });
});

describe('notesOverlap', () => {
  it('끝 포함', () => {
    expect(notesOverlap({ tick: 0, lane: 0, type: 'hold', endTick: 480 }, { tick: 480, lane: 0, type: 'tap' })).toBe(true);
    expect(notesOverlap({ tick: 0, lane: 0, type: 'hold', endTick: 480 }, { tick: 480, lane: 1, type: 'tap' })).toBe(false);
  });
});
