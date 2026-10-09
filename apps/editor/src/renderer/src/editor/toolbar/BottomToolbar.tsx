import { SNAP_DIVISIONS } from '@rcm/core'
import {
  ChevronDown,
  Circle,
  Eraser,
  Folder,
  Gamepad2,
  Pause,
  Pencil,
  Play,
  Plus,
  SquareDashedMousePointer
} from 'lucide-react'
import { IconButton, Menu } from '../../ui'
import { useEditor, useStore } from '../state/useStore'
import styles from './BottomToolbar.module.css'

interface BottomToolbarProps {
  onSelectChart: (file: string) => void
  onPlayPause: () => void
  onNewProject: () => void
  onOpenProject: () => void
  onSave: () => void
  onHome: () => void
}

export function BottomToolbar({
  onSelectChart,
  onPlayPause,
  onNewProject,
  onOpenProject,
  onSave,
  onHome
}: BottomToolbarProps) {
  const store = useStore()
  const charts = useEditor((s) => s.doc.charts)
  const activeChart = useEditor((s) => s.activeChart)
  const tool = useEditor((s) => s.tool)
  const snap = useEditor((s) => s.snap)
  const playing = useEditor((s) => s.playing)

  return (
    <div className={styles.bar}>
      <div className={styles.side}>
        <div className={styles.group}>
          {charts.map((c) => (
            <button
              key={c.file}
              type="button"
              className={`${styles.tab} ${c.file === activeChart ? styles.selected : ''}`}
              onClick={() => onSelectChart(c.file)}
            >
              {c.chart.name}
            </button>
          ))}
          <IconButton icon={Plus} label="난이도 추가" />
        </div>
      </div>

      <div className={styles.center}>
        <div className={styles.group}>
          <IconButton
            icon={Pencil}
            label="그리기 (B)"
            active={tool === 'draw'}
            onClick={() => store.set({ tool: 'draw' })}
          />
          <IconButton
            icon={Eraser}
            label="지우기 (E)"
            active={tool === 'erase'}
            onClick={() => store.set({ tool: 'erase' })}
          />
          <IconButton
            icon={SquareDashedMousePointer}
            label="선택 (V)"
            active={tool === 'select'}
            onClick={() => store.set({ tool: 'select' })}
          />
        </div>
        <div className={styles.group}>
          <Menu
            placement="up"
            trigger={
              <button type="button" className={styles.dropdown} title="스냅">
                1/{snap}
                <ChevronDown size={14} />
              </button>
            }
            items={SNAP_DIVISIONS.map((d) => ({
              label: `1/${d}`,
              onSelect: () => store.set({ snap: d })
            }))}
          />
        </div>
      </div>

      <div className={`${styles.side} ${styles.end}`}>
        <div className={styles.group}>
          <IconButton
            icon={playing ? Pause : Play}
            label={playing ? '정지 (Space)' : '재생 (Space)'}
            onClick={onPlayPause}
          />
          <IconButton icon={Circle} label="녹음 (R)" />
          <IconButton icon={Gamepad2} label="테스트 플레이 (F5)" />
        </div>
        <div className={styles.group}>
          <Menu
            placement="up"
            align="right"
            trigger={
              <button type="button" className={styles.dropdown} title="파일">
                <Folder size={16} />
                <ChevronDown size={14} />
              </button>
            }
            items={[
              { label: '새 프로젝트', onSelect: onNewProject },
              { label: '열기', onSelect: onOpenProject },
              { label: '저장', onSelect: onSave },
              { label: '홈으로', onSelect: onHome }
            ]}
          />
        </div>
      </div>
    </div>
  )
}
