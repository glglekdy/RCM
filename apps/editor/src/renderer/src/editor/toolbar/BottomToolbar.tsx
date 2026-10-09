import { useState } from 'react'
import { MAX_LANES, MIN_LANES, SNAP_DIVISIONS } from '@rcm/core'
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
import { Button, IconButton, Menu, Modal, Row, SegmentedControl, TextField } from '../../ui'
import { addChart } from '../commands/charts'
import { getChart } from '../state/doc'
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
  const [adding, setAdding] = useState(false)

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
          <IconButton icon={Plus} label="난이도 추가" onClick={() => setAdding(true)} />
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
      {adding && (
        <AddChartDialog
          onClose={() => setAdding(false)}
          onAdded={(file) => {
            setAdding(false)
            onSelectChart(file)
          }}
        />
      )}
    </div>
  )
}

const LANE_OPTIONS = Array.from({ length: MAX_LANES - MIN_LANES + 1 }, (_, i) => ({
  value: MIN_LANES + i,
  label: `${MIN_LANES + i}키`
}))

interface AddChartDialogProps {
  onClose: () => void
  onAdded: (file: string) => void
}

/** 난이도 추가: 이름과 레인 수를 받아 새 채보를 만든다. 레인 수는 지금 난이도를 따른다. */
function AddChartDialog({ onClose, onAdded }: AddChartDialogProps) {
  const store = useStore()
  const [name, setName] = useState('')
  const [lanes, setLanes] = useState(() => {
    const s = store.getState()
    return getChart(s.doc, s.activeChart).lanes
  })

  const add = () => {
    const added = addChart(store.getState().doc, name, lanes)
    if (!added) return
    store.apply('난이도 추가', added.doc)
    onAdded(added.file)
  }

  return (
    <Modal
      open
      title="난이도 추가"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={name.trim() === ''} onClick={add}>
            추가
          </Button>
        </>
      }
    >
      <div
        className={styles.addForm}
        onKeyDown={(e) => {
          // 이름 칸에서 Enter = 추가 (세그먼트 버튼의 Enter는 그 버튼을 누르는 것)
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) add()
        }}
      >
        <Row label="이름">
          <TextField value={name} onChange={setName} placeholder="HARD" />
        </Row>
        <Row label="레인 수">
          <SegmentedControl options={LANE_OPTIONS} value={lanes} onChange={setLanes} />
        </Row>
      </div>
    </Modal>
  )
}
