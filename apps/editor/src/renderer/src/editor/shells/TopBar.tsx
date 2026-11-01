import { ChevronLeft, MoreHorizontal, Redo2, Undo2 } from 'lucide-react'
import { IconButton, Menu } from '../../ui'
import { caps } from '../../ui/platform'
import type { EditorActions } from '../editorActions'
import { useStore } from '../state/useStore'
import { ChartPicker } from '../toolbar/items'
import { zoomIn, zoomOut } from '../toolbar/zoom'
import { moreMenuItems } from './moreMenu'
import styles from './TopBar.module.css'

interface TopBarProps {
  title: string
  dirty: boolean
  actions: EditorActions
  /** 테스트 플레이 화면에 덮여 있는 동안 포커스·클릭을 받지 않는다 */
  inert?: boolean
}

/** 폰 편집 화면 맨 위 막대(48px): 뒤로 · 제목 · 난이도 · 되돌리기 · 다시 하기 · 저장 상태 · ⋯ */
export function TopBar({ title, dirty, actions, inert }: TopBarProps) {
  const store = useStore()
  const dirtyLabel = '저장 안 한 변경이 있어요 — 눌러서 저장'
  const label = dirty ? dirtyLabel : '저장됨'

  return (
    <div className={styles.bar} inert={inert}>
      <IconButton icon={ChevronLeft} label="홈으로" onClick={actions.home} />
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.picker}>
        <ChartPicker variant="menu" placement="down" onSelect={actions.selectChart} onAdd={actions.addChart} />
      </div>
      <IconButton icon={Undo2} label="되돌리기" onClick={actions.undo} />
      <IconButton icon={Redo2} label="다시 하기" onClick={actions.redo} />
      <button type="button" className={styles.save} title={label} aria-label={label} onClick={actions.save}>
        <span className={`${styles.dot} ${dirty ? styles.dirty : ''}`} />
      </button>
      <Menu
        placement="down"
        align="right"
        trigger={
          <button type="button" className={styles.more} title="더 보기" aria-label="더 보기">
            <MoreHorizontal size={18} />
          </button>
        }
        items={moreMenuItems(actions, {
          canChooseFolder: caps().chooseProjectFolder,
          includeUndo: false,
          zoomIn: () => store.set({ pxPerMs: zoomIn(store.getState().pxPerMs) }),
          zoomOut: () => store.set({ pxPerMs: zoomOut(store.getState().pxPerMs) })
        })}
      />
    </div>
  )
}
