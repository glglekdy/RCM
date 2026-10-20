import { DEFAULT_NOTE_COLOR } from './constants';
import { compareNotes } from './tracks';
import {
  freeNoteTick,
  type Chart,
  type EditorData,
  type FreeChart,
  type FreeNote,
  type Note,
  type SlidePoint,
  type Song,
  type SpeedPoint,
  type Track,
} from './types';

const dump = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

export function emptyEditorData(): EditorData {
  return { formatVersion: 1, markers: [] };
}

export function serializeSong(song: Song): string {
  return dump({
    formatVersion: song.formatVersion,
    title: song.title,
    artist: song.artist,
    audio: song.audio,
    offsetMs: song.offsetMs,
    previewStartMs: song.previewStartMs,
    timing: song.timing.map((t) =>
      t.beatsPerMeasure === undefined
        ? { tick: t.tick, bpm: t.bpm }
        : { tick: t.tick, bpm: t.bpm, beatsPerMeasure: t.beatsPerMeasure },
    ),
  });
}

function noteOut(n: Note) {
  return n.type === 'hold'
    ? { tick: n.tick, track: n.track, type: n.type, endTick: n.endTick }
    : { tick: n.tick, track: n.track, type: n.type };
}

function trackOut(t: Track) {
  const out: Track = { id: t.id };
  if (t.color !== undefined && t.color.toLowerCase() !== DEFAULT_NOTE_COLOR) out.color = t.color;
  if (t.kind === 'gimmick') out.kind = t.kind;
  return out;
}

function speedOut(p: SpeedPoint) {
  return p.ease === 'linear' ? { tick: p.tick, speed: p.speed, ease: p.ease } : { tick: p.tick, speed: p.speed };
}

export function serializeChart(chart: Chart): string {
  const notes = [...chart.notes].sort(compareNotes(chart.tracks));
  return dump({
    formatVersion: chart.formatVersion,
    name: chart.name,
    level: chart.level,
    tracks: chart.tracks.map(trackOut),
    ...(chart.speeds && chart.speeds.length > 0 ? { speeds: chart.speeds.map(speedOut) } : {}),
    notes: notes.map(noteOut),
  });
}

function slidePointOut(p: SlidePoint) {
  return {
    tick: p.tick,
    x: p.x,
    width: p.width,
    ...(p.ease !== undefined && p.ease !== 'linear' ? { ease: p.ease } : {}),
    ...(p.hidden ? { hidden: true } : {}),
  };
}

function freeNoteOut(n: FreeNote) {
  if (n.type === 'slide') {
    const end = n.endFlick ? { endFlick: true, ...(n.direction !== undefined ? { direction: n.direction } : {}) } : {};
    return { type: n.type, ...(n.gimmick !== undefined ? { gimmick: n.gimmick } : {}), points: n.points.map(slidePointOut), ...end };
  }
  if (n.type === 'gimmick') return { tick: n.tick, type: n.type, gimmick: n.gimmick, x: n.x, width: n.width };
  const base = { tick: n.tick, type: n.type, x: n.x, width: n.width };
  return n.type === 'flick' && n.direction !== undefined ? { ...base, direction: n.direction } : base;
}

/** 시작 tick → 왼쪽 위치 순 */
function compareFreeNotes(a: FreeNote, b: FreeNote): number {
  const pa = a.type === 'slide' ? a.points[0] : a;
  const pb = b.type === 'slide' ? b.points[0] : b;
  return freeNoteTick(a) - freeNoteTick(b) || pa.x - pb.x;
}

export function serializeFreeChart(chart: FreeChart): string {
  return dump({
    formatVersion: chart.formatVersion,
    layout: chart.layout,
    name: chart.name,
    level: chart.level,
    columns: chart.columns,
    flickMode: chart.flickMode,
    ...(chart.gimmicks && chart.gimmicks.length > 0
      ? { gimmicks: chart.gimmicks.map((g) => ({ name: g.name, color: g.color })) }
      : {}),
    ...(chart.speeds && chart.speeds.length > 0 ? { speeds: chart.speeds.map(speedOut) } : {}),
    notes: [...chart.notes].sort(compareFreeNotes).map(freeNoteOut),
  });
}

export function serializeEditorData(data: EditorData): string {
  return dump({
    formatVersion: data.formatVersion,
    markers: data.markers.map((m) => ({ ms: m.ms, label: m.label })),
  });
}
