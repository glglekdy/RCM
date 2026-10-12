import { describe, expect, it } from 'vitest';
import { basicTracks, notesOverlap, parseChart, parseEditorData, parseSong, type ParseResult } from '../src';

const chartText = (notes: unknown[], extra = {}) =>
  JSON.stringify({ formatVersion: 1, name: 'HARD', level: 12, tracks: basicTracks(4), notes, ...extra });
const tr = (ids: string[]) => ids.map((id) => ({ id }));
const errorsOf = (r: ParseResult<unknown>) => (r.ok ? [] : r.errors);

describe('parseChart', () => {
  it('정상 채보', () => {
    const r = parseChart(
      chartText([{ tick: 2400, track: 'Note_4', type: 'hold', endTick: 3360 }, { tick: 0, track: 'Note_1', type: 'tap' }]),
      'hard.chart.json',
    );
    expect(r.ok).toBe(true);
  });
  it.each([
    [chartText([], { formatVersion: 2 }), 'formatVersion'],
    [chartText([{ tick: 0, track: 'Note_1', type: 'tap' }, { tick: 0, track: 'Nope', type: 'tap' }]), 'notes[1]'],
    [chartText([{ tick: 480, track: 'Note_1', type: 'hold', endTick: 480 }]), 'notes[0]'],
    [chartText([{ tick: -1, track: 'Note_1', type: 'tap' }]), 'notes[0]'],
    [chartText([{ tick: 1.5, track: 'Note_1', type: 'tap' }]), 'notes[0]'],
    [chartText([{ tick: 0, track: 'Note_1', type: 'hold', endTick: 960 }, { tick: 480, track: 'Note_1', type: 'tap' }]), '겹침'],
    ['{ not json', 'JSON'],
  ])('잘못된 채보 %#', (text, needle) => {
    const errors = errorsOf(parseChart(text, 'hard.chart.json'));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toContain('hard.chart.json');
    expect(errors.join('\n')).toContain(needle);
  });
  it('없는 트랙 오류 메시지 형식', () => {
    const errors = errorsOf(parseChart(chartText([{ tick: 0, track: 'Nope', type: 'tap' }]), 'hard.chart.json'));
    expect(errors).toEqual(["hard.chart.json › notes[0].track: 'Nope' 트랙이 없음"]);
  });
  it.each([
    [{ tracks: [] }, 'tracks'],
    [{ tracks: tr(Array.from({ length: 17 }, (_, i) => `T${i}`)) }, 'tracks'],
    [{ tracks: tr(['A', 'A']) }, 'tracks[1].id'],
    [{ tracks: tr(['bad id']) }, 'tracks[0].id'],
    [{ tracks: [{ id: 'A', color: 'red' }] }, 'tracks[0].color'],
    [{ tracks: [{ id: 'A', kind: 'boss' }] }, 'tracks[0].kind'],
    [{ notes: [{ tick: 0, track: 'Nope', type: 'tap' }] }, 'notes[0].track'],
  ])('트랙 오류 %#', (patch, needle) => {
    const errors = errorsOf(parseChart(chartText((patch as { notes?: unknown[] }).notes ?? [], patch), 'hard.chart.json'));
    expect(errors.join('\n')).toContain('hard.chart.json');
    expect(errors.join('\n')).toContain(needle);
  });
  it('width는 값과 상관없이 버린다', () => {
    const r = parseChart(chartText([], { tracks: [{ id: 'A', width: 'huge' }, { id: 'B', width: 'wide', color: '#ff0000' }] }), 'a.chart.json');
    expect(r.ok && r.value.tracks).toEqual([{ id: 'A' }, { id: 'B', color: '#ff0000' }]);
  });
  it('kind: play는 생략형, gimmick은 유지', () => {
    const r = parseChart(chartText([], { tracks: [{ id: 'A', kind: 'play' }, { id: 'G', kind: 'gimmick' }] }), 'a.chart.json');
    expect(r.ok && r.value.tracks).toEqual([{ id: 'A' }, { id: 'G', kind: 'gimmick' }]);
  });
  it('예전 포맷 거부', () => {
    const errors = errorsOf(parseChart(JSON.stringify({ formatVersion: 1, name: 'N', level: 1, lanes: 4, notes: [] }), 'n.chart.json'));
    expect(errors).toEqual(['n.chart.json: 예전 포맷은 지원하지 않아요']);
    const noteLane = errorsOf(parseChart(chartText([{ tick: 0, lane: 0, type: 'tap' }]), 'n.chart.json'));
    expect(noteLane).toEqual(['n.chart.json: 예전 포맷은 지원하지 않아요']);
  });
  it('겹침은 트랙별', () => {
    const ok = parseChart(chartText([{ tick: 0, track: 'Note_1', type: 'tap' }, { tick: 0, track: 'Note_2', type: 'tap' }]), 'n.chart.json');
    expect(ok.ok).toBe(true);
  });
  it('모르는 필드는 버린다', () => {
    const r = parseChart(chartText([{ tick: 0, track: 'Note_1', type: 'tap', foo: 1 }], { extra: 1 }), 'a.chart.json');
    expect(r.ok && r.value).toEqual({
      formatVersion: 1, name: 'HARD', level: 12, tracks: basicTracks(4), notes: [{ tick: 0, track: 'Note_1', type: 'tap' }],
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
    expect(notesOverlap({ tick: 0, track: 'Note_1', type: 'hold', endTick: 480 }, { tick: 480, track: 'Note_1', type: 'tap' })).toBe(true);
    expect(notesOverlap({ tick: 0, track: 'Note_1', type: 'hold', endTick: 480 }, { tick: 480, track: 'Note_2', type: 'tap' })).toBe(false);
  });
});

describe('speeds', () => {
  it.each([
    [{ speeds: {} }, 'speeds'],
    [{ speeds: [{ tick: -1, speed: 1 }] }, 'speeds[0].tick'],
    [{ speeds: [{ tick: 1.5, speed: 1 }] }, 'speeds[0].tick'],
    [{ speeds: [{ tick: 480, speed: 1 }, { tick: 480, speed: 2 }] }, 'speeds[1].tick'],
    [{ speeds: [{ tick: 960, speed: 1 }, { tick: 480, speed: 2 }] }, 'speeds[1].tick'],
    [{ speeds: [{ tick: 0, speed: -0.1 }] }, 'speeds[0].speed'],
    [{ speeds: [{ tick: 0, speed: 20.5 }] }, 'speeds[0].speed'],
    [{ speeds: [{ tick: 0, speed: '2' }] }, 'speeds[0].speed'],
    [{ speeds: [{ tick: 0, speed: 1, ease: 'bounce' }] }, 'speeds[0].ease'],
  ])('잘못된 speeds %#', (patch, needle) => {
    const errors = errorsOf(parseChart(chartText([], patch), 'hard.chart.json'));
    expect(errors.join('\n')).toContain('hard.chart.json');
    expect(errors.join('\n')).toContain(needle);
  });
  it('정상 speeds (0과 20 경계 포함)', () => {
    const r = parseChart(chartText([], { speeds: [{ tick: 0, speed: 0 }, { tick: 480, speed: 20, ease: 'linear' }] }), 'n.chart.json');
    expect(r.ok && r.value.speeds).toEqual([{ tick: 0, speed: 0 }, { tick: 480, speed: 20, ease: 'linear' }]);
  });
  it('빈 speeds는 필드를 두지 않는다', () => {
    const r = parseChart(chartText([], { speeds: [] }), 'n.chart.json');
    expect(r.ok && 'speeds' in r.value).toBe(false);
  });
});
