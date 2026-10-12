import type { CSSProperties } from 'react'

/** 차례로 등장하는 요소의 최대 순번. 이 뒤로는 같은 때에 나와 긴 목록도 0.4초 안에 다 보인다 */
export const MAX_STAGGER_INDEX = 12

/**
 * 차례로 등장시킬 요소의 style: 순번을 CSS 변수 `--i`로 넘긴다.
 * `.enter*` 클래스(global.css)가 `--i × --stagger`만큼 늦게 시작한다.
 */
export function stagger(index: number): CSSProperties {
  const i = Math.min(MAX_STAGGER_INDEX, Math.max(0, Math.floor(index)))
  return { '--i': i } as CSSProperties
}
