import { Gauge, LayoutGrid, Music, PanelRight, type LucideIcon } from 'lucide-react'
import { IconButton } from '../../ui'
import type { EditorState } from '../state/store'
import { useEditor, useStore } from '../state/useStore'
import { ChartPanel } from './ChartPanel'
import { SongPanel } from './SongPanel'
import { TimingPanel } from './TimingPanel'
import styles from './RightPanel.module.css'

type PanelTab = EditorState['panelTab']

/** 탭 목록. 폰 가로의 접힌 아이콘 줄도 같은 목록을 쓴다 */
export const PANEL_TABS: { value: PanelTab; label: string; icon: LucideIcon }[] = [
  { value: 'song', label: '곡', icon: Music },
  { value: 'timing', label: 'BPM · 변속', icon: Gauge },
  { value: 'chart', label: '채보', icon: LayoutGrid }
]

/**
 * 패널 탭 줄. 누르면 그 탭이 선택된다.
 * onTabClick을 넘기면 기본 동작 대신 그것을 부른다 (폰의 바텀시트가 탭을 눌러 열고 닫을 때).
 */
export function PanelTabs({ onTabClick }: { onTabClick?: (tab: PanelTab) => void }) {
  const store = useStore()
  const tab = useEditor((s) => s.panelTab)

  return (
    <div className={styles.tabs} role="tablist">
      {PANEL_TABS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={value === tab}
          className={`${styles.tab} ${value === tab ? styles.selected : ''}`}
          onClick={() => (onTabClick ? onTabClick(value) : store.set({ panelTab: value }))}
        >
          <Icon size={16} strokeWidth={1.75} />
          {label}
        </button>
      ))}
    </div>
  )
}

/** 선택된 탭의 패널 내용 */
export function PanelBody() {
  const tab = useEditor((s) => s.panelTab)

  return (
    <>
      {tab === 'song' && <SongPanel />}
      {tab === 'timing' && <TimingPanel />}
      {tab === 'chart' && <ChartPanel />}
    </>
  )
}

export function RightPanel() {
  const store = useStore()

  return (
    <aside className={styles.panel}>
      <div className={styles.head}>
        <PanelTabs />
        <IconButton icon={PanelRight} label="패널 접기" onClick={() => store.set({ panelOpen: false })} />
      </div>
      <div className={styles.body}>
        <PanelBody />
      </div>
    </aside>
  )
}
