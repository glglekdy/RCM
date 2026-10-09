export const TICKS_PER_BEAT = 480;
export const FORMAT_VERSION = 1;
export const MIN_LANES = 4;
export const MAX_LANES = 8;

export type SnapDivision = 4 | 8 | 12 | 16 | 24 | 32;

export const SNAP_DIVISIONS: readonly SnapDivision[] = [4, 8, 12, 16, 24, 32];

/** 스냅 한 칸의 tick 길이 (1/4 = 1박 = 480 tick). */
export function snapStepTicks(division: SnapDivision): number {
  return (TICKS_PER_BEAT * 4) / division;
}
