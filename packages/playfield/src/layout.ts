/** 게임플레이 화면 레이아웃 (사용자 설정). 크기는 모두 px. */

export type NoteShape = 'bar' | 'circle';

export interface PlayfieldLayout {
  /** 노트 너비 = 레인 너비 (모든 레인 같음) */
  laneWidth: number;
  /** 바 노트 두께. 동그라미 노트는 laneWidth를 따른다 */
  noteHeight: number;
  noteShape: NoteShape;
  judgeLineThickness: number;
  /** 화면 아래 끝에서 판정선 중심까지 */
  judgeLineFromBottom: number;
}

type NumericKey = Exclude<keyof PlayfieldLayout, 'noteShape'>;

export const DEFAULT_LAYOUT: Readonly<PlayfieldLayout> = Object.freeze({
  laneWidth: 64,
  noteHeight: 14,
  noteShape: 'bar',
  judgeLineThickness: 3,
  judgeLineFromBottom: 120,
});

export const LAYOUT_LIMITS: Readonly<Record<NumericKey, { min: number; max: number }>> = Object.freeze({
  laneWidth: { min: 30, max: 200 },
  noteHeight: { min: 4, max: 60 },
  judgeLineThickness: { min: 1, max: 20 },
  judgeLineFromBottom: { min: 0, max: 400 },
});

const NUMERIC_KEYS = Object.keys(LAYOUT_LIMITS) as NumericKey[];

/** 설정 파일·입력에서 온 값을 정리한다. 잘못된 키만 기본값, 숫자는 반올림 후 범위로 자른다. */
export function sanitizeLayout(raw: unknown): PlayfieldLayout {
  const layout: PlayfieldLayout = { ...DEFAULT_LAYOUT };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return layout;
  const obj = raw as Record<string, unknown>;
  for (const key of NUMERIC_KEYS) {
    const v = obj[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const { min, max } = LAYOUT_LIMITS[key];
    layout[key] = Math.min(max, Math.max(min, Math.round(v)));
  }
  if (obj.noteShape === 'bar' || obj.noteShape === 'circle') layout.noteShape = obj.noteShape;
  return layout;
}

export function layoutEquals(a: PlayfieldLayout, b: PlayfieldLayout): boolean {
  return a.noteShape === b.noteShape && NUMERIC_KEYS.every(k => a[k] === b[k]);
}
