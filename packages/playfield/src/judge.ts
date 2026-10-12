export const JUDGE_WINDOWS = { perfect: 40, great: 80, good: 120 } as const;
export const HOLD_RELEASE_TOLERANCE = 120;

export type Judgement = 'perfect' | 'great' | 'good' | 'miss';
/** PERFECT를 벗어난 타격이 노트보다 빨랐는지(early) 늦었는지(late) */
export type Timing = 'early' | 'late';

export interface JudgeEvent {
  lane: number;
  judgement: Judgement;
  part: 'head' | 'tail';
  ms: number;
  /** GREAT·GOOD 머리 판정에만 붙는다 */
  timing?: Timing;
}

/** 입력 시각 - 노트 시각(ms)을 판정으로 바꾼다. 창 밖이면 null (치지 않은 것으로 본다). */
export function judgeDelta(deltaMs: number): Judgement | null {
  const d = Math.abs(deltaMs);
  if (d <= JUDGE_WINDOWS.perfect) return 'perfect';
  if (d <= JUDGE_WINDOWS.great) return 'great';
  if (d <= JUDGE_WINDOWS.good) return 'good';
  return null;
}

/** GREAT·GOOD이면 입력이 빨랐는지 늦었는지, PERFECT·MISS면 null. */
export function timingOf(deltaMs: number, judgement: Judgement): Timing | null {
  if (judgement === 'perfect' || judgement === 'miss') return null;
  return deltaMs < 0 ? 'early' : 'late';
}
