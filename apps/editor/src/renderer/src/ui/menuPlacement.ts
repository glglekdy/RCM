/** 화면 가장자리에서 메뉴를 띄우는 여백(px) */
export const MENU_EDGE = 8
/** 길게 눌러 띄운 메뉴와 누른 점 사이의 간격(px) */
export const MENU_GAP = 8

export interface Size {
  width: number
  height: number
}

export interface MenuPosition {
  left: number
  top: number
}

const clamp = (v: number, size: number, view: number) => Math.max(MENU_EDGE, Math.min(v, view - size - MENU_EDGE))

/**
 * 화면 좌표(x, y)에 띄울 메뉴의 왼쪽 위 위치. 화면 안(가장자리 여백 포함)으로 옮긴다.
 * avoidPoint: 길게 눌러 띄운 메뉴. 손가락이 있는 점을 덮지 않도록 점의 오른쪽 아래로 떨어뜨리고,
 * 화면 안으로 옮기다 점을 덮게 되면 점 위, 그다음 점 왼쪽에 둔다.
 * (오른쪽 아래가 점을 덮는 건 그쪽 자리가 모자라서이므로 점 아래·오른쪽은 다시 보지 않는다)
 */
export function placeMenu(x: number, y: number, menu: Size, viewport: Size, avoidPoint = false): MenuPosition {
  if (!avoidPoint) return { left: clamp(x, menu.width, viewport.width), top: clamp(y, menu.height, viewport.height) }

  const left = clamp(x + MENU_GAP, menu.width, viewport.width)
  const top = clamp(y + MENU_GAP, menu.height, viewport.height)
  const covers = (l: number, t: number) => x >= l && x <= l + menu.width && y >= t && y <= t + menu.height
  if (!covers(left, top)) return { left, top }

  const above = y - MENU_GAP - menu.height
  if (above >= MENU_EDGE) return { left, top: above }
  const leftSide = x - MENU_GAP - menu.width
  if (leftSide >= MENU_EDGE) return { left: leftSide, top }
  // 어디에도 들어가지 않는 작은 화면: 화면 안에만 둔다
  return { left, top }
}
