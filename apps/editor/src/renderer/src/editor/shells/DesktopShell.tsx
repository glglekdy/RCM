import { PanelRight } from 'lucide-react'
import { IconButton, TitleBar } from '../../ui'
import { RightPanel } from '../panels/RightPanel'
import { useEditor, useStore } from '../state/useStore'
import { BottomToolbar } from '../toolbar/BottomToolbar'
import styles from './DesktopShell.module.css'
import type { ShellProps } from './shellProps'

/** 데스크톱 편집 틀: 제목 줄 · (타임라인 + 미니맵 + 오른쪽 패널) · 하단 툴바 */
export function DesktopShell({ title, dirty, actions, timeline, minimap, inert }: ShellProps) {
  const store = useStore()
  const panelOpen = useEditor((s) => s.panelOpen)

  return (
    <>
      <TitleBar title={title} dirty={dirty} />
      {/* 테스트 플레이 화면 아래의 편집 화면은 Tab 등으로 포커스되지 않게 한다 */}
      <div className={styles.main} inert={inert}>
        <div className={styles.timeline}>
          {timeline}
          {!panelOpen && (
            <div className={styles.panelToggle}>
              <IconButton
                icon={PanelRight}
                label="패널 펼치기"
                onClick={() => store.set({ panelOpen: true })}
              />
            </div>
          )}
        </div>
        {minimap}
        {panelOpen && <RightPanel />}
      </div>
      <BottomToolbar actions={actions} inert={inert} />
    </>
  )
}
