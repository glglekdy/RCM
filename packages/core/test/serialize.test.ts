import { describe, expect, it } from 'vitest';
import {
  emptyEditorData, noteKey, parseChart, parseEditorData, parseSong,
  serializeChart, serializeEditorData, serializeSong, type Chart, type Song,
} from '../src';

describe('serialize', () => {
  it('노트 정렬 + 2칸 들여쓰기 + 끝 개행 + 왕복', () => {
    const chart: Chart = { formatVersion: 1, name: 'N', level: 1, lanes: 4, notes: [
      { tick: 480, lane: 1, type: 'tap' }, { tick: 0, lane: 3, type: 'tap' }, { tick: 480, lane: 0, type: 'tap' } ] };
    const text = serializeChart(chart);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "notes"');
    const back = parseChart(text, 'n.chart.json');
    expect(back.ok && back.value.notes.map(noteKey)).toEqual(['3:0', '0:480', '1:480']);
  });
  it('입력 객체를 변경하지 않는다', () => {
    const notes: Chart['notes'] = [{ tick: 480, lane: 1, type: 'tap' }, { tick: 0, lane: 0, type: 'tap' }];
    serializeChart({ formatVersion: 1, name: 'N', level: 1, lanes: 4, notes });
    expect(notes[0].tick).toBe(480);
  });
  it('필드 순서', () => {
    const text = serializeChart({ formatVersion: 1, name: 'N', level: 1, lanes: 4,
      notes: [{ tick: 0, lane: 0, type: 'hold', endTick: 480 }] });
    expect(Object.keys(JSON.parse(text))).toEqual(['formatVersion', 'name', 'level', 'lanes', 'notes']);
    expect(Object.keys(JSON.parse(text).notes[0])).toEqual(['tick', 'lane', 'type', 'endTick']);
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
