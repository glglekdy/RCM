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

/** 플레이 = 치는 노트, 기믹 = 판정 없이 게임이 해석하는 데이터 (예: 장애물 등장 시각) */
export type TrackKind = 'play' | 'gimmick';

export interface Track {
  id: string;
  color?: string;
  /** 생략 = 'play' */
  kind?: TrackKind;
}

export type Note =
  | { tick: number; track: string; type: 'tap' }
  | { tick: number; track: string; type: 'hold'; endTick: number };

export type SpeedEase = 'instant' | 'linear';

export interface SpeedPoint {
  tick: number;
  speed: number;
  ease?: SpeedEase;
}

export interface Chart {
  formatVersion: 1;
  name: string;
  level: number;
  tracks: Track[];
  speeds?: SpeedPoint[];
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
  return `${note.track}:${note.tick}`;
}
