/** `from`의 항목을 빼서 `to`(옮긴 뒤 위치)에 넣은 새 목록. */
export function moveIndex<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice()
  const [item] = out.splice(from, 1)
  out.splice(to, 0, item)
  return out
}

/**
 * 끄는 중 놓일 칸(행 사이 경계) 0..count. 칸 k는 k번째 행 바로 위.
 * 행 가운데를 넘으면 다음 칸이다.
 */
export function dropSlot(pointerY: number, listTop: number, rowHeight: number, count: number): number {
  const slot = Math.floor((pointerY - listTop) / rowHeight + 0.5)
  return Math.min(count, Math.max(0, slot))
}

/** 칸 번호를 `moveIndex`의 `to`로 바꾼다 (원래 자리를 빼고 센다). */
export function slotToIndex(from: number, slot: number): number {
  return slot > from ? slot - 1 : slot
}
