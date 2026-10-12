import type { TrackKind } from './types';

export const TICKS_PER_BEAT = 480;
export const FORMAT_VERSION = 1;
export const MIN_TRACKS = 1;
export const MAX_TRACKS = 16;
export const TRACK_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const DEFAULT_NOTE_COLOR = '#f2f2f2';
export const TRACK_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const TRACK_KINDS: readonly TrackKind[] = ['play', 'gimmick'];
export const MIN_SCROLL_SPEED = 0;
export const MAX_SCROLL_SPEED = 20;

export type SnapDivision = 4 | 8 | 12 | 16 | 24 | 32;

export const SNAP_DIVISIONS: readonly SnapDivision[] = [4, 8, 12, 16, 24, 32];

/** 스냅 한 칸의 tick 길이 (1/4 = 1박 = 480 tick). */
export function snapStepTicks(division: SnapDivision): number {
  return (TICKS_PER_BEAT * 4) / division;
}
