export const JUDGE_WINDOWS = { perfect: 40, great: 80, good: 120 } as const;
export const HOLD_RELEASE_TOLERANCE = 120;

export type Judgement = 'perfect' | 'great' | 'good' | 'miss';

export interface JudgeEvent {
  lane: number;
  judgement: Judgement;
  part: 'head' | 'tail';
  ms: number;
}

/** 입력 시각 - 노트 시각(ms)을 판정으로 바꾼다. 창 밖이면 null (치지 않은 것으로 본다). */
export function judgeDelta(deltaMs: number): Judgement | null {
  const d = Math.abs(deltaMs);
  if (d <= JUDGE_WINDOWS.perfect) return 'perfect';
  if (d <= JUDGE_WINDOWS.great) return 'great';
  if (d <= JUDGE_WINDOWS.good) return 'good';
  return null;
}
