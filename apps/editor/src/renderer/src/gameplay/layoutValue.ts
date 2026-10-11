import { sanitizeLayout, type LAYOUT_LIMITS, type PlayfieldLayout } from '@rcm/playfield'

export type LayoutNumberKey = keyof typeof LAYOUT_LIMITS

/** 숫자 설정 하나를 바꾼 레이아웃. 범위 밖 값은 거부하지 않고 범위로 자른다. */
export function withLayoutValue(layout: PlayfieldLayout, key: LayoutNumberKey, value: number): PlayfieldLayout {
  return sanitizeLayout({ ...layout, [key]: value })
}
