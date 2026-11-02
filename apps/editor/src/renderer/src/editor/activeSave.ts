let active: (() => Promise<void>) | null = null

/** 편집 화면이 "변경이 있으면 저장" 함수를 등록한다. 화면을 떠나면 null. */
export function setActiveSave(fn: (() => Promise<void>) | null): void {
  active = fn
}

/** 등록된 저장 함수를 부른다. 없으면 바로 끝나고, 실패는 reject로 전달한다. */
export async function saveActiveIfDirty(): Promise<void> {
  if (active) await active()
}
