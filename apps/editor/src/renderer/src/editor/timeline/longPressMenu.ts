import type { ContextMenuItem } from '../../ui/ContextMenu'
import type { EditorActions } from '../editorActions'
import type { TimelineTarget } from './target'

interface LongPressMenuOptions {
  hasSelection: boolean
  canPaste: boolean
  deleteMarker: (index: number) => void
}

/** 터치로 타임라인을 길게 눌렀을 때 뜨는 메뉴. 편집 명령은 단축키와 같은 경로(actions.edit)로 처리한다. */
export function longPressMenuItems(
  target: TimelineTarget,
  actions: EditorActions,
  opts: LongPressMenuOptions
): ContextMenuItem[] {
  const paste: ContextMenuItem = { label: '붙여넣기', onSelect: () => actions.edit('paste'), disabled: !opts.canPaste }
  if (target.kind === 'marker') {
    const { index } = target
    return [{ label: '마커 삭제', onSelect: () => opts.deleteMarker(index), danger: true }]
  }
  if (target.kind === 'none') return []
  // 선택이 없는 빈 곳은 붙여넣기만, 그 밖에는 편집 다섯 항목
  if (target.kind === 'empty' && !opts.hasSelection) return [paste]
  return [
    { label: '복사', onSelect: () => actions.edit('copy') },
    { label: '잘라내기', onSelect: () => actions.edit('cut') },
    paste,
    { label: '좌우 반전', onSelect: () => actions.edit('mirror') },
    { label: '삭제', onSelect: () => actions.edit('delete'), danger: true }
  ]
}
