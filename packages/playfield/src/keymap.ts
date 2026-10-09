/** 레인 수별 기본 키 배치 (`KeyboardEvent.code`). 편집기 녹음과 테스트 플레이가 함께 쓴다. */
export const LANE_KEYS: Record<4 | 5 | 6 | 7 | 8, readonly string[]> = {
  4: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'],
  5: ['KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK'],
  6: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'],
  7: ['KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL'],
  8: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
};

const SYMBOLS: Record<string, string> = { Semicolon: ';' };

/** 화면에 보일 키 이름: `KeyD` → `D`, `Space` → `Space`, `Semicolon` → `;` */
export function laneKeyLabel(code: string): string {
  if (code in SYMBOLS) return SYMBOLS[code];
  return code.startsWith('Key') ? code.slice(3) : code;
}

/** 키 code가 몇 번째 레인인지. 그 레인 수의 배치에 없으면 null. */
export function laneForCode(lanes: number, code: string): number | null {
  const keys = (LANE_KEYS as Record<number, readonly string[] | undefined>)[lanes];
  const lane = keys ? keys.indexOf(code) : -1;
  return lane < 0 ? null : lane;
}

/**
 * 누른 키(keydown)가 몇 번째 레인인지. Ctrl/Alt/Meta를 누른 채면 단축키(Ctrl+S 등)이므로 null.
 * 떼는 키(keyup)는 조합키와 상관없이 `laneForCode`로 찾는다.
 */
export function laneForKey(
  lanes: number,
  e: { code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
): number | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return laneForCode(lanes, e.code);
}
