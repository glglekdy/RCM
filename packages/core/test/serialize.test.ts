import { describe, expect, it } from 'vitest';
import {
  basicTracks, emptyEditorData, noteKey, parseChart, parseEditorData, parseSong,
  serializeChart, serializeEditorData, serializeSong, type Chart, type Note, type Song,
} from '../src';

describe('serialize', () => {
  it('노트 정렬 + 2칸 들여쓰기 + 끝 개행 + 왕복', () => {
    const chart: Chart = { formatVersion: 1, name: 'N', level: 1, tracks: basicTracks(4), notes: [
      { tick: 480, track: 'Note_2', type: 'tap' }, { tick: 0, track: 'Note_4', type: 'tap' }, { tick: 480, track: 'Note_1', type: 'tap' } ] };
    const text = serializeChart(chart);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "notes"');
    const back = parseChart(text, 'n.chart.json');
    expect(back.ok && back.value.notes.map(noteKey)).toEqual(['Note_4:0', 'Note_1:480', 'Note_2:480']);
  });
  it('입력 객체를 변경하지 않는다', () => {
    const notes: Chart['notes'] = [{ tick: 480, track: 'Note_2', type: 'tap' }, { tick: 0, track: 'Note_1', type: 'tap' }];
    serializeChart({ formatVersion: 1, name: 'N', level: 1, tracks: basicTracks(4), notes });
    expect(notes[0].tick).toBe(480);
  });
  it('필드 순서', () => {
    const text = serializeChart({ formatVersion: 1, name: 'N', level: 1, tracks: basicTracks(4),
      notes: [{ tick: 0, track: 'Note_1', type: 'hold', endTick: 480 }] });
    expect(Object.keys(JSON.parse(text))).toEqual(['formatVersion', 'name', 'level', 'tracks', 'notes']);
    expect(Object.keys(JSON.parse(text).notes[0])).toEqual(['tick', 'track', 'type', 'endTick']);
  });
  it('기본 색·폭은 생략, 나머지는 유지', () => {
    const text = serializeChart({ formatVersion: 1, name: 'N', level: 1, notes: [],
      tracks: [{ id: 'Side_L', color: '#f59e0b', width: 'wide' }, { id: 'Note_1', color: '#F2F2F2', width: 'normal' }] });
    expect(JSON.parse(text).tracks).toEqual([{ id: 'Side_L', color: '#f59e0b', width: 'wide' }, { id: 'Note_1' }]);
  });
  it('같은 tick은 트랙 순서로 저장', () => {
    const text = serializeChart({ formatVersion: 1, name: 'N', level: 1, tracks: [{ id: 'B' }, { id: 'A' }],
      notes: [{ tick: 0, track: 'A', type: 'tap' }, { tick: 0, track: 'B', type: 'tap' }] });
    expect(JSON.parse(text).notes.map((n: Note) => n.track)).toEqual(['B', 'A']);
  });
  it('beatsPerMeasure 없으면 생략', () => {
    const song: Song = { formatVersion: 1, title: 't', artist: '', audio: 'a.ogg', offsetMs: 0, previewStartMs: 0, timing: [{ tick: 0, bpm: 120 }] };
    expect(serializeSong(song)).not.toContain('beatsPerMeasure');
  });
  it('song 왕복', () => {
    const song: Song = { formatVersion: 1, title: 't', artist: '', audio: 'a.ogg', offsetMs: -5, previewStartMs: 0,
      timing: [{ tick: 0, bpm: 120, beatsPerMeasure: 4 }, { tick: 1920, bpm: 90 }] };
    const r = parseSong(serializeSong(song));
    expect(r.ok && r.value).toEqual(song);
    expect(Object.keys(JSON.parse(serializeSong(song)))).toEqual(
      ['formatVersion', 'title', 'artist', 'audio', 'offsetMs', 'previewStartMs', 'timing']);
  });
  it('editor.json 왕복', () => {
    expect(emptyEditorData()).toEqual({ formatVersion: 1, markers: [] });
    const data = { formatVersion: 1 as const, markers: [{ ms: 1.5, label: 'a' }] };
    const text = serializeEditorData(data);
    expect(text.endsWith('\n')).toBe(true);
    const r = parseEditorData(text);
    expect(r.ok && r.value).toEqual(data);
  });
});

describe('serialize speeds', () => {
  it('speeds가 없거나 비면 필드 생략', () => {
    const base = { formatVersion: 1, name: 'N', level: 1, tracks: basicTracks(4), notes: [] } as Chart;
    expect(serializeChart(base)).not.toContain('speeds');
    expect(serializeChart({ ...base, speeds: [] })).not.toContain('speeds');
  });
  it('instant 생략, 필드 순서, 왕복', () => {
    const chart = { formatVersion: 1, name: 'N', level: 1, tracks: basicTracks(4), notes: [],
      speeds: [{ tick: 0, speed: 2, ease: 'instant' }, { tick: 480, speed: 1, ease: 'linear' }] } as Chart;
    const text = serializeChart(chart);
    expect(JSON.parse(text).speeds).toEqual([{ tick: 0, speed: 2 }, { tick: 480, speed: 1, ease: 'linear' }]);
    expect(Object.keys(JSON.parse(text))).toEqual(['formatVersion', 'name', 'level', 'tracks', 'speeds', 'notes']);
    const back = parseChart(text, 'n.chart.json');
    expect(back.ok && back.value.speeds).toEqual([{ tick: 0, speed: 2 }, { tick: 480, speed: 1, ease: 'linear' }]);
  });
});
