export type LayoutMode = 'desktop' | 'phone-portrait' | 'phone-landscape'

/** 창 크기로 화면 모드를 정한다. PC 앱(pinnedDesktop)은 늘 데스크톱이다. */
export function layoutMode(width: number, height: number, pinnedDesktop: boolean): LayoutMode {
  if (pinnedDesktop) return 'desktop'
  if (width < 700 && height >= width) return 'phone-portrait'
  if (height < 500 && width > height) return 'phone-landscape'
  return 'desktop'
}

/**
 * 크기가 바뀐 뒤의 모드. 입력 중에 폭은 그대로인데 높이만 줄어들면(화상 키보드)
 * 모드를 바꾸지 않고 유지한다. 폭이 바뀌면(회전) 다시 정한다.
 */
export function nextLayoutMode(
  prev: LayoutMode,
  prevWidth: number,
  width: number,
  height: number,
  opts: { pinnedDesktop: boolean; typing: boolean }
): LayoutMode {
  if (opts.typing && width === prevWidth) return prev
  return layoutMode(width, height, opts.pinnedDesktop)
}
