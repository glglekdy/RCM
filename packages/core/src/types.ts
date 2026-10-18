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

/** 자유 위치형(모바일) 채보: 노트가 트랙 대신 가로 위치 `x`와 폭 `width`(칸 단위)를 가진다. */
export type FlickMode = 'directional' | 'any';
export type FlickDirection = 'up' | 'left' | 'right' | 'upLeft' | 'upRight';
/** 슬라이드 지점에서 다음 지점까지의 이동 곡선. 생략 = 'linear' */
export type SlideEase = 'linear' | 'easeIn' | 'easeOut';

export interface SlidePoint {
  tick: number;
  x: number;
  width: number;
  ease?: SlideEase;
  /** 중간 지점 전용: 판정 없이 경로만 꺾는다 */
  hidden?: boolean;
}

export type FreeNote =
  | { tick: number; type: 'tap' | 'trace'; x: number; width: number }
  | { tick: number; type: 'flick'; x: number; width: number; direction?: FlickDirection }
  | { type: 'slide'; points: SlidePoint[]; endFlick?: boolean; direction?: FlickDirection };

export interface FreeChart {
  formatVersion: 1;
  layout: 'free';
  name: string;
  level: number;
  columns: number;
  flickMode: FlickMode;
  speeds?: SpeedPoint[];
  notes: FreeNote[];
}

export type AnyChart = Chart | FreeChart;

export function isFreeChart(chart: AnyChart): chart is FreeChart {
  return (chart as FreeChart).layout === 'free';
}

/** 노트가 시작하는 tick (슬라이드는 첫 지점). */
export function freeNoteTick(note: FreeNote): number {
  return note.type === 'slide' ? note.points[0].tick : note.tick;
}
