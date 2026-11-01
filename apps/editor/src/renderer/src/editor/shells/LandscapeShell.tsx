import { ChevronLeft, MoreHorizontal, PanelRight } from 'lucide-react'
import { IconButton, Menu } from '../../ui'
import { caps } from '../../ui/platform'
import { PANEL_TABS, PanelBody, PanelTabs } from '../panels/RightPanel'
import type { EditorState } from '../state/store'
import { useEditor, useStore } from '../state/useStore'
import { ChartPicker, NoteKindPicker, PlayControls, SnapPicker, ToolButtons, useFreeChart, WidthControl } from '../toolbar/items'
import { zoomIn, zoomOut } from '../toolbar/zoom'
import styles from './LandscapeShell.module.css'
import { moreMenuItems } from './moreMenu'
import type { ShellProps } from './shellProps'

type PanelTab = EditorState['panelTab']

/**
 * 폰 가로 편집 틀: 왼쪽 세로 줄(도구) · 가운데 타임라인 + 미니맵 · 오른쪽 패널.
 * 패널은 store의 panelOpen으로 접는다. 접으면 아이콘 줄만 남고, 아이콘을 누르면 그 탭으로 펼쳐진다.
 */
export function LandscapeShell({ actions, timeline, minimap, inert }: ShellProps) {
  const store = useStore()
  const panelOpen = useEditor((s) => s.panelOpen)
  const freeChart = useFreeChart()

  const openTab = (tab: PanelTab) => store.set({ panelTab: tab, panelOpen: true })

  return (
    // 테스트 플레이 화면 아래의 편집 화면은 Tab 등으로 포커스되지 않게 한다
    <div className={styles.stage} inert={inert}>
      <div className={styles.rail}>
        <div className={styles.group}>
          <IconButton icon={ChevronLeft} label="홈으로" onClick={actions.home} />
        </div>
        <div className={styles.group}>
          <ToolButtons />
        </div>
        <div className={`${styles.group} ${styles.snap}`}>
          <SnapPicker placement="down" />
        </div>
        <div className={styles.group}>
          <PlayControls actions={actions} />
        </div>
        <div className={`${styles.group} ${styles.more}`}>
          <Menu
            placement="up"
            trigger={
              <button type="button" title="더 보기" aria-label="더 보기">
                <MoreHorizontal size={18} />
              </button>
            }
            items={moreMenuItems(actions, {
              canChooseFolder: caps().chooseProjectFolder,
              includeUndo: true,
              zoomIn: () => store.set({ pxPerMs: zoomIn(store.getState().pxPerMs) }),
              zoomOut: () => store.set({ pxPerMs: zoomOut(store.getState().pxPerMs) })
            })}
          />
        </div>
      </div>

      <div className={styles.timeline}>{timeline}</div>
      {minimap}

      {panelOpen ? (
        <aside className={styles.panel}>
          <div className={styles.fixed}>
            <div className={styles.picker}>
              <ChartPicker variant="menu" placement="down" onSelect={actions.selectChart} onAdd={actions.addChart} />
            </div>
            {freeChart && (
              <div className={styles.group} title="클릭으로 그릴 노트 폭 (가로로 끌면 걸친 칸만큼)">
                <WidthControl />
              </div>
            )}
            {freeChart && (
              <div className={`${styles.group} ${styles.kinds}`}>
                <NoteKindPicker placement="down" />
              </div>
            )}
          </div>
          <div className={styles.head}>
            <PanelTabs />
            <IconButton icon={PanelRight} label="패널 접기" onClick={() => store.set({ panelOpen: false })} />
          </div>
          <div className={styles.body}>
            <PanelBody />
          </div>
        </aside>
      ) : (
        <div className={styles.strip}>
          {PANEL_TABS.map(({ value, label, icon: Icon }) => (
            <IconButton key={value} icon={Icon} label={label} onClick={() => openTab(value)} />
          ))}
          <IconButton icon={PanelRight} label="패널 펼치기" onClick={() => store.set({ panelOpen: true })} />
        </div>
      )}
    </div>
  )
}
