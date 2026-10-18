/** 자유형(모바일) 플레이 화면 배치 (그리기와 분리한 순수 함수). */

/** 폰 화면 방향. 세로는 9:16, 가로는 16:9 화면을 흉내 낸다 */
export type FreeAspect = 'portrait' | 'landscape';

/** 가로 화면에서 노트가 내려오는 판의 폭 비율 (화면 폭 대비). 세로는 거의 꽉 채운다 */
const FIELD_RATIO: Record<FreeAspect, number> = { portrait: 0.94, landscape: 0.7 };

export interface FreeFieldRect {
  /** 폰 화면 영역 */
  frameX: number;
  frameWidth: number;
  /** 노트 판 영역 */
  fieldX: number;
  fieldWidth: number;
  /** 칸 하나의 폭 */
  colPx: number;
}

/** 캔버스(width×height) 가운데에 폰 화면과 노트 판을 놓는다. 화면은 높이를 다 쓰고 폭이 모자라면 폭에 맞춘다. */
export function freeFieldRect(width: number, height: number, columns: number, aspect: FreeAspect): FreeFieldRect {
  const ratio = aspect === 'portrait' ? 9 / 16 : 16 / 9;
  const frameWidth = Math.max(1, Math.min(width, height * ratio));
  const frameX = (width - frameWidth) / 2;
  const fieldWidth = frameWidth * FIELD_RATIO[aspect];
  const fieldX = frameX + (frameWidth - fieldWidth) / 2;
  return { frameX, frameWidth, fieldX, fieldWidth, colPx: fieldWidth / Math.max(1, columns) };
}

/** 캔버스 좌표를 판정 좌표(칸 단위)로. 세로도 칸 폭을 단위로 잰다. */
export function pointToCell(rect: FreeFieldRect, x: number, y: number): { col: number; row: number } {
  return { col: (x - rect.fieldX) / rect.colPx, row: y / rect.colPx };
}
