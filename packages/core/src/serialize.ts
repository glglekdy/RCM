import { DEFAULT_NOTE_COLOR } from './constants';
import { compareNotes } from './tracks';
import type { Chart, EditorData, Note, Song, Track } from './types';

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
  if (t.width !== undefined && t.width !== 'normal') out.width = t.width;
  return out;
}

export function serializeChart(chart: Chart): string {
  const notes = [...chart.notes].sort(compareNotes(chart.tracks));
  return dump({
    formatVersion: chart.formatVersion,
    name: chart.name,
    level: chart.level,
    tracks: chart.tracks.map(trackOut),
    notes: notes.map(noteOut),
  });
}

export function serializeEditorData(data: EditorData): string {
  return dump({
    formatVersion: data.formatVersion,
    markers: data.markers.map((m) => ({ ms: m.ms, label: m.label })),
  });
}
