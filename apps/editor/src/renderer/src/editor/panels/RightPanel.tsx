import { Gauge, LayoutGrid, Music, PanelRight, type LucideIcon } from 'lucide-react'
import { IconButton } from '../../ui'
import type { EditorState } from '../state/store'
import { useEditor, useStore } from '../state/useStore'
import { ChartPanel } from './ChartPanel'
import { SongPanel } from './SongPanel'
import { TimingPanel } from './TimingPanel'
import styles from './RightPanel.module.css'

const TABS: { value: EditorState['panelTab']; label: string; icon: LucideIcon }[] = [
  { value: 'song', label: '곡', icon: Music },
  { value: 'timing', label: 'BPM · 변속', icon: Gauge },
  { value: 'chart', label: '채보', icon: LayoutGrid }
]

export function RightPanel() {
  const store = useStore()
  const tab = useEditor((s) => s.panelTab)

  return (
    <aside className={styles.panel}>
      <div className={styles.head}>
        <div className={styles.tabs} role="tablist">
          {TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={value === tab}
              className={`${styles.tab} ${value === tab ? styles.selected : ''}`}
              onClick={() => store.set({ panelTab: value })}
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </div>
        <IconButton icon={PanelRight} label="패널 접기" onClick={() => store.set({ panelOpen: false })} />
      </div>
      <div className={styles.body}>
        {tab === 'song' && <SongPanel />}
        {tab === 'timing' && <TimingPanel />}
        {tab === 'chart' && <ChartPanel />}
      </div>
    </aside>
  )
}
