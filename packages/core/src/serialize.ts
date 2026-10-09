import type { Chart, EditorData, Note, Song } from './types';

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
    ? { tick: n.tick, lane: n.lane, type: n.type, endTick: n.endTick }
    : { tick: n.tick, lane: n.lane, type: n.type };
}

export function serializeChart(chart: Chart): string {
  const notes = [...chart.notes].sort((a, b) => a.tick - b.tick || a.lane - b.lane);
  return dump({
    formatVersion: chart.formatVersion,
    name: chart.name,
    level: chart.level,
    lanes: chart.lanes,
    notes: notes.map(noteOut),
  });
}

export function serializeEditorData(data: EditorData): string {
  return dump({
    formatVersion: data.formatVersion,
    markers: data.markers.map((m) => ({ ms: m.ms, label: m.label })),
  });
}
