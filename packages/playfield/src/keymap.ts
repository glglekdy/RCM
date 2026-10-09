const SYMBOLS: Record<string, string> = {
  Semicolon: ';',
  ShiftLeft: 'L Shift',
  ShiftRight: 'R Shift',
  Space: 'Space',
};

/** 화면에 보일 키 이름: `KeyD` → `D`, `Digit1` → `1`, `Semicolon` → `;`, `ShiftLeft` → `L Shift` */
export function keyLabel(code: string): string {
  if (code in SYMBOLS) return SYMBOLS[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return code;
}

/** 키 code에 배정된 트랙 id. keymap은 트랙 id → code. 배정이 없으면 null. */
export function trackForCode(keymap: ReadonlyMap<string, string | null>, code: string): string | null {
  for (const [id, c] of keymap) if (c === code) return id;
  return null;
}

/**
 * 누른 키(keydown)가 어느 트랙인지. Ctrl/Alt/Meta를 누른 채면 단축키(Ctrl+S 등)이므로 null.
 * 떼는 키(keyup)는 조합키와 상관없이 `trackForCode`로 찾는다.
 */
export function trackForKey(
  keymap: ReadonlyMap<string, string | null>,
  e: { code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return trackForCode(keymap, e.code);
}
