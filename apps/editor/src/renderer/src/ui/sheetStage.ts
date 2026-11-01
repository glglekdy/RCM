export type SheetStage = 'closed' | 'half' | 'full'

const STAGES: readonly SheetStage[] = ['closed', 'half', 'full']

/** 단계의 시트 높이(px). availablePx는 시트가 붙은 영역의 높이 */
export function sheetHeightPx(stage: SheetStage, availablePx: number): number {
  if (stage === 'closed') return 0
  if (stage === 'half') return Math.round(availablePx * 0.5)
  return availablePx
}

/** 손잡이를 dyPx(아래로 끌면 양수)만큼 끌었다 놓았을 때 가장 가까운 단계. 같은 거리면 작은 쪽 */
export function stageAfterDrag(start: SheetStage, dyPx: number, availablePx: number): SheetStage {
  const height = sheetHeightPx(start, availablePx) - dyPx
  let best: SheetStage = 'closed'
  let bestDistance = Infinity
  for (const stage of STAGES) {
    const distance = Math.abs(sheetHeightPx(stage, availablePx) - height)
    if (distance < bestDistance) {
      best = stage
      bestDistance = distance
    }
  }
  return best
}
