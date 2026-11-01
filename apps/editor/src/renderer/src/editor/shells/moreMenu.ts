import { fileMenuItems, type EditorActions } from '../editorActions'
import type { MenuItem } from '../../ui/Menu'

interface MoreMenuOptions {
  canChooseFolder: boolean
  /** 되돌리기·다시 하기를 메뉴 맨 앞에 넣는다 (막대에 해당 버튼이 없는 모양에서) */
  includeUndo: boolean
  zoomIn: () => void
  zoomOut: () => void
}

/** 폰 편집 화면의 ⋯ 메뉴: (되돌리기·다시 하기) · 파일 메뉴 · 편집 · 확대/축소 */
export function moreMenuItems(actions: EditorActions, opts: MoreMenuOptions): MenuItem[] {
  return [
    ...(opts.includeUndo
      ? [
          { label: '되돌리기', onSelect: actions.undo },
          { label: '다시 하기', onSelect: actions.redo }
        ]
      : []),
    ...fileMenuItems(actions, opts.canChooseFolder),
    { label: '복사', onSelect: () => actions.edit('copy') },
    { label: '잘라내기', onSelect: () => actions.edit('cut') },
    { label: '붙여넣기', onSelect: () => actions.edit('paste') },
    { label: '좌우 반전', onSelect: () => actions.edit('mirror') },
    { label: '삭제', onSelect: () => actions.edit('delete') },
    { label: '확대', onSelect: opts.zoomIn },
    { label: '축소', onSelect: opts.zoomOut }
  ]
}
