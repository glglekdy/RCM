import { useState } from 'react'
import { SNAP_DIVISIONS } from '@rcm/core'
import {
  ChevronDown,
  Circle,
  Eraser,
  Folder,
  Gamepad2,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  SquareDashedMousePointer
} from 'lucide-react'
import {
  Button,
  IconButton,
  isSubmitEnter,
  Menu,
  Modal,
  Row,
  TextField
} from '../../ui'
import { presetToChartTracks } from '../../../../shared/presets'
import { PresetPicker } from '../../presets/PresetPicker'
import { defaultPresetId, setLastPresetId, usePresets } from '../../presets/presetStore'
import { addChart } from '../commands/charts'
import { DEFAULT_PX_PER_MS } from '../minimap/geometry'
import { useEditor, useStore } from '../state/useStore'
import { clampZoom } from '../timeline/view'
import styles from './BottomToolbar.module.css'

/** 확대 컨트롤 한 번에 바뀌는 배율 */
const ZOOM_STEP = 1.25

interface BottomToolbarProps {
  onSelectChart: (file: string) => void
  onPlayPause: () => void
  onRecord: () => void
  onPlaytest: () => void
  onNewProject: () => void
  onOpenProject: () => void
  onSave: () => void
  onHome: () => void
  /** 테스트 플레이 화면에 덮여 있는 동안 포커스·클릭을 받지 않는다 */
  inert?: boolean
}

export function BottomToolbar({
  onSelectChart,
  onPlayPause,
  onRecord,
  onPlaytest,
  onNewProject,
  onOpenProject,
  onSave,
  onHome,
  inert
}: BottomToolbarProps) {
  const store = useStore()
  const charts = useEditor((s) => s.doc.charts)
  const activeChart = useEditor((s) => s.activeChart)
  const tool = useEditor((s) => s.tool)
  const snap = useEditor((s) => s.snap)
  const playing = useEditor((s) => s.playing)
  const recording = useEditor((s) => s.mode === 'recording')
  const pxPerMs = useEditor((s) => s.pxPerMs)
  const [adding, setAdding] = useState(false)

  return (
    <div className={styles.bar} inert={inert}>
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
        <div className={styles.group}>
          <IconButton
            icon={Minus}
            label="축소"
            onClick={() => store.set({ pxPerMs: clampZoom(pxPerMs / ZOOM_STEP) })}
          />
          <span className={styles.zoom}>{Math.round((pxPerMs / DEFAULT_PX_PER_MS) * 100)}%</span>
          <IconButton
            icon={Plus}
            label="확대"
            onClick={() => store.set({ pxPerMs: clampZoom(pxPerMs * ZOOM_STEP) })}
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
          {recording ? (
            <button
              type="button"
              className={styles.rec}
              title="녹음 끝내기 (Esc)"
              aria-label="녹음 끝내기 (Esc)"
              onClick={onRecord}
            >
              <span className={styles.recDot} />
              REC
            </button>
          ) : (
            <IconButton icon={Circle} label="녹음 (R)" onClick={onRecord} />
          )}
          <IconButton icon={Gamepad2} label="테스트 플레이 (F5)" onClick={onPlaytest} />
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

interface AddChartDialogProps {
  onClose: () => void
  onAdded: (file: string) => void
}

/** 난이도 추가: 이름과 트랙 프리셋을 받아 새 채보를 만든다. */
function AddChartDialog({ onClose, onAdded }: AddChartDialogProps) {
  const store = useStore()
  const [name, setName] = useState('')
  const presets = usePresets()
  const [presetId, setPresetId] = useState(() => defaultPresetId(presets))
  const chosenId = presets.some((p) => p.id === presetId) ? presetId : defaultPresetId(presets)

  const add = () => {
    const preset = presets.find((p) => p.id === chosenId)
    if (!preset) return
    const added = addChart(store.getState().doc, name, presetToChartTracks(preset))
    if (!added) return
    store.apply('난이도 추가', added.doc)
    void setLastPresetId(preset.id).catch(() => {
      // 마지막 선택을 기억하지 못해도 난이도는 추가됐다
    })
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
          // 이름 칸에서 Enter = 추가 (프리셋 목록의 Enter는 그 목록을 여는 것)
          if (isSubmitEnter(e) && e.target instanceof HTMLInputElement) add()
        }}
      >
        <Row label="이름">
          <TextField value={name} onChange={setName} placeholder="HARD" />
        </Row>
        <PresetPicker presets={presets} value={chosenId} onChange={setPresetId} />
      </div>
    </Modal>
  )
}
