export interface TimingPoint {
  tick: number;
  bpm: number;
  beatsPerMeasure?: number;
}

export interface Song {
  formatVersion: 1;
  title: string;
  artist: string;
  audio: string;
  offsetMs: number;
  previewStartMs: number;
  timing: TimingPoint[];
}

export type Note =
  | { tick: number; lane: number; type: 'tap' }
  | { tick: number; lane: number; type: 'hold'; endTick: number };

export interface Chart {
  formatVersion: 1;
  name: string;
  level: number;
  lanes: number;
  notes: Note[];
}

export interface Marker {
  ms: number;
  label: string;
}

export interface EditorData {
  formatVersion: 1;
  markers: Marker[];
}

/** 채보 안에서 유일한 노트 키 (겹침 금지 규칙). */
export function noteKey(note: Note): string {
  return `${note.lane}:${note.tick}`;
}
