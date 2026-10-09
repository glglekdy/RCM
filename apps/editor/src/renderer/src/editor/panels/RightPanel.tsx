import { PanelRight } from 'lucide-react'
import { IconButton, SegmentedControl } from '../../ui'
import type { EditorState } from '../state/store'
import { useEditor, useStore } from '../state/useStore'
import { ChartPanel } from './ChartPanel'
import { SongPanel } from './SongPanel'
import { TimingPanel } from './TimingPanel'
import styles from './RightPanel.module.css'

const TABS: { value: EditorState['panelTab']; label: string }[] = [
  { value: 'song', label: '곡' },
  { value: 'timing', label: '타이밍' },
  { value: 'chart', label: '채보' }
]

export function RightPanel() {
  const store = useStore()
  const tab = useEditor((s) => s.panelTab)

  return (
    <aside className={styles.panel}>
      <div className={styles.head}>
        <SegmentedControl options={TABS} value={tab} onChange={(panelTab) => store.set({ panelTab })} />
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
