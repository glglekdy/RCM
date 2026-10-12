const SYMBOLS: Record<string, string> = {
  Semicolon: ';',
  ShiftLeft: 'L Shift',
  ShiftRight: 'R Shift',
  Space: 'Space',
};

/** 트랙 id → 그 트랙을 치는 키 code들 (주 키, 보조 키 순). 키 없는 트랙은 빈 배열. */
export type TrackKeymap = ReadonlyMap<string, readonly string[]>;

/** 화면에 보일 키 이름: `KeyD` → `D`, `Digit1` → `1`, `Semicolon` → `;`, `ShiftLeft` → `L Shift` */
export function keyLabel(code: string): string {
  if (code in SYMBOLS) return SYMBOLS[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return code;
}

/** 한 트랙의 키 이름. 키가 둘이면 `Space/B`, 없으면 `-`. */
export function keysLabel(codes: readonly string[] | undefined): string {
  return codes && codes.length > 0 ? codes.map(keyLabel).join('/') : '-';
}

/** 키 code에 배정된 트랙 id. 배정이 없으면 null. */
export function trackForCode(keymap: TrackKeymap, code: string): string | null {
  for (const [id, codes] of keymap) if (codes.includes(code)) return id;
  return null;
}

/**
 * 누른 키(keydown)가 어느 트랙인지. Ctrl/Alt/Meta를 누른 채면 단축키(Ctrl+S 등)이므로 null.
 * 떼는 키(keyup)는 조합키와 상관없이 `trackForCode`로 찾는다.
 */
export function trackForKey(
  keymap: TrackKeymap,
  e: { code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return trackForCode(keymap, e.code);
}

/**
 * 트랙마다 지금 눌린 키 code. 키가 둘인 트랙은 처음 누른 키에서 눌림, 둘 다 뗐을 때 뗌으로 친다
 * (한 키를 누른 채 다른 키를 눌렀다 떼도 한 번의 누름).
 */
export class HeldKeys {
  private readonly held = new Map<string, Set<string>>();

  /** 키를 누른다. 트랙이 새로 눌렸으면 true (같은 키의 반복이거나 다른 키로 이미 눌려 있으면 false). */
  down(track: string, code: string): boolean {
    const codes = this.held.get(track);
    if (codes) {
      codes.add(code);
      return false;
    }
    this.held.set(track, new Set([code]));
    return true;
  }

  /** 키를 뗀다. 트랙의 키가 모두 떼졌으면 true. */
  up(track: string, code: string): boolean {
    const codes = this.held.get(track);
    if (!codes?.delete(code)) return false;
    if (codes.size > 0) return false;
    this.held.delete(track);
    return true;
  }

  clear(): void {
    this.held.clear();
  }
}
